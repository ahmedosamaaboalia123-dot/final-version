import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Delegate } from '../delivery/delivery.models.js';
import { Order, OrderItem, OrderStatusEvent } from './order.models.js';
import { itemDto, orderDto } from './order.mapper.js';

const OPEN_STATUSES = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

async function assignedDelegateMap(orders, context = {}) {
  const ids = [
    ...new Set(
      (orders || [])
        .map((order) => order.assignedDelegateId)
        .filter(Boolean)
        .map(String)
    )
  ];
  if (ids.length === 0) return new Map();
  const model = context.deliveryModels?.Delegate ?? Delegate;
  const rows = await model.find({ _id: { $in: ids } }).lean();
  return new Map(
    rows.map((delegate) => [
      String(delegate._id),
      { id: String(delegate._id), name: delegate.name }
    ])
  );
}

function withAssignedDelegate(order, names) {
  const key = order.assignedDelegateId ? String(order.assignedDelegateId) : null;
  return { ...order, assignedDelegate: key ? (names.get(key) ?? { id: key, name: null }) : null };
}

export async function getOrdersOnlineScreen(filters = {}, context = {}) {
  const models = context.orderModels ?? { Order, OrderItem };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = { fulfillmentType: { $in: ['TAKEAWAY', 'DELIVERY'] } };
  if (filters.tab === 'completed') query.status = 'COMPLETED';
  else if (filters.tab === 'cancelled') query.status = 'CANCELLED';
  else query.status = { $in: OPEN_STATUSES };
  if (filters.fulfillmentType) query.fulfillmentType = filters.fulfillmentType;
  const [rows, totalItems, counts] = await Promise.all([
    models.Order.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.Order.countDocuments(query),
    Promise.all(
      OPEN_STATUSES.map((status) =>
        models.Order.countDocuments({ fulfillmentType: { $in: ['TAKEAWAY', 'DELIVERY'] }, status })
      )
    )
  ]);
  const allItems = rows.length
    ? await models.OrderItem.find({ orderId: { $in: rows.map((order) => order._id) } }).lean()
    : [];
  const delegateNames = await assignedDelegateMap(rows, context);
  const cards = rows.map((order) => {
    const items = allItems.filter((item) => String(item.orderId) === String(order._id));
    const active = items.filter((item) => item.status !== 'CANCELLED');
    return withAssignedDelegate(
      {
        ...orderDto(order),
        progress: {
          ready: active.filter((item) => item.status === 'READY').length,
          total: active.length
        }
      },
      delegateNames
    );
  });
  return {
    summary: {
      active: counts.reduce((sum, count) => sum + count, 0),
      preparing: counts[1],
      ready: counts[2],
      outForDelivery: counts[3]
    },
    orders: cards,
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function listCustomerOrders(customerId, filters = {}, context = {}) {
  const models = context.orderModels ?? { Order };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const [rows, totalItems] = await Promise.all([
    models.Order.find({ customerId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.Order.countDocuments({ customerId })
  ]);
  return {
    items: rows.map(orderDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function getOrderDetails(id, include = {}, context = {}) {
  const models = context.orderModels ?? { Order, OrderItem, OrderStatusEvent };
  const order = await models.Order.findById(id).lean();
  if (!order)
    throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  const result = {
    order: withAssignedDelegate(orderDto(order), await assignedDelegateMap([order], context))
  };
  if (include.items) {
    const items = await models.OrderItem.find({ orderId: order._id })
      .sort({ lineNo: 1, _id: 1 })
      .lean();
    result.items = items.map(itemDto);
  }
  if (include.timeline) {
    const events = await models.OrderStatusEvent.find({ orderId: order._id })
      .sort({ sequence: 1, _id: 1 })
      .lean();
    result.timeline = events.map((event) => ({
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reasonCode: event.reasonCode,
      sequence: event.sequence,
      occurredAt: event.createdAt
    }));
  }
  if (include.payment) {
    result.payment = context.ordersPaymentPort?.summary
      ? await context.ordersPaymentPort.summary(order._id, context)
      : null;
  }
  if (include.delivery)
    result.delivery = context.ordersDeliveryPort?.getByOrder
      ? await context.ordersDeliveryPort.getByOrder(order._id, context)
      : null;
  if (include.invoice) {
    result.invoice = context.ordersInvoicePort?.preview
      ? await context.ordersInvoicePort.preview(order._id, context)
      : null;
  }
  return result;
}

export async function getOrderHistoryScreen(filters = {}, context = {}) {
  const models = context.orderModels ?? { Order };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query =
    filters.group === 'tables'
      ? { fulfillmentType: 'DINE_IN' }
      : { fulfillmentType: { $in: ['TAKEAWAY', 'DELIVERY'] } };
  if (filters.status) query.status = filters.status;
  if (filters.from || filters.to)
    query.createdAt = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {})
    };
  if (filters.search)
    query.$or = [
      {
        orderNumber: {
          $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i'
        }
      },
      {
        trackingCode: {
          $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i'
        }
      }
    ];
  const [rows, totalItems] = await Promise.all([
    models.Order.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.Order.countDocuments(query)
  ]);
  return {
    items: rows.map(orderDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}
