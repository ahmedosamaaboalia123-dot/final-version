import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { OrderCancellationRequest } from '../customer-experience/customer-experience.models.js';

const dto = (request) => ({
  id: String(request._id),
  orderId: String(request.orderId),
  customerId: request.customerId ? String(request.customerId) : null,
  status: request.status,
  reason: request.reason,
  requestedAt: request.requestedAt,
  decidedAt: request.decidedAt ?? null,
  version: request.version ?? 0
});

export async function listCancellationRequests(filters = {}, context = {}) {
  const models = context.orderCaseModels ?? { OrderCancellationRequest };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.status) query.status = filters.status;
  const [rows, totalItems, pending] = await Promise.all([
    models.OrderCancellationRequest.find(query)
      .sort({ requestedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.OrderCancellationRequest.countDocuments(query),
    models.OrderCancellationRequest.countDocuments({ ...query, status: 'PENDING' })
  ]);
  return {
    summary: { total: totalItems, pending },
    requests: rows.map(dto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { requestedAt: -1 } })
  };
}

export async function getCancellationRequest(id, context = {}) {
  const models = context.orderCaseModels ?? { OrderCancellationRequest };
  const request = await models.OrderCancellationRequest.findById(id).lean();
  if (!request)
    throw new ApiError({ code: 'CASE_NOT_FOUND', status: 404, messageAr: 'طلب الإلغاء غير موجود' });
  return { request: dto(request) };
}
