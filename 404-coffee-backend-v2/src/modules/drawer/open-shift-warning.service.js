import { DateTime } from 'luxon';
import { runInTransaction } from '../../platform/database/transaction.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { CashDrawerShift, DrawerShiftAlert } from './drawer.models.js';
export async function emitDueShiftWarnings(now = new Date(), context = {}) {
  const m = context.drawerModels ?? { CashDrawerShift, DrawerShiftAlert };
  const shifts = await m.CashDrawerShift.find({
    status: 'OPEN',
    nextOpenShiftWarningAt: { $lte: now }
  }).limit(100);
  const emitted = [];
  for (const candidate of shifts) {
    const alert = await runInTransaction(
      async (tx) => {
        const shift = await m.CashDrawerShift.findOne({
          _id: candidate._id,
          status: 'OPEN',
          nextOpenShiftWarningAt: { $lte: now }
        }).session(tx.session);
        if (!shift) return null;
        const hours = Math.max(
          12,
          Math.floor(
            DateTime.fromJSDate(now).diff(DateTime.fromJSDate(shift.openedAt), 'hours').hours / 12
          ) * 12
        );
        const existing = await m.DrawerShiftAlert.findOne({
          shiftId: shift._id,
          thresholdHours: hours
        }).session(tx.session);
        shift.nextOpenShiftWarningAt = DateTime.fromJSDate(shift.openedAt)
          .plus({ hours: hours + 12 })
          .toJSDate();
        if (existing) {
          await shift.save({ session: tx.session });
          return null;
        }
        const [created] = await m.DrawerShiftAlert.create(
          [
            {
              shiftId: shift._id,
              shiftNoSnapshot: shift.shiftNo,
              thresholdHours: hours,
              openedAtSnapshot: shift.openedAt,
              generatedAt: now,
              openDurationSeconds: Math.floor((now - shift.openedAt) / 1000),
              expectedBalanceSnapshot: shift.expectedClosingBalance,
              currency: shift.currency,
              openedBy: shift.openedBy,
              recipientIds: context.recipientIds ?? []
            }
          ],
          { session: tx.session }
        );
        const event = await enqueueDomainEvent(
          {
            aggregateType: 'CashDrawerShift',
            aggregateId: String(shift._id),
            eventType: 'drawer.shift-open-too-long',
            payload: { shiftId: String(shift._id), thresholdHours: hours },
            sequence: hours / 12
          },
          { ...context, ...tx }
        );
        created.outboxEventId = event._id;
        shift.lastOpenShiftWarningAt = now;
        shift.openShiftWarningCount += 1;
        await Promise.all([
          created.save({ session: tx.session }),
          shift.save({ session: tx.session })
        ]);
        return created;
      },
      context,
      context.transactionOptions
    );
    if (alert) emitted.push(alert);
  }
  return emitted;
}
