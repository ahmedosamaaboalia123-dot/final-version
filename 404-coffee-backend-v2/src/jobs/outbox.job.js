import {
  claimOutboxBatch,
  markPublished,
  moveToDeadLetter,
  publishClaimedEvent,
  scheduleRetry
} from '../platform/events/outbox-publisher.js';
import { publishRealtimeEvent } from '../modules/realtime/realtime.publisher.js';

const MAX_ATTEMPTS = 10;

export async function tickOutbox(context = {}) {
  const claim = context.outboxJobsPort?.claim ?? claimOutboxBatch;
  const batch = await claim({ workerId: 'outbox-worker', limit: 10 }, context);
  const result = { claimed: batch.length, published: 0, retried: 0, dead: 0 };
  for (const event of batch) {
    try {
      const publish = context.outboxJobsPort?.publish ?? publishClaimedEvent;
      await publish(event, context);
      const fanout = context.outboxJobsPort?.fanout ?? publishRealtimeEvent;
      await fanout(event.toObject ? event.toObject() : event, context);
      const mark = context.outboxJobsPort?.mark ?? markPublished;
      await mark(event._id, context);
      result.published += 1;
    } catch (error) {
      if ((event.attempts ?? 0) >= MAX_ATTEMPTS) {
        const bury = context.outboxJobsPort?.bury ?? moveToDeadLetter;
        await bury(event._id, error, context);
        result.dead += 1;
      } else {
        const retry = context.outboxJobsPort?.retry ?? scheduleRetry;
        await retry(event._id, error, context);
        result.retried += 1;
      }
    }
  }
  return result;
}
