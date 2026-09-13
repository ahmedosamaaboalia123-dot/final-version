import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { listQuery } from '../src/modules/order-cases/order-cases.validation.js';
import {
  approveCancellationRequest,
  rejectCancellationRequest,
  retryPendingCashRefund,
  sweepPendingCashRefunds
} from '../src/modules/order-cases/order-cases.service.js';
import { cancelWholeOrder } from '../src/modules/orders/order.service.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'EMPLOYEE',
  requestId: 'test-request',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 1 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] }
});
const money = (value) => toDecimal128(value);
const pendingRequest = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'PENDING',
  orderId: id(),
  reason: 'تأخر الطلب',
  save: vi.fn(),
  ...overrides
});

describe('order cases and refund recovery', () => {
  it('caps admin case lists at ten items', () => {
    expect(listQuery.safeParse({}).success).toBe(true);
    expect(listQuery.safeParse({ limit: 11 }).success).toBe(false);
  });
  it('approves pending requests by executing the cancellation', async () => {
    const request = pendingRequest();
    const order = { _id: request.orderId, version: 3, status: 'PREPARING' };
    const cancelWhole = vi.fn(async () => ({
      order: { ...order, status: 'CANCELLED' },
      refundCase: { suggestedAmount: '120' }
    }));
    const result = await approveCancellationRequest(
      request._id,
      { expectedVersion: 0 },
      {
        ...infrastructure(),
        orderCaseModels: { OrderCancellationRequest: { findOne: () => chain(request) } },
        caseOrderModels: { Order: { findById: () => chain(order) } },
        caseOrderModule: { cancelWhole }
      }
    );
    expect(cancelWhole).toHaveBeenCalledWith(
      order._id,
      { reason: 'تأخر الطلب', expectedVersion: 3 },
      expect.anything()
    );
    expect(result.request.status).toBe('EXECUTED');
    expect(result.refundCase).toMatchObject({ suggestedAmount: '120' });
  });
  it('rejects approving settled or missing requests', async () => {
    await expect(
      approveCancellationRequest(
        id(),
        { expectedVersion: 0 },
        {
          ...infrastructure(),
          orderCaseModels: { OrderCancellationRequest: { findOne: () => chain(null) } }
        }
      )
    ).rejects.toMatchObject({ code: 'CASE_APPROVE_CONFLICT' });
  });
  it('sends out-for-delivery cancellations back to the store first', async () => {
    const request = pendingRequest();
    const order = { _id: request.orderId, version: 1, status: 'OUT_FOR_DELIVERY' };
    const cancelWhole = vi.fn(async () => ({}));
    await expect(
      approveCancellationRequest(
        request._id,
        { expectedVersion: 0 },
        {
          ...infrastructure(),
          orderCaseModels: { OrderCancellationRequest: { findOne: () => chain(request) } },
          caseOrderModels: { Order: { findById: () => chain(order) } },
          caseOrderModule: { cancelWhole }
        }
      )
    ).rejects.toMatchObject({ code: 'ORDER_RETURN_REQUIRED' });
    expect(cancelWhole).not.toHaveBeenCalled();
  });
  it('rejects pending requests with a recorded reason', async () => {
    const request = pendingRequest();
    const result = await rejectCancellationRequest(
      request._id,
      { reason: 'المطبخ بدأ بالفعل', expectedVersion: 0 },
      {
        ...infrastructure(),
        orderCaseModels: { OrderCancellationRequest: { findOne: () => chain(request) } }
      }
    );
    expect(result.request.status).toBe('REJECTED');
    await expect(
      rejectCancellationRequest(
        request._id,
        { reason: 'سبب آخر', expectedVersion: 0 },
        {
          ...infrastructure(),
          orderCaseModels: { OrderCancellationRequest: { findOne: () => chain(null) } }
        }
      )
    ).rejects.toMatchObject({ code: 'CASE_REJECT_CONFLICT' });
  });
  it('recovers pending refunds once cash is available', async () => {
    const refund = { _id: id(), version: 0, status: 'PENDING_CASH_REFUND', save: vi.fn() };
    const done = { payment: { _id: id() }, refund: { ...refund, status: 'COMPLETED' } };
    const complete = vi.fn(async () => done);
    const result = await retryPendingCashRefund(
      refund._id,
      { expectedRefundVersion: 0 },
      {
        ...infrastructure(),
        orderCaseModels: { CashRefund: { findOne: () => chain(refund) } },
        casePaymentsModule: { complete }
      }
    );
    expect(result.recovered).toBe(true);
    expect(result.refund.status).toBe('COMPLETED');
  });
  it('keeps refunds pending when the drawer still cannot pay', async () => {
    const refund = { _id: id(), version: 0, status: 'PENDING_CASH_REFUND', save: vi.fn() };
    const complete = vi.fn(async () => {
      throw Object.assign(new Error('no cash'), { code: 'DRAWER_INSUFFICIENT_CASH' });
    });
    const result = await retryPendingCashRefund(
      refund._id,
      { expectedRefundVersion: 0 },
      {
        ...infrastructure(),
        orderCaseModels: { CashRefund: { findOne: () => chain(refund) } },
        casePaymentsModule: { complete }
      }
    );
    expect(result).toMatchObject({ recovered: false });
    expect(result.refund.status).toBe('PENDING_CASH_REFUND');
  });
  it('sweeps every pending refund and reports the outcome', async () => {
    const first = { _id: id(), version: 0 };
    const second = { _id: id(), version: 0 };
    const models = {
      CashRefund: {
        find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [first, second] }) }) }),
        findOne: (query) => chain(query._id.equals(first._id) ? first : second)
      }
    };
    const context = {
      ...infrastructure(),
      orderCaseModels: models,
      casePaymentsModule: {
        complete: vi
          .fn()
          .mockResolvedValueOnce({ payment: {}, refund: {} })
          .mockRejectedValueOnce(
            Object.assign(new Error('no cash'), { code: 'OPEN_DRAWER_REQUIRED' })
          )
      }
    };
    const result = await sweepPendingCashRefunds(context);
    expect(result).toMatchObject({ attempted: 2, recovered: 1, stillPending: 1 });
  });
  it('closes active assignments when orders are cancelled', async () => {
    const order = {
      _id: id(),
      version: 0,
      status: 'READY',
      paidAmount: money('0'),
      refundedAmount: money('0'),
      total: money('0'),
      subtotal: money('0'),
      save: vi.fn()
    };
    const closeForCancelledOrder = vi.fn(async () => ({ closed: 1 }));
    await cancelWholeOrder(
      order._id,
      { reason: 'إلغاء إداري', expectedVersion: 0 },
      {
        ...infrastructure(),
        orderModels: {
          Order: { findOne: () => chain(order) },
          OrderItem: { find: () => chain([]) },
          OrderStatusEvent: { create: async ([v]) => [v] },
          OrderItemStatusEvent: { create: async ([v]) => [v] }
        },
        inventoryPort: { restore: async () => [] },
        orderCasesDeliveryPort: { closeForCancelledOrder }
      }
    );
    expect(closeForCancelledOrder).toHaveBeenCalledWith(
      order._id,
      'إلغاء إداري',
      expect.anything()
    );
  });
});
