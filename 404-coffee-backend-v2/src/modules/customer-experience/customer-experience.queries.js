import { toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Order, OrderItem, OrderStatusEvent } from '../orders/order.models.js';

export async function getPublicTracking(orderId, context = {}) {
  const models = context.publicOrderModels ?? { Order, OrderItem, OrderStatusEvent };
  const order = await models.Order.findById(orderId).lean();
  if (!order)
    throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  const [items, events, delivery, reviewResult] = await Promise.all([
    models.OrderItem.find({ orderId: order._id }).sort({ lineNo: 1, _id: 1 }).lean(),
    models.OrderStatusEvent.find({ orderId: order._id }).sort({ sequence: 1, _id: 1 }).lean(),
    context.ordersDeliveryPort?.getByOrder
      ? context.ordersDeliveryPort.getByOrder(order._id, context)
      : null,
    context.publicTrackingReviewPort?.read
      ? Promise.resolve(context.publicTrackingReviewPort.read(order._id, context)).catch(() => ({ review: null }))
      : { review: null }
  ]);
  const active = items.filter((item) => item.status !== 'CANCELLED');
  return {
    orderNumber: order.orderNumber,
    publicOrderNumber: order.publicOrderNumber,
    barcodeValue: order.barcodeValue,
    fulfillmentType: order.fulfillmentType,
    status: order.status,
    version: order.version ?? 0,
    customerReceiptStatus: order.customerReceiptStatus,
    progress: {
      ready: active.filter((item) => item.status === 'READY').length,
      total: active.length
    },
    items: active.map((item) => ({
      name: item.productName,
      size: item.sizeName,
      quantity: item.quantity,
      status: item.status
    })),
    timeline: events.map((event) => ({
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      sequence: event.sequence,
      occurredAt: event.createdAt
    })),
    totals: {
      subtotal: toApiString(order.subtotal),
      discount: toApiString(order.discount),
      tax: toApiString(order.tax),
      deliveryFee: toApiString(order.deliveryFee),
      total: toApiString(order.total)
    },
    delivery,
    reviewStatus: reviewResult?.review ? 'SUBMITTED' : 'NONE',
    eventSequence: order.eventSequence
  };
}
