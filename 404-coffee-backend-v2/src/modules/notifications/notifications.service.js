import { Notification } from './notifications.models.js';

export async function createNotifications(recipients, payload, context = {}) {
  const models = context.notificationModels ?? { Notification };
  const now = context.now ?? new Date();
  const created = [];
  for (const recipientId of [...new Set(recipients.map(String))]) {
    try {
      const [row] = await models.Notification.create([
        {
          recipientEmployeeId: recipientId,
          type: payload.type,
          severity: payload.severity ?? 'INFO',
          title: payload.title,
          message: payload.message,
          entityType: payload.entityType,
          entityId: payload.entityId ? String(payload.entityId) : undefined,
          link: payload.link,
          deduplicationKey: payload.deduplicationKey,
          metadataSafe: payload.metadataSafe,
          createdAt: now
        }
      ]);
      created.push(row);
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return { created: created.length, skipped: recipients.length - created.length };
}

export async function markNotificationRead(id, employeeId, context = {}) {
  const models = context.notificationModels ?? { Notification };
  const row = await models.Notification.findOneAndUpdate(
    { _id: id, recipientEmployeeId: employeeId, readAt: null },
    { $set: { readAt: context.now ?? new Date() } },
    { new: true }
  );
  const unreadCount = await models.Notification.countDocuments({
    recipientEmployeeId: employeeId,
    readAt: null
  });
  return { updatedCount: row ? 1 : 0, unreadCount };
}

export async function markAllNotificationsRead(employeeId, before, context = {}) {
  const models = context.notificationModels ?? { Notification };
  const query = { recipientEmployeeId: employeeId, readAt: null };
  if (before) query.createdAt = { $lte: new Date(before) };
  const result = await models.Notification.updateMany(query, {
    $set: { readAt: context.now ?? new Date() }
  });
  const unreadCount = await models.Notification.countDocuments({
    recipientEmployeeId: employeeId,
    readAt: null
  });
  return { updatedCount: result.modifiedCount ?? 0, unreadCount };
}
