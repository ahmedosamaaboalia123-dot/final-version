import { buildPageMeta, buildSkipLimit, parsePage } from '../database/pagination.js';
import { AuditEvent } from './audit-event.model.js';

export async function listAuditByActor(actorId, filters = {}, context = {}) {
  const model = context.auditModel ?? AuditEvent;
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = { 'actor.id': String(actorId) };
  const [items, totalItems] = await Promise.all([
    model.find(query).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(query)
  ]);
  return {
    items,
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { occurredAt: -1 } })
  };
}
