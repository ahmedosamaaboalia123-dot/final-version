import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { collectBody, refundBody } from '../src/modules/payments/payment.validation.js';
import {
  collectCash,
  completePendingCashRefund,
  createCashRefund,
  settleCodPayment
} from '../src/modules/payments/payment.service.js';
import {
  buildInvoicePreview,
  calculateInvoiceChecksum,
  finalizeInvoice,
  recordInvoicePrint
} from '../src/modules/invoices/invoice.service.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'EMPLOYEE',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 1 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] }
});
const paidOrder = (overrides = {}) => ({
  orderNumber: 'O-1',
  balanceDue: '100',
  deliveryAssignmentId: null,
  assignedDelegateId: null,
  ...overrides
});

describe('cash payments and final invoice contracts', () => {
  it('accepts CASH only at validation boundary', () => {
    expect(
      collectBody.safeParse({
        method: 'CASH',
        collectionMode: 'DIRECT',
        amount: '50.25',
        expectedOrderVersion: 0
      }).success
    ).toBe(true);
    expect(
      collectBody.safeParse({
        method: 'CARD',
        collectionMode: 'DIRECT',
        amount: '50',
        expectedOrderVersion: 0
      }).success
    ).toBe(false);
  });
  it('rejects refund bodies with short reasons or non-positive amounts', () => {
    expect(
      refundBody.safeParse({ amount: '25', reason: 'إلغاء صنف', expectedPaymentVersion: 0 }).success
    ).toBe(true);
    expect(
      refundBody.safeParse({ amount: '0', reason: 'إلغاء صنف', expectedPaymentVersion: 0 }).success
    ).toBe(false);
    expect(
      refundBody.safeParse({ amount: '25', reason: 'لا', expectedPaymentVersion: 0 }).success
    ).toBe(false);
  });
  it('collects direct cash and posts exactly one drawer movement', async () => {
    const orderId = id(),
      paymentId = id(),
      save = vi.fn(async () => {}),
      drawer = vi.fn(async () => ({ transaction: { _id: id() } }));
    const result = await collectCash(
      orderId,
      { method: 'CASH', collectionMode: 'DIRECT', amount: '100', expectedOrderVersion: 0 },
      {
        ...infrastructure(),
        paymentModels: {
          OrderPayment: { create: async ([v]) => [{ _id: paymentId, version: 0, save, ...v }] },
          CashRefund: {}
        },
        ordersPort: {
          getForPayment: async () => paidOrder(),
          applyPaymentSummary: async () => ({ id: String(orderId), balanceDue: '0' })
        },
        drawerPort: { createSourceCashTransaction: drawer }
      }
    );
    expect(result.payment.status).toBe('SETTLED');
    expect(drawer).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('rejects COD collection without an active delivery assignment', async () => {
    const orderId = id();
    await expect(
      collectCash(
        orderId,
        { method: 'CASH', collectionMode: 'COD', amount: '100', expectedOrderVersion: 0 },
        {
          ...infrastructure(),
          paymentModels: { OrderPayment: { create: vi.fn() }, CashRefund: {} },
          ordersPort: {
            getForPayment: async () => paidOrder(),
            applyPaymentSummary: vi.fn()
          },
          drawerPort: { createSourceCashTransaction: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'COD_ASSIGNMENT_REQUIRED' });
  });
  it('rejects collection above the remaining order balance', async () => {
    const orderId = id();
    await expect(
      collectCash(
        orderId,
        { method: 'CASH', collectionMode: 'DIRECT', amount: '150', expectedOrderVersion: 0 },
        {
          ...infrastructure(),
          paymentModels: { OrderPayment: { create: vi.fn() }, CashRefund: {} },
          ordersPort: {
            getForPayment: async () => paidOrder({ balanceDue: '100' }),
            applyPaymentSummary: vi.fn()
          },
          drawerPort: { createSourceCashTransaction: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE' });
  });
  it('rejects settlement when the payment is not awaiting collection', async () => {
    await expect(
      settleCodPayment(
        id(),
        { expectedPaymentVersion: 0 },
        {
          ...infrastructure(),
          paymentModels: { OrderPayment: { findOne: () => chain(null) }, CashRefund: {} },
          drawerPort: { createSourceCashTransaction: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'COD_SETTLEMENT_CONFLICT' });
  });
  it('settles a collected COD payment exactly once with one drawer movement', async () => {
    const paymentId = id(),
      drawerTx = { _id: id() },
      payment = {
        _id: paymentId,
        orderId: id(),
        version: 2,
        amount: toDecimal128('80'),
        status: 'COLLECTED',
        save: vi.fn()
      },
      drawer = vi.fn(async () => ({ transaction: drawerTx }));
    const result = await settleCodPayment(
      paymentId,
      { expectedPaymentVersion: 2 },
      {
        ...infrastructure(),
        paymentModels: { OrderPayment: { findOne: () => chain(payment) }, CashRefund: {} },
        drawerPort: { createSourceCashTransaction: drawer }
      }
    );
    expect(result.payment.status).toBe('SETTLED');
    expect(result.drawerTransaction).toBe(drawerTx);
    expect(drawer).toHaveBeenCalledTimes(1);
    expect(payment.save).toHaveBeenCalledTimes(1);
  });
  it('rejects refunds above the refundable payment amount', async () => {
    const payment = {
      _id: id(),
      orderId: id(),
      version: 0,
      amount: toDecimal128('100'),
      refundedAmount: toDecimal128('80'),
      refundTransactionIds: [],
      save: vi.fn()
    };
    await expect(
      createCashRefund(
        payment._id,
        { amount: '25', reason: 'إلغاء صنف متأخر', expectedPaymentVersion: 0 },
        {
          ...infrastructure(),
          paymentModels: {
            OrderPayment: { findOne: () => chain(payment) },
            CashRefund: { create: vi.fn() }
          },
          ordersPort: { getForPayment: vi.fn(), applyPaymentSummary: vi.fn() },
          drawerPort: { createSourceCashTransaction: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAYMENT' });
  });
  it('creates a pending refund without changing paid totals when cash is unavailable', async () => {
    const payment = {
      _id: id(),
      orderId: id(),
      version: 0,
      amount: toDecimal128('100'),
      refundedAmount: toDecimal128('0'),
      refundTransactionIds: [],
      save: vi.fn()
    };
    const apply = vi.fn(),
      getSummary = vi.fn(async () => ({ total: '100' }));
    const result = await createCashRefund(
      payment._id,
      { amount: '25', reason: 'إلغاء صنف', expectedPaymentVersion: 0 },
      {
        ...infrastructure(),
        paymentModels: {
          OrderPayment: { findOne: () => chain(payment) },
          CashRefund: { create: async ([v]) => [{ _id: id(), version: 0, ...v }] }
        },
        ordersPort: { getForPayment: vi.fn(), applyPaymentSummary: apply, getSummary },
        drawerPort: {
          createSourceCashTransaction: async () => {
            const error = new Error('no shift');
            error.code = 'OPEN_DRAWER_REQUIRED';
            throw error;
          }
        }
      }
    );
    expect(result.refund.status).toBe('PENDING_CASH_REFUND');
    expect(payment.save).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
  it('completes a pending refund with one drawer movement and updated payment totals', async () => {
    const refundId = id(),
      paymentId = id(),
      drawerTx = { _id: id() },
      refund = {
        _id: refundId,
        paymentId,
        orderId: id(),
        version: 0,
        refundNo: 'REF-00000001',
        amount: toDecimal128('25'),
        status: 'PENDING_CASH_REFUND',
        save: vi.fn()
      },
      payment = {
        _id: paymentId,
        orderId: refund.orderId,
        version: 1,
        amount: toDecimal128('100'),
        refundedAmount: toDecimal128('0'),
        refundTransactionIds: [],
        save: vi.fn()
      },
      drawer = vi.fn(async () => ({ transaction: drawerTx })),
      apply = vi.fn(async () => ({ id: String(refund.orderId), balanceDue: '75' }));
    const result = await completePendingCashRefund(
      refundId,
      { expectedRefundVersion: 0 },
      {
        ...infrastructure(),
        paymentModels: {
          OrderPayment: { findById: () => chain(payment) },
          CashRefund: { findOne: () => chain(refund) }
        },
        ordersPort: { getForPayment: vi.fn(), applyPaymentSummary: apply },
        drawerPort: { createSourceCashTransaction: drawer }
      }
    );
    expect(result.refund.status).toBe('COMPLETED');
    expect(result.payment.status).toBe('PARTIALLY_REFUNDED');
    expect(drawer).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('returns the same finalized invoice without creating a duplicate', async () => {
    const orderId = id(),
      existing = { _id: id(), invoiceNumber: 'INV-00000001' },
      create = vi.fn(),
      getPayload = vi.fn();
    const result = await finalizeInvoice(orderId, {
      ...infrastructure(),
      invoiceModel: { findOne: () => chain(existing), create },
      ordersPort: { getInvoicePayload: getPayload }
    });
    expect(result.invoice).toBe(existing);
    expect(result.alreadyFinalized).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(getPayload).not.toHaveBeenCalled();
  });
  it('survives a concurrent finalize race via the order unique index', async () => {
    const orderId = id(),
      raced = { _id: id(), invoiceNumber: 'INV-00000002' },
      duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    const result = await finalizeInvoice(orderId, {
      ...infrastructure(),
      invoiceModel: {
        findOne: vi.fn().mockReturnValueOnce(chain(null)).mockReturnValueOnce(chain(raced)),
        create: async () => {
          throw duplicate;
        }
      },
      ordersPort: {
        getInvoicePayload: async () => ({
          order: { status: 'COMPLETED' },
          totals: { subtotal: '100', discount: '0', tax: '0', deliveryFee: '0', total: '100' }
        })
      }
    });
    expect(result.invoice).toBe(raced);
    expect(result.alreadyFinalized).toBe(true);
  });
  it('rejects non-decimal invoice totals', async () => {
    const orderId = id();
    await expect(
      finalizeInvoice(orderId, {
        ...infrastructure(),
        invoiceModel: { findOne: () => chain(null), create: vi.fn() },
        ordersPort: {
          getInvoicePayload: async () => ({
            order: { status: 'COMPLETED' },
            totals: { subtotal: 100, discount: '0', tax: '0', deliveryFee: '0', total: '100' }
          })
        }
      })
    ).rejects.toMatchObject({ code: 'INVALID_INVOICE_TOTALS', status: 422 });
  });
  it('records invoice prints as a counter without changing financial totals', async () => {
    const invoiceId = id(),
      printed = {
        _id: invoiceId,
        invoiceNumber: 'INV-00000001',
        payloadSafe: { totals: { total: '100' } },
        checksum: 'abc',
        printCount: 2
      };
    const result = await recordInvoicePrint(invoiceId, {
      ...infrastructure(),
      invoiceModel: { findOneAndUpdate: async () => printed }
    });
    expect(result.printCount).toBe(2);
    expect(result.payloadSafe.totals.total).toBe('100');
  });
  it('builds the same preview checksum regardless of order totals source', async () => {
    const orderId = id(),
      payload = { order: { id: String(orderId) }, totals: { total: '100' } };
    const preview = await buildInvoicePreview(orderId, {
      ...infrastructure(),
      ordersPort: { getInvoicePayload: async () => payload }
    });
    expect(preview.final).toBe(false);
    expect(preview.checksum).toBe(calculateInvoiceChecksum(payload));
  });
  it('produces the same checksum for objects with different key order', () => {
    expect(calculateInvoiceChecksum({ b: 2, a: { d: 4, c: 3 } })).toBe(
      calculateInvoiceChecksum({ a: { c: 3, d: 4 }, b: 2 })
    );
  });
});
