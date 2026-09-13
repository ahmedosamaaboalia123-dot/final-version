import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { screenQuery } from '../src/modules/preparation/preparation.validation.js';
import {
  getPreparationOrderDetails,
  getPreparationScreen
} from '../src/modules/preparation/preparation.queries.js';
import { confirmNewOrder } from '../src/modules/orders/order.service.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId();
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
const orderRow = (overrides = {}) => ({
  _id: id(),
  orderNumber: 'ORD-00000007',
  fulfillmentType: 'TAKEAWAY',
  customerName: 'عميل اختبار',
  customerPhone: '01001234567',
  total: money('120'),
  status: 'PREPARING',
  createdAt: new Date('2026-09-11T10:00:00Z'),
  version: 0,
  ...overrides
});
const itemRow = (overrides = {}) => ({
  _id: id(),
  orderId: id(),
  lineNo: 1,
  productName: 'لاتيه',
  typeName: 'ساخن',
  sizeName: 'وسط',
  quantity: 2,
  notes: null,
  status: 'PREPARING',
  recipeSnapshot: [
    { materialId: id(), quantitySmall: money('40'), materialName: 'بن', unitName: 'جرام' }
  ],
  version: 0,
  ...overrides
});

describe('preparation screens', () => {
  it('validates group and tab filters with a ten-item ceiling', () => {
    expect(screenQuery.safeParse({}).success).toBe(true);
    expect(screenQuery.safeParse({ group: 'online', tab: 'current' }).success).toBe(true);
    expect(screenQuery.safeParse({ group: 'dine', tab: 'current' }).success).toBe(false);
    expect(screenQuery.safeParse({ limit: 11 }).success).toBe(false);
  });
  it('lists current online orders oldest first with item progress', async () => {
    const first = orderRow();
    const second = orderRow({ _id: id(), orderNumber: 'ORD-00000008', status: 'READY' });
    let capturedQuery;
    const models = {
      Order: {
        find: (query) => {
          capturedQuery = query;
          return {
            sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [first] }) }) })
          };
        },
        countDocuments: async () => 1
      },
      OrderItem: {
        find: () => ({
          sort: () => ({
            lean: async () => [
              itemRow({ orderId: first._id }),
              itemRow({ orderId: first._id, status: 'READY' })
            ]
          })
        })
      }
    };
    const result = await getPreparationScreen(
      { group: 'online', tab: 'current', page: 1, limit: 10 },
      { orderModels: models }
    );
    expect(capturedQuery).toMatchObject({
      fulfillmentType: { $in: ['TAKEAWAY', 'DELIVERY'] },
      status: { $in: ['CONFIRMED', 'PREPARING'] }
    });
    expect(result.summary).toMatchObject({ current: 1, ready: 1 });
    expect(result.items[0].progress).toMatchObject({ ready: 1, total: 2 });
    expect(second.orderNumber).toBe('ORD-00000008');
  });
  it('lists ready orders without current ones', async () => {
    let capturedQuery;
    const models = {
      Order: {
        find: (query) => {
          capturedQuery = query;
          return { sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) };
        },
        countDocuments: async () => 0
      },
      OrderItem: { find: () => ({ sort: () => ({ lean: async () => [] }) }) }
    };
    const result = await getPreparationScreen(
      { group: 'online', tab: 'ready', page: 1, limit: 10 },
      { orderModels: models }
    );
    expect(capturedQuery).toMatchObject({ status: 'READY' });
    expect(result.items).toHaveLength(0);
  });
  it('returns an empty tables group before table sessions exist', async () => {
    let capturedQuery;
    const models = {
      Order: {
        find: (query) => {
          capturedQuery = query;
          return { sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) };
        },
        countDocuments: async () => 0
      },
      OrderItem: { find: () => ({ sort: () => ({ lean: async () => [] }) }) }
    };
    const result = await getPreparationScreen(
      { group: 'tables', tab: 'current', page: 1, limit: 10 },
      { orderModels: models }
    );
    expect(capturedQuery).toMatchObject({ fulfillmentType: 'DINE_IN' });
    expect(result.summary).toMatchObject({ current: 0, ready: 0 });
  });
  it('shows order details with the frozen recipe snapshot', async () => {
    const order = orderRow();
    const models = {
      Order: { findById: () => ({ lean: async () => order }) },
      OrderItem: { find: () => ({ sort: () => ({ lean: async () => [itemRow()] }) }) }
    };
    const result = await getPreparationOrderDetails(order._id, { orderModels: models });
    expect(result.order.orderNumber).toBe('ORD-00000007');
    expect(result.items[0].recipeSnapshot).toHaveLength(1);
    expect(result.items[0].recipeSnapshot[0]).toMatchObject({
      quantitySmall: '40',
      materialName: 'بن'
    });
    expect(result.progress).toMatchObject({ ready: 0, total: 1 });
  });
  it('rejects details for unknown orders', async () => {
    await expect(
      getPreparationOrderDetails(id(), {
        orderModels: { Order: { findById: () => ({ lean: async () => null }) } }
      })
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
  it('persists the recipe snapshot at confirmation for later preparation', async () => {
    const order = { _id: id(), version: 0, eventSequence: 0, save: vi.fn() };
    let storedItem;
    const models = {
      Order: { create: async ([v]) => [{ ...order, ...v, save: order.save }] },
      OrderItem: {
        create: async ([v]) => {
          storedItem = { _id: id(), version: 0, save: vi.fn(), ...v };
          return [storedItem];
        }
      },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const recipe = [
      { materialId: String(id()), quantitySmall: '20', materialName: 'بن', unitName: 'جرام' }
    ];
    await confirmNewOrder(
      {
        fulfillmentType: 'TAKEAWAY',
        customer: { name: 'عميل اختبار', phone: '01001234567' },
        items: [{ productId: String(id()), productSizeId: String(id()), quantity: 2 }]
      },
      {
        ...infrastructure(),
        orderModels: models,
        productsPort: {
          snapshot: async () => ({
            product: { id: String(id()), name: 'لاتيه' },
            type: { id: String(id()), name: 'ساخن' },
            size: { id: String(id()), name: 'وسط' },
            unitSellingPrice: '60',
            addons: [],
            recipe,
            recipeVersion: 1
          })
        },
        inventoryPort: {
          allocate: async () => ({ allocations: [{ _id: id(), inventoryValue: money('30') }] })
        }
      }
    );
    expect(storedItem.recipeSnapshot).toHaveLength(1);
    expect(storedItem.recipeSnapshot[0].materialName).toBe('بن');
  });
});
