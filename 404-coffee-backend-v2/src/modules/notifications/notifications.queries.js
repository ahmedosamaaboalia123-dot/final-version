import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { Notification } from './notifications.models.js';

const dto = (row) => ({
  id: String(row._id),
  type: row.type,
  severity: row.severity,
  title: row.title,
  message: row.message ?? null,
  entityType: row.entityType ?? null,
  entityId: row.entityId ?? null,
  link: row.link ?? null,
  createdAt: row.createdAt,
  readAt: row.readAt ?? null
});

export async function listNotifications(employeeId, filters = {}, context = {}) {
  const models = context.notificationModels ?? { Notification };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = { recipientEmployeeId: employeeId };
  if (filters.unread === true) query.readAt = null;
  const [rows, totalItems, unreadCount] = await Promise.all([
    models.Notification.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.Notification.countDocuments(query),
    models.Notification.countDocuments({ recipientEmployeeId: employeeId, readAt: null })
  ]);
  return {
    unreadCount,
    items: rows.map(dto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}
