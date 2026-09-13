import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createDelegateBody } from '../src/modules/delivery/delivery.validation.js';
import {
  adminConfirmDelivery,
  assignDelegate,
  confirmDeliveryReceipt,
  createDelegate,
  handoverAssignment,
  reassignDelivery,
  recordFailedAttempt,
  recordWhatsappShare,
  returnDeliveryToStore,
  settleAssignmentCash
} from '../src/modules/delivery/delivery.service.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'EMPLOYEE',
  requestId: 'test-request',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 3 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] }
});
const money = (value) => toDecimal128(value);
const delegateDoc = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'ACTIVE',
  maxActiveOrders: 5,
  activeOrderCount: 0,
  deliveredCount: 0,
  save: vi.fn(),
  ...overrides
});
const readyOrder = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'READY',
  fulfillmentType: 'DELIVERY',
  balanceDue: money('80'),
  customerReceiptStatus: 'LOCKED',
  eventSequence: 2,
  save: vi.fn(),
  ...overrides
});
const assignmentDoc = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'ASSIGNED',
  orderId: id(),
  delegateId: id(),
  cashExpected: money('80'),
  cashSettledTotal: money('0'),
  save: vi.fn(),
  ...overrides
});
const modelsFor = (delivery, orders = {}) => ({
  ...infrastructure(),
  deliveryModels: {
    Delegate: delivery.Delegate,
    DeliveryAssignment: delivery.DeliveryAssignment,
    DeliveryConfirmation: delivery.DeliveryConfirmation ?? {
      create: async ([v]) => [{ _id: id(), ...v }]
    }
  },
  deliveryOrderModels: {
    Order: orders.Order,
    OrderStatusEvent: orders.OrderStatusEvent ?? { create: async ([v]) => [v] }
  }
});

describe('delegates and delivery', () => {
  it('validates delegate identity at the boundary', () => {
    expect(createDelegateBody.safeParse({ name: 'س', phone: '01001234567' }).success).toBe(false);
    expect(createDelegateBody.safeParse({ name: 'مندوب أول', phone: '01001234567' }).success).toBe(
      true
    );
  });
  it('rejects duplicate delegate phones', async () => {
    await expect(
      createDelegate(
        { name: 'مندوب مكرر', phone: '01001234567' },
        {
          ...infrastructure(),
          deliveryModels: {
            Delegate: {
              findOne: () => chain(delegateDoc()),
              create: vi.fn()
            }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'DELEGATE_PHONE_EXISTS' });
  });
  it('assigns ready delivery orders and tracks capacity', async () => {
    const order = readyOrder();
    const delegate = delegateDoc();
    let stored;
    const context = modelsFor(
      {
        Delegate: { findById: () => chain(delegate) },
        DeliveryAssignment: {
          findOne: () => chain(null),
          create: async ([v]) => {
            stored = { _id: id(), version: 0, status: 'ASSIGNED', save: vi.fn(), ...v };
            return [stored];
          }
        }
      },
      { Order: { findOne: () => chain(order) } }
    );
    const result = await assignDelegate(
      order._id,
      { delegateId: delegate._id, expectedOrderVersion: 0 },
      context
    );
    expect(result.assignment.assignmentNo).toBe('DA-00000003');
    expect(result.assignment.status).toBe('ASSIGNED');
    expect(String(order.assignedDelegateId)).toBe(String(delegate._id));
    expect(delegate.activeOrderCount).toBe(1);
    expect(stored).toBeDefined();
  });
  it('refuses assignment for non-ready orders and full delegates', async () => {
    await expect(
      assignDelegate(
        id(),
        { delegateId: id(), expectedOrderVersion: 0 },
        modelsFor(
          { Delegate: {}, DeliveryAssignment: {} },
          { Order: { findOne: () => chain(null) } }
        )
      )
    ).rejects.toMatchObject({ code: 'ORDER_ASSIGN_CONFLICT' });
    const order = readyOrder();
    await expect(
      assignDelegate(
        order._id,
        { delegateId: id(), expectedOrderVersion: 0 },
        modelsFor(
          {
            Delegate: { findById: () => chain(delegateDoc({ activeOrderCount: 5 })) },
            DeliveryAssignment: { findOne: () => chain(null) }
          },
          { Order: { findOne: () => chain(order) } }
        )
      )
    ).rejects.toMatchObject({ code: 'DELEGATE_AT_CAPACITY' });
  });
  it('blocks a second active assignment for the same order', async () => {
    const order = readyOrder();
    await expect(
      assignDelegate(
        order._id,
        { delegateId: id(), expectedOrderVersion: 0 },
        modelsFor(
          {
            Delegate: { findById: () => chain(delegateDoc()) },
            DeliveryAssignment: { findOne: () => chain(assignmentDoc({ orderId: order._id })) }
          },
          { Order: { findOne: () => chain(order) } }
        )
      )
    ).rejects.toMatchObject({ code: 'ORDER_ALREADY_ASSIGNED' });
  });
  it('hands over to the delegate with receipt availability', async () => {
    const order = readyOrder();
    const assignment = assignmentDoc({ orderId: order._id });
    const context = modelsFor(
      { Delegate: {}, DeliveryAssignment: { findOne: () => chain(assignment) } },
      {
        Order: { findById: () => chain(order) },
        OrderStatusEvent: { create: async ([v]) => [v] }
      }
    );
    const result = await handoverAssignment(assignment._id, { expectedVersion: 0 }, context);
    expect(result.assignment.status).toBe('IN_PROGRESS');
    expect(result.order.status).toBe('OUT_FOR_DELIVERY');
    expect(result.order.customerReceiptStatus).toBe('AVAILABLE');
  });
  it('rejects handover for stale or misplaced assignments', async () => {
    await expect(
      handoverAssignment(
        id(),
        { expectedVersion: 0 },
        modelsFor(
          { Delegate: {}, DeliveryAssignment: { findOne: () => chain(null) } },
          { Order: {} }
        )
      )
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_HANDOVER_CONFLICT' });
  });
  it('reassigns by closing the old leg and opening a new one', async () => {
    const order = readyOrder({ status: 'OUT_FOR_DELIVERY' });
    const previous = assignmentDoc({ orderId: order._id, status: 'IN_PROGRESS' });
    const incoming = delegateDoc();
    const oldDelegate = delegateDoc({ activeOrderCount: 1 });
    let stored;
    const context = modelsFor(
      {
        Delegate: {
          findById: (delegateId) =>
            chain(String(delegateId) === String(incoming._id) ? incoming : oldDelegate)
        },
        DeliveryAssignment: {
          findOne: () => chain(previous),
          create: async ([v]) => {
            stored = { _id: id(), version: 0, save: vi.fn(), ...v };
            return [stored];
          }
        }
      },
      { Order: { findById: () => chain(order) } }
    );
    const result = await reassignDelivery(
      previous._id,
      { delegateId: incoming._id, reason: 'عطل دراجة', expectedVersion: 0 },
      context
    );
    expect(previous.status).toBe('REASSIGNED');
    expect(result.assignment.status).toBe('IN_PROGRESS');
    expect(String(order.currentDeliveryAssignmentId)).toBe(String(stored._id));
    expect(incoming.activeOrderCount).toBe(1);
    expect(oldDelegate.activeOrderCount).toBe(0);
  });
  it('records failed attempts without moving the order', async () => {
    const order = readyOrder({ status: 'OUT_FOR_DELIVERY' });
    const assignment = assignmentDoc({ orderId: order._id, status: 'IN_PROGRESS' });
    const context = modelsFor(
      { Delegate: {}, DeliveryAssignment: { findOne: () => chain(assignment) } },
      { Order: { findById: () => chain(order) } }
    );
    const result = await recordFailedAttempt(
      assignment._id,
      { reason: 'لا يرد على الهاتف', expectedVersion: 0 },
      context
    );
    expect(result.assignment.status).toBe('FAILED');
    expect(result.order.status).toBe('OUT_FOR_DELIVERY');
  });
  it('returns the order to ready with a locked receipt', async () => {
    const order = readyOrder({ status: 'OUT_FOR_DELIVERY', customerReceiptStatus: 'AVAILABLE' });
    const assignment = assignmentDoc({ orderId: order._id, status: 'IN_PROGRESS' });
    const delegate = delegateDoc({ activeOrderCount: 1 });
    const context = modelsFor(
      {
        Delegate: { findById: () => chain(delegate) },
        DeliveryAssignment: { findOne: () => chain(assignment) }
      },
      {
        Order: { findById: () => chain(order) },
        OrderStatusEvent: { create: async ([v]) => [v] }
      }
    );
    const result = await returnDeliveryToStore(
      assignment._id,
      { reason: 'عنوان خاطئ', expectedVersion: 0 },
      context
    );
    expect(result.assignment.status).toBe('RETURNED');
    expect(result.order.status).toBe('READY');
    expect(result.order.customerReceiptStatus).toBe('LOCKED');
    expect(delegate.activeOrderCount).toBe(0);
  });
  it('confirms customer receipt with a stored confirmation record', async () => {
    const order = {
      ...readyOrder(),
      status: 'OUT_FOR_DELIVERY',
      customerReceiptStatus: 'AVAILABLE',
      customerId: id(),
      currentDeliveryAssignmentId: id(),
      total: money('80'),
      subtotal: money('80')
    };
    order.save = vi.fn();
    const assignment = assignmentDoc({
      _id: order.currentDeliveryAssignmentId,
      orderId: order._id,
      status: 'IN_PROGRESS'
    });
    const delegate = delegateDoc({ activeOrderCount: 1 });
    let storedConfirmation;
    const finalize = vi.fn(async () => ({ invoice: { _id: id() }, alreadyFinalized: false }));
    const recordCompletion = vi.fn(async () => ({}));
    const context = {
      ...modelsFor(
        {
          Delegate: { findById: () => chain(delegate) },
          DeliveryAssignment: { findById: () => chain(assignment) },
          DeliveryConfirmation: {
            create: async ([v]) => {
              storedConfirmation = { _id: id(), ...v };
              return [storedConfirmation];
            }
          }
        },
        {
          Order: { findOne: () => chain(order) },
          OrderStatusEvent: { create: async ([v]) => [v] }
        }
      ),
      invoicesPort: { finalize },
      customersPort: { recordCompletion }
    };
    const result = await confirmDeliveryReceipt(
      order._id,
      { expectedVersion: 0, receivedBy: 'CUSTOMER', credentialId: id() },
      context
    );
    expect(result.order.status).toBe('COMPLETED');
    expect(result.order.customerReceiptStatus).toBe('CONFIRMED');
    expect(storedConfirmation.source).toBe('CUSTOMER');
    expect(result.assignment.status).toBe('DELIVERED');
    expect(delegate.deliveredCount).toBe(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(recordCompletion).toHaveBeenCalledTimes(1);
  });
  it('requires a reason for admin overrides', async () => {
    await expect(
      confirmDeliveryReceipt(
        id(),
        { expectedVersion: 0, receivedBy: 'ADMIN_OVERRIDE' },
        {
          ...infrastructure(),
          deliveryModels: {},
          deliveryOrderModels: {}
        }
      )
    ).rejects.toMatchObject({ code: 'ADMIN_OVERRIDE_REASON_REQUIRED' });
  });
  it('settles delegate cash exactly once against collected COD', async () => {
    const assignment = assignmentDoc({ status: 'DELIVERED' });
    const payment = {
      id: String(id()),
      collectionMode: 'COD',
      status: 'COLLECTED',
      version: 0,
      amount: '80'
    };
    const settle = vi.fn(async () => ({ payment, drawerTransaction: { _id: id() } }));
    const context = {
      ...modelsFor({
        Delegate: {},
        DeliveryAssignment: { findOne: () => chain(assignment) }
      }),
      deliveryPaymentsPort: {
        list: async () => ({ items: [payment] }),
        settle
      }
    };
    const result = await settleAssignmentCash(assignment._id, { expectedVersion: 0 }, context);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(result.outstandingCash).toBe('0');
    expect(result.drawerTransactions).toHaveLength(1);
  });
  it('refuses settlement with no pending custodial cash', async () => {
    const assignment = assignmentDoc({ status: 'DELIVERED' });
    const context = {
      ...modelsFor({
        Delegate: {},
        DeliveryAssignment: { findOne: () => chain(assignment) }
      }),
      deliveryPaymentsPort: {
        list: async () => ({ items: [] }),
        settle: vi.fn()
      }
    };
    await expect(
      settleAssignmentCash(assignment._id, { expectedVersion: 0 }, context)
    ).rejects.toMatchObject({ code: 'CASH_NOTHING_TO_SETTLE' });
  });
  it('logs whatsapp shares as links without claiming delivery', async () => {
    const assignment = assignmentDoc({ status: 'IN_PROGRESS' });
    const context = modelsFor({
      Delegate: {},
      DeliveryAssignment: { findOne: async () => assignment }
    });
    const result = await recordWhatsappShare(assignment._id, { expectedVersion: 0 }, context);
    expect(result).toMatchObject({ recorded: true, assignmentId: String(assignment._id) });
  });
  it('overrides delivery confirmation administratively with a reason', async () => {
    const order = {
      ...readyOrder(),
      status: 'OUT_FOR_DELIVERY',
      customerReceiptStatus: 'AVAILABLE',
      customerId: id(),
      currentDeliveryAssignmentId: id(),
      total: money('80'),
      subtotal: money('80')
    };
    order.save = vi.fn();
    const assignment = assignmentDoc({
      _id: order.currentDeliveryAssignmentId,
      orderId: order._id,
      status: 'IN_PROGRESS'
    });
    let storedConfirmation;
    const context = {
      ...modelsFor(
        {
          Delegate: { findById: () => chain(delegateDoc()) },
          DeliveryAssignment: {
            findOne: (query) =>
              chain(query._id && String(query._id) === String(assignment._id) ? assignment : null),
            findById: () => chain(assignment)
          },
          DeliveryConfirmation: {
            create: async ([v]) => {
              storedConfirmation = { _id: id(), ...v };
              return [storedConfirmation];
            }
          }
        },
        {
          Order: {
            findOne: () => chain(order),
            findById: () => chain(order)
          },
          OrderStatusEvent: { create: async ([v]) => [v] }
        }
      ),
      invoicesPort: { finalize: async () => ({ invoice: { _id: id() } }) },
      customersPort: { recordCompletion: async () => ({}) }
    };
    const result = await adminConfirmDelivery(
      assignment._id,
      { reason: 'العميل أكد هاتفيًا', expectedVersion: 0 },
      context
    );
    expect(result.order.customerReceiptStatus).toBe('ADMIN_CONFIRMED');
    expect(storedConfirmation.source).toBe('ADMIN_OVERRIDE');
    expect(storedConfirmation.overrideReason).toBe('العميل أكد هاتفيًا');
  });
});
