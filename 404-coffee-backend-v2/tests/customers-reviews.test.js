import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { updateBody } from '../src/modules/customers/customer.validation.js';
import {
  createCustomer,
  recordCustomerOrderCompletion,
  updateCustomerProfile,
  upsertCustomerForOrder
} from '../src/modules/customers/customer.service.js';
import {
  moderateReview,
  submitOrderReview,
  updateOrderReview
} from '../src/modules/reviews/review.service.js';
import { confirmNewOrder } from '../src/modules/orders/order.service.js';
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
const customerDoc = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'ACTIVE',
  orderCount: 1,
  completedOrderCount: 0,
  lifetimeValue: money('100'),
  lastOrderAt: new Date('2026-09-10T10:00:00Z'),
  lastProfileOrderAt: new Date('2026-09-10T10:00:00Z'),
  save: vi.fn(),
  ...overrides
});
const completedOrder = (overrides = {}) => ({
  _id: id(),
  version: 0,
  status: 'COMPLETED',
  fulfillmentType: 'TAKEAWAY',
  customerId: id(),
  ...overrides
});

describe('customers upsert and reviews', () => {
  it('creates one customer per normalized phone across formats', async () => {
    const created = [];
    const models = {
      Customer: {
        findOne: () => chain(null),
        create: async ([v]) => {
          created.push({ _id: id(), version: 0, ...v });
          return created;
        }
      }
    };
    const first = await upsertCustomerForOrder(
      { name: 'عميل اختبار', phone: '01001234567' },
      { orderTotal: '100', orderCreatedAt: new Date('2026-09-10T10:00:00Z') },
      { ...infrastructure(), customerModels: models }
    );
    expect(first.phoneNormalized).toBe('+201001234567');
    expect(first.orderCount).toBe(1);
    const same = customerDoc({
      phoneNormalized: '+201001234567',
      name: 'اسم قديم',
      lastProfileOrderAt: new Date('2026-09-10T10:00:00Z'),
      lastOrderAt: new Date('2026-09-10T10:00:00Z')
    });
    const second = await upsertCustomerForOrder(
      { name: 'اسم جديد', phone: '+20 100 123 4567', address: 'المهندسين' },
      { orderTotal: '50', orderCreatedAt: new Date('2026-09-11T10:00:00Z') },
      { ...infrastructure(), customerModels: { Customer: { findOne: () => chain(same) } } }
    );
    expect(String(second._id)).toBe(String(same._id));
    expect(second.orderCount).toBe(2);
    expect(second.name).toBe('اسم جديد');
  });
  it('keeps the newer profile when an older order arrives late', async () => {
    const same = customerDoc({
      name: 'اسم جديد',
      lastProfileOrderAt: new Date('2026-09-11T10:00:00Z'),
      lastOrderAt: new Date('2026-09-11T10:00:00Z')
    });
    const result = await upsertCustomerForOrder(
      { name: 'اسم قديم', phone: '01001234567' },
      { orderTotal: '50', orderCreatedAt: new Date('2026-09-10T10:00:00Z') },
      { ...infrastructure(), customerModels: { Customer: { findOne: () => chain(same) } } }
    );
    expect(result.name).toBe('اسم جديد');
    expect(result.orderCount).toBe(2);
  });
  it('survives concurrent first orders for the same phone', async () => {
    const existing = customerDoc();
    const findOne = vi.fn().mockReturnValueOnce(chain(null)).mockReturnValue(chain(existing));
    const create = vi.fn(async () => {
      const error = new Error('duplicate');
      error.code = 11000;
      throw error;
    });
    const result = await upsertCustomerForOrder(
      { name: 'عميل مكرر', phone: '01001234567' },
      { orderTotal: '100', orderCreatedAt: new Date('2026-09-11T10:00:00Z') },
      { ...infrastructure(), customerModels: { Customer: { findOne, create } } }
    );
    expect(String(result._id)).toBe(String(existing._id));
    expect(result.orderCount).toBe(2);
  });
  it('rejects manual creation for an existing phone', async () => {
    await expect(
      createCustomer(
        { name: 'عميل مكرر', phone: '01001234567' },
        {
          ...infrastructure(),
          customerModels: { Customer: { findOne: () => chain(customerDoc()) } }
        }
      )
    ).rejects.toMatchObject({ code: 'CUSTOMER_PHONE_EXISTS' });
  });
  it('requires a reason to block and guards profile versions', async () => {
    expect(updateBody.safeParse({ status: 'BLOCKED', expectedVersion: 0 }).success).toBe(false);
    await expect(
      updateCustomerProfile(
        id(),
        { name: 'اسم معدل', expectedVersion: 4 },
        {
          ...infrastructure(),
          customerModels: { Customer: { findOne: () => chain(null) } }
        }
      )
    ).rejects.toMatchObject({ code: 'CUSTOMER_VERSION_CONFLICT' });
  });
  it('counts completed orders and ignores missing customers', async () => {
    const customer = customerDoc();
    const done = await recordCustomerOrderCompletion(customer._id, {
      ...infrastructure(),
      customerModels: { Customer: { findById: () => chain(customer) } }
    });
    expect(done.completedOrderCount).toBe(1);
    expect(customer.save).toHaveBeenCalled();
    await expect(recordCustomerOrderCompletion(null, infrastructure())).resolves.toBeNull();
  });
  it('rejects reviews before order completion', async () => {
    await expect(
      submitOrderReview(
        id(),
        { rating: 5, expectedOrderVersion: 0 },
        {
          ...infrastructure(),
          reviewModels: {
            Order: { findById: () => chain(completedOrder({ status: 'PREPARING' })) },
            OrderReview: { create: vi.fn() },
            OrderReviewRevision: { create: vi.fn() }
          }
        }
      )
    ).rejects.toMatchObject({ code: 'REVIEW_ORDER_NOT_COMPLETED' });
  });
  it('submits one review per completed order', async () => {
    const order = completedOrder();
    const models = {
      Order: { findById: () => chain(order) },
      OrderReview: { create: async ([v]) => [{ _id: id(), version: 0, ...v }] },
      OrderReviewRevision: { create: vi.fn() }
    };
    const review = await submitOrderReview(
      order._id,
      { rating: 5, comment: 'ممتاز', expectedOrderVersion: 0 },
      { ...infrastructure(), reviewModels: models }
    );
    expect(review.rating).toBe(5);
    const duplicate = {
      Order: { findById: () => chain(order) },
      OrderReview: {
        create: async () => {
          const error = new Error('duplicate');
          error.code = 11000;
          throw error;
        }
      },
      OrderReviewRevision: { create: vi.fn() }
    };
    await expect(
      submitOrderReview(
        order._id,
        { rating: 4, expectedOrderVersion: 0 },
        { ...infrastructure(), reviewModels: duplicate }
      )
    ).rejects.toMatchObject({ code: 'REVIEW_ALREADY_EXISTS' });
  });
  it('edits preserve the original rating in an immutable revision', async () => {
    const review = {
      _id: id(),
      orderId: id(),
      version: 0,
      rating: 5,
      comment: 'ممتاز',
      save: vi.fn()
    };
    let storedRevision;
    const models = {
      OrderReview: { findOne: () => chain(review) },
      OrderReviewRevision: {
        create: async ([v]) => {
          storedRevision = { _id: id(), ...v };
          return [storedRevision];
        }
      }
    };
    const result = await updateOrderReview(
      review._id,
      { rating: 4, comment: 'جيد جدًا', expectedVersion: 0 },
      { ...infrastructure(), reviewModels: models }
    );
    expect(result.review.rating).toBe(4);
    expect(storedRevision).toMatchObject({
      previousRating: 5,
      previousComment: 'ممتاز',
      newRating: 4,
      changeSource: 'OWNER_EDIT'
    });
  });
  it('moderation hides without rewriting the original stars', async () => {
    const review = {
      _id: id(),
      orderId: id(),
      version: 1,
      rating: 2,
      comment: 'تعليق مسيء',
      status: 'VISIBLE',
      save: vi.fn()
    };
    const models = {
      OrderReview: { findOne: () => chain(review) },
      OrderReviewRevision: { create: async ([v]) => [{ _id: id(), ...v }] }
    };
    const result = await moderateReview(
      review._id,
      { status: 'HIDDEN', reason: 'ألفاظ غير لائقة', expectedVersion: 1 },
      { ...infrastructure(), reviewModels: models }
    );
    expect(result.review.status).toBe('HIDDEN');
    expect(result.review.rating).toBe(2);
    expect(result.review.moderationReason).toBe('ألفاظ غير لائقة');
  });
  it('links confirmed orders to the upserted customer', async () => {
    const order = { _id: id(), version: 0, eventSequence: 0, save: vi.fn() };
    const customerId = id();
    const models = {
      Order: { create: async ([v]) => [{ ...order, ...v, save: order.save }] },
      OrderItem: { create: async ([v]) => [{ _id: id(), version: 0, save: vi.fn(), ...v }] },
      OrderStatusEvent: { create: async ([v]) => [v] },
      OrderItemStatusEvent: { create: async ([v]) => [v] }
    };
    const upsertForOrder = vi.fn(async () => ({ _id: customerId }));
    const result = await confirmNewOrder(
      {
        fulfillmentType: 'TAKEAWAY',
        customer: { name: 'عميل اختبار', phone: '01001234567' },
        items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }]
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
            recipe: [],
            recipeVersion: 1
          })
        },
        inventoryPort: { allocate: async () => ({ allocations: [] }) },
        customersPort: { upsertForOrder }
      }
    );
    expect(upsertForOrder).toHaveBeenCalledTimes(1);
    expect(String(result.order.customerId)).toBe(String(customerId));
  });
});
