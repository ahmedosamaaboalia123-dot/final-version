import { emitDueShiftWarnings } from '../modules/drawer/open-shift-warning.service.js';
import { createNotifications } from '../modules/notifications/notifications.public-service.js';

export async function tickShiftWarnings(context = {}) {
  const emit = context.shiftWarningJobsPort?.emit ?? emitDueShiftWarnings;
  const notify = context.shiftWarningJobsPort?.notify ?? createNotifications;
  const now = context.now ?? new Date();
  const alerts = await emit(now, { ...context, recipientIds: [] });
  let notified = 0;
  for (const alert of alerts) {
    const recipients = [alert.openedBy].filter(Boolean).map(String);
    if (recipients.length === 0) continue;
    const result = await notify(
      recipients,
      {
        type: 'SHIFT_OPEN_TOO_LONG',
        severity: 'WARNING',
        title: 'وردية مفتوحة منذ مدة طويلة',
        message: `الوردية ${alert.shiftNoSnapshot} مفتوحة منذ ${alert.thresholdHours} ساعة`,
        entityType: 'CashDrawerShift',
        entityId: String(alert.shiftId),
        link: `/cash-drawer-shifts/${alert.shiftId}`,
        deduplicationKey: `shift-open:${alert.shiftId}:${alert.thresholdHours}`
      },
      context
    );
    notified += result.created;
  }
  return { alerts: alerts.length, notified };
}
