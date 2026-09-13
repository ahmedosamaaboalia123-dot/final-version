import { redactSensitive } from '../observability/redact.js';
import { nextSequence } from '../database/sequence.js';
import { AuditEvent } from './audit-event.model.js';

export function buildChanges(before = {}, after = {}, allowlist = []) {
  return Object.fromEntries(
    allowlist
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => [key, { before: before[key] ?? null, after: after[key] ?? null }])
  );
}

export function buildEntityContext(entity, snapshot = {}) {
  return { type: entity.type, id: String(entity.id), snapshot: redactSensitive(snapshot) };
}

export async function writeAudit(event, context = {}) {
  if (!context.session && context.requireTransaction !== false)
    throw new Error('Audit event must be written inside the business transaction');
  const model = context.auditModel ?? AuditEvent;
  const eventNo = event.eventNo ?? (await nextSequence('auditEvent', context));
  const safeEvent = redactSensitive({ ...event, eventNo });
  const [created] = await model.create([safeEvent], { session: context.session });
  return created;
}
