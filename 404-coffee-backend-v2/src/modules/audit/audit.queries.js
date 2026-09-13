import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { AuditEvent } from '../../platform/audit/audit-event.model.js';

const listItemDto = (event) => ({
  eventNo: event.eventNo,
  eventType: event.eventType,
  module: event.module,
  action: event.action,
  actor: event.actor,
  entity: event.entity,
  result: event.result,
  severity: event.severity,
  occurredAt: event.occurredAt
});

export async function getAuditScreen(filters = {}, context = {}) {
  const model = context.auditModel ?? AuditEvent;
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.module) query.module = filters.module;
  if (filters.eventType) query.eventType = filters.eventType;
  if (filters.actorId) query['actor.id'] = filters.actorId;
  if (filters.result) query.result = filters.result;
  if (filters.severity) query.severity = filters.severity;
  if (filters.from || filters.to)
    query.occurredAt = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {})
    };
  const [rows, totalItems, summaryRows] = await Promise.all([
    model.find(query).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(query),
    model
      .aggregate([
        { $match: query },
        { $group: { _id: { result: '$result', severity: '$severity' }, count: { $sum: 1 } } }
      ])
      .catch(() => [])
  ]);
  const summary = { total: totalItems, success: 0, failed: 0, denied: 0, warning: 0, critical: 0 };
  for (const row of summaryRows) {
    if (row._id?.result === 'SUCCESS') summary.success += row.count;
    else summary.failed += row.count;
    if (row._id?.result === 'DENIED') summary.denied += row.count;
    if (row._id?.severity === 'WARNING') summary.warning += row.count;
    if (row._id?.severity === 'CRITICAL') summary.critical += row.count;
  }
  return {
    summary,
    items: rows.map(listItemDto),
    filters: {
      module: filters.module ?? null,
      eventType: filters.eventType ?? null,
      actorId: filters.actorId ?? null,
      result: filters.result ?? null,
      severity: filters.severity ?? null,
      from: filters.from ?? null,
      to: filters.to ?? null
    },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { occurredAt: -1 } })
  };
}

export async function getAuditEvent(id, context = {}) {
  const model = context.auditModel ?? AuditEvent;
  const event = await model.findById(id).lean();
  if (!event)
    throw new ApiError({ code: 'AUDIT_NOT_FOUND', status: 404, messageAr: 'الحدث غير موجود' });
  const { _id, ...rest } = event;
  return { event: { id: String(_id), ...rest } };
}

export async function getEntityTimeline(entityType, entityId, filters = {}, context = {}) {
  const model = context.auditModel ?? AuditEvent;
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = { 'entity.type': entityType, 'entity.id': String(entityId) };
  const [rows, totalItems] = await Promise.all([
    model.find(query).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(query)
  ]);
  return {
    items: rows.map((event) => ({
      eventNo: event.eventNo,
      eventType: event.eventType,
      action: event.action,
      actor: event.actor,
      result: event.result,
      severity: event.severity,
      occurredAt: event.occurredAt,
      summary: `${event.action} ${event.result}`
    })),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { occurredAt: -1 } })
  };
}
