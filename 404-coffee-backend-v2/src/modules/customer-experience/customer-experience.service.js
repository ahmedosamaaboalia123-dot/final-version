import { compare, subtract, toApiString } from '../../platform/database/decimal.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { createOpaqueToken, hashToken } from '../../shared/utils/hash-token.js';
import { normalizePhone } from '../../shared/utils/normalize-phone.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { Order, OrderItem, OrderStatusEvent } from '../orders/order.models.js';
import {
  confirmNewOrder,
  appendOrderItems,
  cancelWholeOrder
} from '../orders/order.public-service.js';
import { confirmDeliveryReceipt } from '../delivery/delivery.public-service.js';
import { listCustomerOrders } from '../orders/order.public-service.js';
import { getOrderReview, submitOrderReview } from '../reviews/review.public-service.js';
import {
  CustomerAccessSession,
  CustomerOrderCredential,
  OrderCancellationRequest
} from './customer-experience.models.js';
import { resolveActionCredential } from './customer-experience.middleware.js';
import { lookupRateLimiter } from './customer-experience.middleware.js';

const defaults = {
  Order,
  OrderItem,
  OrderStatusEvent,
  CustomerOrderCredential,
  CustomerAccessSession,
  OrderCancellationRequest
};

const READ_TOKEN_DAYS = 30;
const ACTION_TOKEN_DAYS = 7;
const ACCESS_SESSION_DAYS = 30;

const daysFromNow = (days, now) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

export function maskPhone(phone) {
  if (!phone || phone.length < 6) return '****';
  return `${phone.slice(0, 6)}****${phone.slice(-2)}`;
}

async function record(kind, entityId, payload, context) {
  const sequence = await nextSequence(`customer-order-experience:${entityId}`, context);
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'customer-experience',
      action: kind,
      actor: { type: context.actorType ?? 'CUSTOMER', id: context.actorId },
      entity: { type: 'CustomerOrder', id: entityId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'CustomerOrderExperience',
      aggregateId: String(entityId),
      eventType: kind,
      payload,
      sequence
    },
    context
  );
}

export async function issueOrderCredentials(order, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.publicOrderModels ?? defaults;
      const now = context.now ?? new Date();
      const trackingReadToken = createOpaqueToken();
      const orderActionToken = createOpaqueToken();
      const [credential] = await models.CustomerOrderCredential.create(
        [
          {
            orderId: order._id,
            customerId: order.customerId,
            trackingReadTokenHash: hashToken(trackingReadToken),
            orderActionTokenHash: hashToken(orderActionToken),
            readExpiresAt: daysFromNow(READ_TOKEN_DAYS, now),
            actionExpiresAt: daysFromNow(ACTION_TOKEN_DAYS, now),
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      await record(
        'credentials.issued',
        order._id,
        { orderId: String(order._id), orderNumber: order.orderNumber },
        { ...context, ...tx }
      );
      return {
        credential,
        trackingReadToken,
        orderActionToken,
        readExpiresAt: credential.readExpiresAt,
        actionExpiresAt: credential.actionExpiresAt
      };
    },
    context,
    context.transactionOptions
  );
}

export async function createPublicOrder(input, context = {}) {
  const confirm = context.orderModule?.confirm ?? confirmNewOrder;
  const confirmed = await confirm(
    {
      fulfillmentType: input.fulfillmentType,
      customer: input.customer,
      items: input.items,
      channel: 'CUSTOMER_WEB'
    },
    context
  );
  const issued = await issueOrderCredentials(confirmed.order, context);
  return {
    order: confirmed.order,
    items: confirmed.items,
    totals: confirmed.totals,
    customer: { id: confirmed.order.customerId ? String(confirmed.order.customerId) : null },
    tracking: {
      publicOrderNumber: confirmed.order.publicOrderNumber,
      barcodeValue: confirmed.order.barcodeValue,
      trackingReadToken: issued.trackingReadToken,
      orderActionToken: issued.orderActionToken,
      readExpiresAt: issued.readExpiresAt,
      actionExpiresAt: issued.actionExpiresAt
    }
  };
}

export async function lookupPublicOrder(input, context = {}) {
  const models = context.publicOrderModels ?? defaults;
  const limiter = context.lookupLimiter ?? lookupRateLimiter;
  limiter.check(`${context.clientIp ?? 'unknown'}:${input.orderNumber}`);
  const order = await models.Order.findOne({
    $or: [{ orderNumber: input.orderNumber }, { publicOrderNumber: input.orderNumber }]
  }).lean();
  const notFound = () =>
    new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  if (!order) throw notFound();
  if (normalizePhone(order.customerPhone) !== normalizePhone(input.phone)) throw notFound();
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    createdAt: order.createdAt,
    maskedPhone: maskPhone(order.customerPhone),
    canProveOwnership: true
  };
}

export async function addItemsUsingActionToken(order, input, context = {}) {
  const append = context.orderModule?.append ?? appendOrderItems;
  const result = await append(order._id, input, context);
  return {
    order: result.order,
    addedItems: result.addedItems,
    totals: result.totals,
    progress: result.progress,
    eventSequence: result.order.eventSequence,
    balanceDue: toApiString(result.order.balanceDue)
  };
}

export async function requestOrderCancellation(order, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.publicOrderModels ?? defaults;
      const existing = await models.OrderCancellationRequest.findOne({
        orderId: order._id
      }).session(tx.session);
      if (existing && ['PENDING', 'AUTO_APPROVED'].includes(existing.status))
        return { request: existing, order, executed: false };
      const netPaid = subtract(
        toApiString(order.paidAmount ?? '0'),
        toApiString(order.refundedAmount ?? '0')
      );
      const autoApprovable =
        ['CONFIRMED', 'PREPARING'].includes(order.status) && compare(netPaid, '0') <= 0;
      const [request] = await models.OrderCancellationRequest.create(
        [
          {
            orderId: order._id,
            customerId: order.customerId,
            status: autoApprovable ? 'AUTO_APPROVED' : 'PENDING',
            reason: input.reason,
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      let executed = false;
      if (autoApprovable) {
        const cancel = context.orderModule?.cancelWhole ?? cancelWholeOrder;
        await cancel(
          order._id,
          { reason: input.reason, expectedVersion: order.version },
          { ...context, ...tx }
        );
        request.status = 'EXECUTED';
        request.decidedAt = context.now ?? new Date();
        await request.save({ session: tx.session });
        executed = true;
      }
      await record(
        'cancellation.requested',
        order._id,
        { orderId: String(order._id), status: request.status },
        { ...context, ...tx }
      );
      const updated = await models.Order.findById(order._id).session(tx.session);
      return { request, order: updated ?? order, executed };
    },
    context,
    context.transactionOptions
  );
}

export async function confirmCustomerReceipt(order, input, context = {}) {
  const confirm = context.deliveryModule?.confirm ?? confirmDeliveryReceipt;
  const result = await confirm(
    order._id,
    {
      expectedVersion: input.expectedVersion,
      receivedBy: 'CUSTOMER',
      credentialId: input.credentialId
    },
    context
  );
  return {
    order: result.order,
    deliveryConfirmation: result.confirmation,
    reviewAvailable: true,
    invoice: result.invoice
  };
}

export async function submitPublicReview(order, input, context = {}) {
  const submit = context.reviewModule?.submit ?? submitOrderReview;
  const review = await submit(
    order._id,
    {
      rating: input.rating,
      comment: input.comment,
      displayName: input.displayName,
      expectedOrderVersion: input.expectedOrderVersion
    },
    context
  );
  return review;
}

export async function createCustomerAccessSession(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.publicOrderModels ?? defaults;
      const now = context.now ?? new Date();
      const { order } = await resolveActionCredential(input.orderNumber, input.orderActionToken, {
        ...context,
        publicOrderModels: models
      });
      if (!order.customerId)
        throw new ApiError({
          code: 'CUSTOMER_NOT_LINKED',
          status: 409,
          messageAr: 'الطلب غير مرتبط بعميل'
        });
      const sessionToken = createOpaqueToken();
      const [session] = await models.CustomerAccessSession.create(
        [
          {
            customerId: order.customerId,
            sessionTokenHash: hashToken(sessionToken),
            proofType: 'ORDER_ACTION_TOKEN',
            proofOrderId: order._id,
            issuedAt: now,
            expiresAt: daysFromNow(ACCESS_SESSION_DAYS, now)
          }
        ],
        { session: tx.session }
      );
      await record(
        'access-session.created',
        order._id,
        { orderId: String(order._id) },
        { ...context, ...tx }
      );
      return {
        customerAccessToken: sessionToken,
        expiresAt: session.expiresAt,
        customer: { id: String(order.customerId), maskedPhone: maskPhone(order.customerPhone) }
      };
    },
    context,
    context.transactionOptions
  );
}

export async function getCustomerOrderHistory(customerId, filters = {}, context = {}) {
  const listByCustomer = context.historyOrdersPort?.listByCustomer ?? listCustomerOrders;
  const readReview = context.historyReviewPort?.read ?? getOrderReview;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;
  const { items, pageMeta } = await listByCustomer(customerId, { page, limit }, context);
  const history = await Promise.all(
    items.map(async (item) => {
      const { review } = await readReview(item.id, context);
      return {
        id: item.id,
        orderNumber: item.orderNumber,
        publicOrderNumber: item.publicOrderNumber,
        barcodeValue: item.barcodeValue,
        fulfillmentType: item.fulfillmentType,
        status: item.status,
        total: item.totals.total,
        createdAt: item.createdAt,
        version: item.version,
        eventSequence: item.eventSequence,
        customerReceiptStatus: item.customerReceiptStatus,
        paymentStatus: item.paymentStatus,
        reviewStatus: review ? 'SUBMITTED' : 'NONE'
      };
    })
  );
  return { items: history, pageMeta };
}

export { READ_TOKEN_DAYS, ACTION_TOKEN_DAYS, ACCESS_SESSION_DAYS };
