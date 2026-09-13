import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { confirmBody } from '../src/modules/orders/order.validation.js';
import {
  appendOrderItems,
  applyOrderPaymentSummary,
  cancelOrderItem,
  cancelWholeOrder,
  completeTakeawayOrder,
  confirmNewOrder,
  getOrderForPayment,
  markOrderItemReady
} from '../src/modules/orders/order.service.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorId: id(),
  actorType: 'EMPLOYEE',
  requestId: 'test-request',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 7 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] },
  businessConfig: { taxRate: '0', deliveryFee: '0' }
});
const money = (value) => toDecimal128(value);
const snapshot = (overrides = {}) => ({
  product: { id: String(id()), name: 'لاتيه' },
  type: { id: String(id()), name: 'ساخن' },
  size: { id: String(id()), name: 'وسط' },
  unitSellingPrice: '60',
  addons: [],
  recipe: [{ materialId: String(id()), quantitySmall: '20', materialName: 'بن', unitName: 'جرام' }],
  recipeVersion: 1,
  ...overrides
});
const allocation = () => ({ _id: id(), inventoryValue: money('30') });
const orderDoc = (overrides = {}) => ({
  _id: id(),
  orderNumber: 'ORD-00000007',
  version: 0,
  status: 'CONFIRMED',
  fulfillmentType: 'TAKEAWAY',
  subtotal: money('0'),
  total: money('0'),
  paidAmount: money('0'),
  refundedAmount: money('0'),
  balanceDue: money('0'),
  eventSequence: 1,
  save: vi.fn(),
  ...overrides
});
const itemDoc = (overrides = {}) => ({
  _id: id(),
  orderId: id(),
  version: 0,
  status: 'PREPARING',
  allocationIds: [id()],
  lineSubtotal: money('120'),
  actualInventoryCost: money('60'),
  save: vi.fn(),
  ...overrides
});
const confirmInput = () => ({
  fulfillmentType: 'TAKEAWAY',
  customer: { name: 'عميل اختبار', phone: '01001234567' },
  items: [{ productId: String(id()), productSizeId: String(id()), quantity: 2 }]
});

describe('admin orders lifecycle', () => {
  it('rejects empty carts and dine-in without a table session', () => {
    expect(confirmBody.safeParse({ ...confirmInput(), items: [] }).success).toBe(false);
    expect(confirmBody.safeParse({ ...confirmInput(), fulfillmentType: 'DINE_IN' }).success).toBe(
      false
    );
    expect(confirmBody.safeParse(confirmInput()).success).toBe(true);
  });
  it('confirms an order priced from server snapshots with tracked inventory cost', async () => {
    const created = [];
    const order = orderDoc();
    const models = {
      Order: { create: async ([v]) => [{ ...order, ...v, save: order.save }] },
      OrderItem: {
        create: async ([v]) => {
          const item = { _id: id(), version: 0, save: vi.fn(), ...v };
          created.push(item);
          return [item];
        }
      },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const allocate = vi.fn(async () => ({ allocations: [allocation(), allocation()] }));
    const result = await confirmNewOrder(confirmInput(), {
      ...infrastructure(),
      orderModels: models,
      productsPort: { snapshot: async () => snapshot() },
      inventoryPort: { allocate }
    });
    expect(result.order.status).toBe('CONFIRMED');
    expect(result.order.orderNumber).toBe('ORD-00000007');
    expect(result.totals.total).toBe('120');
    expect(result.allocationsSummary.cost).toBe('60');
    expect(result.tracking.publicOrderNumber).toBe('ORD-00000007');
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
  });
  it('fails confirmation when stock cannot cover the recipe', async () => {
    const models = {
      Order: { create: async ([v]) => [{ _id: id(), save: vi.fn(), ...v }] },
      OrderItem: { create: async ([v]) => [{ _id: id(), save: vi.fn(), ...v }] },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const error = new Error('no stock');
    error.code = 'INSUFFICIENT_STOCK';
    await expect(
      confirmNewOrder(confirmInput(), {
        ...infrastructure(),
        orderModels: models,
        productsPort: { snapshot: async () => snapshot() },
        inventoryPort: {
          allocate: async () => {
            throw error;
          }
        }
      })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });
  it('marks cost partial when addons have no recipe cost', async () => {
    const order = orderDoc();
    const models = {
      Order: { create: async ([v]) => [{ ...order, ...v, save: order.save }] },
      OrderItem: { create: async ([v]) => [{ _id: id(), version: 0, save: vi.fn(), ...v }] },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const result = await confirmNewOrder(confirmInput(), {
      ...infrastructure(),
      orderModels: models,
      productsPort: {
        snapshot: async () =>
          snapshot({ addons: [{ id: String(id()), name: 'شوت إضافي', price: '10' }] })
      },
      inventoryPort: { allocate: async () => ({ allocations: [allocation()] }) }
    });
    expect(result.order.costCompleteness).toBe('PARTIAL');
    expect(result.totals.total).toBe('140');
  });
  it('returns a ready order to preparing when items are appended', async () => {
    const order = orderDoc({ status: 'READY', total: money('120'), subtotal: money('120') });
    const models = {
      Order: { findOne: () => chain(order) },
      OrderItem: {
        countDocuments: () => chain(1),
        create: async ([v]) => [{ _id: id(), version: 0, save: vi.fn(), ...v }],
        find: () => chain([itemDoc({ status: 'READY' }), itemDoc({ status: 'PREPARING' })])
      },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const result = await appendOrderItems(
      order._id,
      { items: confirmInput().items, expectedVersion: 0 },
      {
        ...infrastructure(),
        orderModels: models,
        productsPort: { snapshot: async () => snapshot() },
        inventoryPort: { allocate: async () => ({ allocations: [allocation()] }) }
      }
    );
    expect(result.order.status).toBe('PREPARING');
    expect(result.progress.total).toBe(2);
  });
  it('rejects appends on stale order versions', async () => {
    await expect(
      appendOrderItems(
        id(),
        { items: confirmInput().items, expectedVersion: 3 },
        {
          ...infrastructure(),
          orderModels: { Order: { findOne: () => chain(null) } },
          productsPort: { snapshot: vi.fn() },
          inventoryPort: { allocate: vi.fn() }
        }
      )
    ).rejects.toMatchObject({ code: 'ORDER_APPEND_CONFLICT' });
  });
  it('cancels an item with exact allocation restoration and updated totals', async () => {
    const order = orderDoc({ total: money('120'), subtotal: money('120') });
    const item = itemDoc({ orderId: order._id });
    const models = {
      Order: { findOne: () => chain(order) },
      OrderItem: {
        findOne: () => chain(item),
        find: () => chain([{ ...item, status: 'CANCELLED' }])
      },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const restore = vi.fn(async () => [{ alreadyRestored: false }]);
    const result = await cancelOrderItem(
      order._id,
      item._id,
      { reason: 'العميل غير رأيه', expectedOrderVersion: 0, expectedItemVersion: 0 },
      { ...infrastructure(), orderModels: models, inventoryPort: { restore } }
    );
    expect(result.item.status).toBe('CANCELLED');
    expect(result.restoredAllocations).toBe(1);
    expect(restore).toHaveBeenCalledWith(item.allocationIds, 'العميل غير رأيه', expect.anything());
    expect(result.progress.total).toBe(0);
    expect(result.order.status).toBe('CANCELLED');
  });
  it('rejects cancelling an item that is already being prepared elsewhere', async () => {
    await expect(
      cancelOrderItem(
        id(),
        id(),
        { reason: 'سبب كاف للتجربة', expectedOrderVersion: 0, expectedItemVersion: 5 },
        {
          ...infrastructure(),
          orderModels: {
            Order: { findOne: () => chain(orderDoc()) },
            OrderItem: { findOne: () => chain(null) }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'ORDER_ITEM_CANCEL_CONFLICT' });
  });
  it('cancels a whole paid order with a suggested refund case', async () => {
    const order = orderDoc({ paidAmount: money('120') });
    const first = itemDoc({ orderId: order._id });
    const second = itemDoc({ orderId: order._id });
    const models = {
      Order: { findOne: () => chain(order) },
      OrderItem: {
        find: (query) => chain(query.status ? [first, second] : [{ ...first, status: 'CANCELLED' }])
      },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const result = await cancelWholeOrder(
      order._id,
      { reason: 'إغلاق مبكر للفرع', expectedVersion: 0 },
      {
        ...infrastructure(),
        orderModels: models,
        inventoryPort: { restore: async () => [{ alreadyRestored: false }] }
      }
    );
    expect(result.order.status).toBe('CANCELLED');
    expect(result.restoredAllocations).toBe(2);
    expect(result.refundCase).toMatchObject({ suggestedAmount: '120' });
  });
  it('moves an order to ready when its last item is prepared', async () => {
    const order = orderDoc({ status: 'PREPARING' });
    const item = itemDoc({ orderId: order._id });
    const models = {
      Order: { findOne: () => chain(order) },
      OrderItem: {
        findOne: () => chain(item),
        find: () => chain([{ ...item, status: 'READY' }])
      },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const result = await markOrderItemReady(
      item._id,
      { expectedItemVersion: 0, expectedOrderVersion: 0 },
      { ...infrastructure(), orderModels: models }
    );
    expect(result.item.status).toBe('READY');
    expect(result.order.status).toBe('READY');
    expect(result.order.progress).toMatchObject({ ready: 1, total: 1 });
  });
  it('rejects ready transitions on stale versions', async () => {
    await expect(
      markOrderItemReady(
        id(),
        { expectedItemVersion: 9, expectedOrderVersion: 0 },
        {
          ...infrastructure(),
          orderModels: { OrderItem: { findOne: () => chain(null) } }
        }
      )
    ).rejects.toMatchObject({ code: 'ORDER_ITEM_READY_CONFLICT' });
  });
  it('refuses takeaway completion before the order is ready', async () => {
    await expect(
      completeTakeawayOrder(
        id(),
        { expectedVersion: 0 },
        {
          ...infrastructure(),
          orderModels: {
            Order: { findOne: () => chain(null) },
            OrderItem: { find: () => chain([]) }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'ORDER_COMPLETE_CONFLICT' });
  });
  it('completes a ready takeaway with payment and a final invoice', async () => {
    const order = orderDoc({
      status: 'READY',
      total: money('120'),
      subtotal: money('120'),
      balanceDue: money('120')
    });
    const models = {
      Order: { findOne: () => chain(order) },
      OrderItem: { find: () => chain([itemDoc({ orderId: order._id, status: 'READY' })]) },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const collect = vi.fn(async () => ({ payment: { _id: id() }, drawerTransaction: null }));
    const finalize = vi.fn(async () => ({ invoice: { _id: id() }, alreadyFinalized: false }));
    const result = await completeTakeawayOrder(
      order._id,
      { payment: { method: 'CASH', amount: '120' }, expectedVersion: 0 },
      {
        ...infrastructure(),
        orderModels: models,
        paymentsPort: { collect },
        invoicesPort: { finalize }
      }
    );
    expect(collect).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(result.order.status).toBe('COMPLETED');
    expect(result.invoice).toBeDefined();
  });
  it('guards payment reads with the stored order version', async () => {
    const order = orderDoc();
    const models = { Order: { findById: () => ({ lean: async () => order }) } };
    await expect(getOrderForPayment(order._id, 5, { orderModels: models })).rejects.toMatchObject({
      code: 'ORDER_VERSION_CONFLICT'
    });
    const read = await getOrderForPayment(order._id, 0, { orderModels: models });
    expect(read.orderNumber).toBe('ORD-00000007');
  });
  it('applies payment deltas to balance and payment status', async () => {
    const order = orderDoc({ total: money('120'), balanceDue: money('120') });
    const models = { Order: { findOne: () => chain(order) } };
    const updated = await applyOrderPaymentSummary(
      order._id,
      { paidDelta: '120', expectedVersion: 0 },
      { ...infrastructure(), orderModels: models }
    );
    expect(updated.balanceDue).toBe('0');
    expect(updated.paymentStatus).toBe('SETTLED');
    expect(order.save).toHaveBeenCalled();
  });
});
