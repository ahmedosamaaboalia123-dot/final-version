import { redactSensitive } from '../observability/redact.js';
import { OutboxEvent } from './outbox-event.model.js';

export async function enqueueDomainEvent(event, context = {}) {
  if (!context.session && context.requireTransaction !== false) {
    throw new Error('Outbox event must be written inside the business transaction');
  }
  const model = context.outboxModel ?? OutboxEvent;
  const { payload, ...eventMetadata } = event;
  const [created] = await model.create(
    [
      {
        ...eventMetadata,
        payloadSafe: redactSensitive(payload),
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date()
      }
    ],
    { session: context.session }
  );
  return created;
}
