import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { add, subtract, toApiString } from '../../platform/database/decimal.js';
import { OrderPayment } from './payment.models.js';
import { paymentDto } from './payment.mapper.js';
export async function listOrderPayments(orderId, filters = {}, context = {}) {
  const model = context.paymentModels?.OrderPayment ?? OrderPayment,
    { page, limit } = parsePage(filters),
    { skip } = buildSkipLimit({ page, limit });
  const [rows, totalItems, all] = await Promise.all([
    model.find({ orderId }).sort({ collectedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments({ orderId }),
    model.find({ orderId }).select({ amount: 1, refundedAmount: 1, status: 1 }).lean()
  ]);
  const paid = all.filter((p) => p.status !== 'PENDING').reduce((s, p) => add(s, p.amount), '0');
  const refunded = all.reduce((s, p) => add(s, p.refundedAmount ?? '0'), '0');
  const order = context.ordersPort?.getSummary
    ? await context.ordersPort.getSummary(orderId, context)
    : null;
  return {
    items: rows.map(paymentDto),
    summary: {
      paid: toApiString(paid),
      refunded: toApiString(refunded),
      balanceDue: order ? toApiString(subtract(order.total, subtract(paid, refunded))) : null
    },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { collectedAt: -1 } })
  };
}
