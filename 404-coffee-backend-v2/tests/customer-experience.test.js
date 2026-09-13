import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { checkoutBody } from '../src/modules/customer-experience/customer-experience.validation.js';
import {
  createLookupRateLimiter,
  resolveActionCredential,
  resolveReadCredential
} from '../src/modules/customer-experience/customer-experience.middleware.js';
import {
  confirmCustomerReceipt,
  createPublicOrder,
  getCustomerOrderHistory,
  issueOrderCredentials,
  lookupPublicOrder,
  maskPhone,
  requestOrderCancellation
} from '../src/modules/customer-experience/customer-experience.service.js';
import { getPublicTracking } from '../src/modules/customer-experience/customer-experience.queries.js';
import { hashToken } from '../src/shared/utils/hash-token.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId(),
  chain = (value) => ({ session: async () => value });
const infrastructure = () => ({
  session: {},
  actorType: 'CUSTOMER',
  requestId: 'test-request',
  clientIp: '10.0.0.1',
  sequenceModel: { findOneAndUpdate: async () => ({ value: 1 }) },
  auditModel: { create: async ([v]) => [v] },
  outboxModel: { create: async ([v]) => [v] }
});
const money = (value) => toDecimal128(value);
const READ = 'read-raw-token-value-1234567890';
const ACTION = 'action-raw-token-value-0987654321';
const credentialDoc = (overrides = {}) => ({
  _id: id(),
  orderId: id(),
  status: 'ACTIVE',
  trackingReadTokenHash: hashToken(READ),
  orderActionTokenHash: hashToken(ACTION),
  readExpiresAt: new Date(Date.now() + 86400000),
  actionExpiresAt: new Date(Date.now() + 86400000),
  save: vi.fn(),
  ...overrides
});
const publicOrder = (overrides = {}) => ({
  _id: id(),
  orderNumber: 'ORD-00000007',
  publicOrderNumber: 'ORD-00000007',
  barcodeValue: 'track123',
  status: 'CONFIRMED',
  fulfillmentType: 'TAKEAWAY',
  customerPhone: '01001234567',
  customerId: id(),
  paidAmount: money('0'),
  refundedAmount: money('0'),
  version: 0,
  ...overrides
});

describe('public customer web', () => {
  it('rejects dine-in and empty carts at checkout', () => {
    const base = {
      fulfillmentType: 'TAKEAWAY',
      customer: { name: 'عميل', phone: '01001234567' },
      items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }]
    };
    expect(checkoutBody.safeParse(base).success).toBe(true);
    expect(checkoutBody.safeParse({ ...base, fulfillmentType: 'DINE_IN' }).success).toBe(false);
    expect(checkoutBody.safeParse({ ...base, items: [] }).success).toBe(false);
  });
  it('issues raw tokens once and stores only hashes', async () => {
    const order = publicOrder();
    let stored;
    const models = {
      CustomerOrderCredential: {
        create: async ([v]) => {
          stored = { _id: id(), ...v };
          return [stored];
        }
      }
    };
    const issued = await issueOrderCredentials(order, {
      ...infrastructure(),
      publicOrderModels: models
    });
    expect(typeof issued.trackingReadToken).toBe('string');
    expect(typeof issued.orderActionToken).toBe('string');
    expect(issued.trackingReadToken).not.toBe(issued.orderActionToken);
    expect(stored.trackingReadTokenHash).toBe(hashToken(issued.trackingReadToken));
    expect(stored.orderActionTokenHash).toBe(hashToken(issued.orderActionToken));
    expect(stored.trackingReadToken).toBeUndefined();
    expect(stored.orderActionToken).toBeUndefined();
  });
  it('separates read and action token scopes', async () => {
    const order = publicOrder();
    const models = {
      Order: { findOne: async () => order },
      CustomerOrderCredential: { findOne: () => ({ select: () => credentialDoc() }) }
    };
    await expect(
      resolveActionCredential('ORD-00000007', READ, { publicOrderModels: models })
    ).rejects.toMatchObject({ code: 'PUBLIC_TOKEN_INVALID' });
    await expect(
      resolveReadCredential('ORD-00000007', ACTION, { publicOrderModels: models })
    ).rejects.toMatchObject({ code: 'PUBLIC_TOKEN_INVALID' });
    const read = await resolveReadCredential('ORD-00000007', READ, { publicOrderModels: models });
    expect(read.scope).toBeUndefined();
    expect(String(read.order._id)).toBe(String(order._id));
  });
  it('rejects expired tokens and marks them expired', async () => {
    const order = publicOrder();
    const credential = credentialDoc({ readExpiresAt: new Date(Date.now() - 1000) });
    const models = {
      Order: { findOne: async () => order },
      CustomerOrderCredential: { findOne: () => ({ select: () => credential }) }
    };
    await expect(
      resolveReadCredential('ORD-00000007', READ, { publicOrderModels: models })
    ).rejects.toMatchObject({ code: 'PUBLIC_TOKEN_EXPIRED' });
    expect(credential.status).toBe('EXPIRED');
  });
  it('limits lookup abuse and hides secrets from its projection', async () => {
    const order = {
      ...publicOrder(),
      createdAt: new Date('2026-09-11T10:00:00Z')
    };
    const models = { Order: { findOne: () => ({ lean: async () => order }) } };
    const limiter = createLookupRateLimiter({ limit: 2, windowMs: 600000 });
    const context = { ...infrastructure(), publicOrderModels: models, lookupLimiter: limiter };
    const first = await lookupPublicOrder(
      { orderNumber: 'ORD-00000007', phone: '01001234567' },
      context
    );
    expect(first).toMatchObject({ orderNumber: 'ORD-00000007', canProveOwnership: true });
    expect(first.maskedPhone).toBe(maskPhone('01001234567'));
    expect(first).not.toHaveProperty('barcodeValue');
    expect(first).not.toHaveProperty('trackingReadToken');
    await lookupPublicOrder({ orderNumber: 'ORD-00000007', phone: '01001234567' }, context);
    await expect(
      lookupPublicOrder({ orderNumber: 'ORD-00000007', phone: '01001234567' }, context)
    ).rejects.toMatchObject({ code: 'LOOKUP_RATE_LIMITED' });
  });
  it('answers wrong phones exactly like unknown orders', async () => {
    const models = { Order: { findOne: () => ({ lean: async () => publicOrder() }) } };
    await expect(
      lookupPublicOrder(
        { orderNumber: 'ORD-00000007', phone: '01112223333' },
        { ...infrastructure(), publicOrderModels: models }
      )
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
  it('builds tracking without cost or recipe internals', async () => {
    const order = {
      ...publicOrder(),
      status: 'PREPARING',
      customerReceiptStatus: 'LOCKED',
      subtotal: money('120'),
      discount: money('0'),
      tax: money('0'),
      deliveryFee: money('0'),
      total: money('120'),
      eventSequence: 3
    };
    const models = {
      Order: { findById: () => ({ lean: async () => order }) },
      OrderItem: {
        find: () => ({
          sort: () => ({
            lean: async () => [
              { productName: 'لاتيه', sizeName: 'وسط', quantity: 2, status: 'PREPARING' }
            ]
          })
        })
      },
      OrderStatusEvent: {
        find: () => ({
          sort: () => ({
            lean: async () => [{ fromStatus: null, toStatus: 'CONFIRMED', sequence: 1 }]
          })
        })
      }
    };
    const tracking = await getPublicTracking(order._id, { publicOrderModels: models });
    expect(tracking).toMatchObject({
      orderNumber: 'ORD-00000007',
      status: 'PREPARING',
      eventSequence: 3,
      delivery: null
    });
    expect(tracking.items[0]).not.toHaveProperty('recipeSnapshot');
    expect(tracking).not.toHaveProperty('actualInventoryCost');
  });
  it('auto-approves cancellation for unpaid early orders', async () => {
    const order = publicOrder();
    const models = {
      OrderCancellationRequest: {
        findOne: () => chain(null),
        create: async ([v]) => [{ _id: id(), save: vi.fn(), ...v }]
      },
      Order: { findById: () => chain(order) }
    };
    const cancelWhole = vi.fn(async () => ({}));
    const result = await requestOrderCancellation(
      order,
      { reason: 'غيرت رأيي', expectedVersion: 0 },
      {
        ...infrastructure(),
        publicOrderModels: models,
        orderModule: { cancelWhole }
      }
    );
    expect(result.request.status).toBe('EXECUTED');
    expect(result.executed).toBe(true);
    expect(cancelWhole).toHaveBeenCalledTimes(1);
  });
  it('parks paid or advanced cancellations for admin review', async () => {
    const order = publicOrder({ status: 'READY', paidAmount: money('120') });
    const models = {
      OrderCancellationRequest: {
        findOne: () => chain(null),
        create: async ([v]) => [{ _id: id(), save: vi.fn(), ...v }]
      },
      Order: { findById: () => chain(order) }
    };
    const cancelWhole = vi.fn(async () => ({}));
    const result = await requestOrderCancellation(
      order,
      { reason: 'تأخر الطلب', expectedVersion: 0 },
      {
        ...infrastructure(),
        publicOrderModels: models,
        orderModule: { cancelWhole }
      }
    );
    expect(result.request.status).toBe('PENDING');
    expect(result.executed).toBe(false);
    expect(cancelWhole).not.toHaveBeenCalled();
  });
  it('refuses receipt before handover availability', async () => {
    const order = publicOrder({ status: 'READY', customerReceiptStatus: 'LOCKED' });
    const confirm = vi.fn(async () => {
      throw Object.assign(new Error('not receivable'), { code: 'ORDER_RECEIPT_CONFLICT' });
    });
    await expect(
      confirmCustomerReceipt(
        order,
        { expectedVersion: 0 },
        { ...infrastructure(), deliveryModule: { confirm } }
      )
    ).rejects.toMatchObject({ code: 'ORDER_RECEIPT_CONFLICT' });
    expect(confirm).toHaveBeenCalledWith(
      order._id,
      expect.objectContaining({ expectedVersion: 0, receivedBy: 'CUSTOMER' }),
      expect.anything()
    );
  });
  it('completes receipt after handover with invoice and review flag', async () => {
    const order = {
      ...publicOrder(),
      status: 'COMPLETED',
      customerReceiptStatus: 'CONFIRMED'
    };
    const confirmation = { _id: id(), source: 'CUSTOMER' };
    const invoice = { _id: id() };
    const confirm = vi.fn(async () => ({ order, confirmation, invoice }));
    const result = await confirmCustomerReceipt(
      publicOrder(),
      { expectedVersion: 0, credentialId: id() },
      { ...infrastructure(), deliveryModule: { confirm } }
    );
    expect(result.order.status).toBe('COMPLETED');
    expect(result.order.customerReceiptStatus).toBe('CONFIRMED');
    expect(result.deliveryConfirmation).toBe(confirmation);
    expect(result.reviewAvailable).toBe(true);
    expect(result.invoice).toBe(invoice);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it('recovers order history with review status behind an access session', async () => {
    const item = {
      id: String(id()),
      orderNumber: 'ORD-00000007',
      barcodeValue: 'track123',
      fulfillmentType: 'TAKEAWAY',
      status: 'COMPLETED',
      totals: { total: '120' },
      createdAt: new Date('2026-09-11T10:00:00Z')
    };
    const history = await getCustomerOrderHistory(
      id(),
      { page: 1, limit: 10 },
      {
        ...infrastructure(),
        historyOrdersPort: {
          listByCustomer: async () => ({ items: [item], pageMeta: { page: 1 } })
        },
        historyReviewPort: { read: async () => ({ review: { id: String(id()) } }) }
      }
    );
    expect(history.items[0]).toMatchObject({
      orderNumber: 'ORD-00000007',
      reviewStatus: 'SUBMITTED'
    });
    expect(history.items[0]).not.toHaveProperty('trackingReadToken');
  });
  it('creates public orders through the admin confirmation pipeline', async () => {
    const order = { ...publicOrder(), customerId: id(), createdAt: new Date() };
    const confirm = vi.fn(async () => ({
      order,
      items: [],
      totals: { total: '120' },
      tracking: {},
      customer: {}
    }));
    const models = {
      CustomerOrderCredential: { create: async ([v]) => [{ _id: id(), ...v }] }
    };
    const result = await createPublicOrder(
      {
        fulfillmentType: 'TAKEAWAY',
        customer: { name: 'عميل', phone: '01001234567' },
        items: [{ productId: String(id()), productSizeId: String(id()), quantity: 1 }]
      },
      { ...infrastructure(), orderModule: { confirm }, publicOrderModels: models }
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'CUSTOMER_WEB' }),
      expect.anything()
    );
    expect(result.tracking.trackingReadToken).toBeDefined();
    expect(result.tracking.orderActionToken).toBeDefined();
  });
});
