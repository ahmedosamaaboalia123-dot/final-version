import { redactSensitive } from '../observability/redact.js';
import { OutboxEvent } from './outbox-event.model.js';
import { eventBus } from './event-bus.js';

export async function claimOutboxBatch({ workerId, limit = 10, leaseMs = 30_000 }, context = {}) {
  const model = context.outboxModel ?? OutboxEvent;
  const now = new Date();
  const candidates = await model
    .find({
      status: { $in: ['PENDING', 'PROCESSING'] },
      nextAttemptAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }]
    })
    .sort({ createdAt: 1, _id: 1 })
    .limit(Math.min(limit, 10));
  const claimed = [];
  for (const candidate of candidates) {
    const event = await model.findOneAndUpdate(
      { _id: candidate._id, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] },
      {
        $set: {
          status: 'PROCESSING',
          leaseOwner: workerId,
          leaseUntil: new Date(now.getTime() + leaseMs)
        },
        $inc: { attempts: 1 }
      },
      { new: true }
    );
    if (event) claimed.push(event);
  }
  return claimed;
}

export async function publishClaimedEvent(event, context = {}) {
  const bus = context.eventBus ?? eventBus;
  await bus.publish(event.toObject ? event.toObject() : event);
}

export async function markPublished(eventId, context = {}) {
  const model = context.outboxModel ?? OutboxEvent;
  return model.findOneAndUpdate(
    { _id: eventId, status: 'PROCESSING' },
    { $set: { status: 'PUBLISHED', publishedAt: new Date(), leaseOwner: null, leaseUntil: null } },
    { new: true }
  );
}

export async function scheduleRetry(eventId, error, context = {}) {
  const model = context.outboxModel ?? OutboxEvent;
  const delayMs = context.delayMs ?? 5_000;
  return model.findByIdAndUpdate(
    eventId,
    {
      $set: {
        status: 'PENDING',
        nextAttemptAt: new Date(Date.now() + delayMs),
        leaseOwner: null,
        leaseUntil: null,
        lastErrorSafe: redactSensitive({ message: error.message, code: error.code })
      }
    },
    { new: true }
  );
}

export async function moveToDeadLetter(eventId, error, context = {}) {
  const model = context.outboxModel ?? OutboxEvent;
  return model.findByIdAndUpdate(
    eventId,
    {
      $set: {
        status: 'DEAD',
        leaseOwner: null,
        leaseUntil: null,
        lastErrorSafe: redactSensitive({ message: error.message, code: error.code })
      }
    },
    { new: true }
  );
}
