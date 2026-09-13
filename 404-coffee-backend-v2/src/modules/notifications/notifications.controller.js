import { sendSuccess } from '../../platform/http/response.js';
import { markAllNotificationsRead, markNotificationRead } from './notifications.service.js';
import { listNotifications } from './notifications.queries.js';

export function createNotificationsController(d) {
  const ctx = (r) => ({ ...r.auth, ...d.serviceContext });
  return {
    list: async (r, s) =>
      sendSuccess(s, await listNotifications(r.auth.actorId, r.validated.query, ctx(r))),
    read: async (r, s) =>
      sendSuccess(s, await markNotificationRead(r.validated.params.id, r.auth.actorId, ctx(r))),
    readAll: async (r, s) =>
      sendSuccess(
        s,
        await markAllNotificationsRead(r.auth.actorId, r.validated.body.before, ctx(r))
      )
  };
}
