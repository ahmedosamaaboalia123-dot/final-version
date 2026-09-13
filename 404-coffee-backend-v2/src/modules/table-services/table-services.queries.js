import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { TableServiceRequest } from './table-services.models.js';
import { serviceRequestDto } from './table-services.mapper.js';

export async function getServicesScreen(filters = {}, context = {}) {
  const models = context.tableServiceModels ?? { TableServiceRequest };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const base = {};
  if (filters.type) base.type = filters.type;
  if (filters.tableNumber) base.tableNumberSnapshot = filters.tableNumber;
  const mainStatus = filters.tab === 'completed' ? { $in: ['RESOLVED', 'CANCELLED'] } : 'OPEN';
  const [rows, totalItems, open, highPriority, resolved] = await Promise.all([
    models.TableServiceRequest.find({ ...base, status: mainStatus })
      .sort({ requestedAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.TableServiceRequest.countDocuments({ ...base, status: mainStatus }),
    models.TableServiceRequest.countDocuments({ ...base, status: 'OPEN' }),
    models.TableServiceRequest.countDocuments({ ...base, status: 'OPEN', priority: 'HIGH' }),
    models.TableServiceRequest.find({ ...base, status: 'RESOLVED' }).lean()
  ]);
  const durations = resolved
    .map((request) => request.responseDurationSeconds)
    .filter((value) => typeof value === 'number');
  const otherTab = filters.tab === 'completed' ? 'OPEN' : { $in: ['RESOLVED', 'CANCELLED'] };
  const otherRows = await models.TableServiceRequest.find({ ...base, status: otherTab })
    .sort({ requestedAt: -1, _id: -1 })
    .limit(10)
    .lean();
  const openRequests = filters.tab === 'completed' ? otherRows : rows;
  const completedRequests = filters.tab === 'completed' ? rows : otherRows;
  return {
    summary: {
      open,
      highPriority,
      averageResponseSeconds:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null
    },
    openRequests: openRequests.map(serviceRequestDto),
    completedRequests: completedRequests.map(serviceRequestDto),
    filters: {
      types: ['CALL_WAITER', 'WATER_REQUEST', 'PARTY_SURPRISE', 'BILL_REQUEST', 'REPORT_PROBLEM']
    },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { requestedAt: 1 } })
  };
}

export async function getServiceRequestDetails(id, context = {}) {
  const models = context.tableServiceModels ?? { TableServiceRequest };
  const request = await models.TableServiceRequest.findById(id).lean();
  if (!request)
    throw new ApiError({
      code: 'SERVICE_NOT_FOUND',
      status: 404,
      messageAr: 'طلب الخدمة غير موجود'
    });
  return { serviceRequest: serviceRequestDto(request) };
}
