import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { add, subtract, toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Delegate, DeliveryAssignment } from './delivery.models.js';
import { assignmentDto, delegateDto } from './delivery.mapper.js';

export async function getDelegatesScreen(filters = {}, context = {}) {
  const models = context.deliveryModels ?? { Delegate };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search)
    query.normalizedName = {
      $regex: filters.search.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar-EG'),
      $options: 'i'
    };
  const [rows, totalItems, active] = await Promise.all([
    models.Delegate.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.Delegate.countDocuments(query),
    models.Delegate.countDocuments({ ...query, status: 'ACTIVE' })
  ]);
  return {
    summary: { total: totalItems, active },
    delegates: rows.map(delegateDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function getDelegateDetails(id, include = {}, context = {}) {
  const models = context.deliveryModels ?? { Delegate, DeliveryAssignment };
  const delegate = await models.Delegate.findById(id).lean();
  if (!delegate)
    throw new ApiError({ code: 'DELEGATE_NOT_FOUND', status: 404, messageAr: 'المندوب غير موجود' });
  const result = { delegate: delegateDto(delegate) };
  if (include.activeOrders || include.history) {
    const active = await models.DeliveryAssignment.find({
      delegateId: delegate._id,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    const history = await models.DeliveryAssignment.find({
      delegateId: delegate._id,
      status: { $in: ['DELIVERED', 'FAILED', 'RETURNED', 'REASSIGNED'] }
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10)
      .lean();
    if (include.activeOrders) result.activeOrders = active.map(assignmentDto);
    if (include.history) result.history = history.map(assignmentDto);
  }
  if (include.cashLedger) {
    const settled = await models.DeliveryAssignment.find({
      delegateId: delegate._id,
      status: 'DELIVERED'
    }).lean();
    const expected = settled.reduce((sum, row) => add(sum, row.cashExpected ?? '0'), '0');
    const collected = settled.reduce((sum, row) => add(sum, row.cashSettledTotal ?? '0'), '0');
    result.cashLedger = {
      assignments: settled.length,
      expected: toApiString(expected),
      settled: toApiString(collected),
      outstanding: toApiString(subtract(expected, collected))
    };
  }
  return result;
}

export async function getAssignmentDetails(id, context = {}) {
  const models = context.deliveryModels ?? { DeliveryAssignment };
  const assignment = await models.DeliveryAssignment.findById(id).lean();
  if (!assignment)
    throw new ApiError({
      code: 'ASSIGNMENT_NOT_FOUND',
      status: 404,
      messageAr: 'الإسناد غير موجود'
    });
  return { assignment: assignmentDto(assignment) };
}
export async function getAssignmentByOrder(orderId, context = {}) {
  const models = context.deliveryModels ?? { DeliveryAssignment };
  const assignment = await models.DeliveryAssignment.findOne({ orderId })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return assignment ? assignmentDto(assignment) : null;
}
