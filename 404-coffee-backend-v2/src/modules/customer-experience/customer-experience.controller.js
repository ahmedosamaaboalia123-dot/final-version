import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { itemDto } from '../orders/order.mapper.js';
import { reviewDto } from '../reviews/review.mapper.js';
import {
  addItemsUsingActionToken,
  confirmCustomerReceipt,
  createCustomerAccessSession,
  createPublicOrder,
  getCustomerOrderHistory,
  lookupPublicOrder,
  requestOrderCancellation,
  submitPublicReview
} from './customer-experience.service.js';
import { getPublicTracking } from './customer-experience.queries.js';

const ctx = (r, d) => ({
  ...d.serviceContext,
  actorType: 'CUSTOMER',
  requestId: r.requestId,
  operationRequestId: r.operationRequestId,
  clientIp: r.ip
});

export function createCustomerExperienceController(d) {
  return {
    checkout: async (r, s) => {
      const result = await createPublicOrder(r.validated.body, ctx(r, d));
      return sendCreated(s, {
        order: {
          id: String(result.order._id),
          publicOrderNumber: result.order.publicOrderNumber,
          status: result.order.status,
          fulfillmentType: result.order.fulfillmentType,
          version: result.order.version ?? 0,
          eventSequence: result.order.eventSequence,
          items: result.items.map(itemDto),
          totals: result.totals,
          createdAt: result.order.createdAt
        },
        customer: result.customer,
        tracking: {
          barcodeValue: result.tracking.barcodeValue,
          trackingReadToken: result.tracking.trackingReadToken,
          orderActionToken: result.tracking.orderActionToken,
          readExpiresAt: result.tracking.readExpiresAt,
          actionExpiresAt: result.tracking.actionExpiresAt
        }
      });
    },
    lookup: async (r, s) => sendSuccess(s, await lookupPublicOrder(r.validated.body, ctx(r, d))),
    tracking: async (r, s) =>
      sendSuccess(s, await getPublicTracking(r.publicOrder.order._id, ctx(r, d))),
    append: async (r, s) => {
      const result = await addItemsUsingActionToken(
        r.publicOrder.order,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        order: {
          id: String(result.order._id),
          status: result.order.status,
          version: result.order.version ?? 0
        },
        addedItems: result.addedItems.map(itemDto),
        totals: result.totals,
        progress: result.progress,
        eventSequence: result.eventSequence,
        balanceDue: result.balanceDue
      });
    },
    cancel: async (r, s) => {
      const result = await requestOrderCancellation(
        r.publicOrder.order,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        request: {
          id: String(result.request._id),
          status: result.request.status,
          createdAt: result.request.requestedAt
        },
        order: { id: String(result.order._id), status: result.order.status },
        executed: result.executed
      });
    },
    receive: async (r, s) => {
      const result = await confirmCustomerReceipt(
        r.publicOrder.order,
        { ...r.validated.body, credentialId: r.publicOrder.credential._id },
        ctx(r, d)
      );
      return sendSuccess(s, {
        order: {
          id: String(result.order._id),
          status: result.order.status,
          customerReceiptStatus: result.order.customerReceiptStatus,
          version: result.order.version ?? 0,
          eventSequence: result.order.eventSequence,
          completedAt: result.order.updatedAt
        },
        deliveryConfirmation: result.deliveryConfirmation,
        reviewAvailable: result.reviewAvailable
      });
    },
    review: async (r, s) =>
      sendCreated(s, {
        review: reviewDto(
          await submitPublicReview(r.publicOrder.order, r.validated.body, ctx(r, d))
        )
      }),
    accessSession: async (r, s) =>
      sendCreated(s, await createCustomerAccessSession(r.validated.body, ctx(r, d))),
    history: async (r, s) =>
      sendSuccess(
        s,
        await getCustomerOrderHistory(r.customerSession.customerId, r.validated.query, ctx(r, d))
      )
  };
}
