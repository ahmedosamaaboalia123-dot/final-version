import { describe, expect, it, vi } from 'vitest';
import { buildChanges, writeAudit } from '../src/platform/audit/audit-writer.js';
import { createEventBus } from '../src/platform/events/event-bus.js';
import { publishClaimedEvent } from '../src/platform/events/outbox-publisher.js';
import { enqueueDomainEvent } from '../src/platform/events/outbox-writer.js';

describe('audit and transactional outbox', () => {
  it('records allowlisted changes without secrets', async () => {
    let stored;
    const model = { create: async ([value]) => ((stored = value), [{ _id: 'audit-1', ...value }]) };
    const changes = buildChanges({ name: 'A', password: 'old' }, { name: 'B', password: 'new' }, [
      'name'
    ]);
    await writeAudit(
      {
        eventNo: 1,
        eventType: 'SUPPLIER_UPDATED',
        category: 'BUSINESS',
        module: 'suppliers',
        action: 'UPDATE',
        actor: { id: 'e1' },
        entity: { type: 'Supplier', id: 's1' },
        changesSafe: changes,
        metadataSafe: { token: 'hidden' },
        result: 'SUCCESS',
        severity: 'INFO'
      },
      { auditModel: model, session: {} }
    );
    expect(stored.changesSafe).toEqual({ name: { before: 'A', after: 'B' } });
    expect(stored.metadataSafe.token).toBe('[REDACTED]');
  });

  it('keeps the committed event when its publisher fails', async () => {
    const rows = [];
    const model = {
      create: async ([value]) => {
        const row = { _id: 'event-1', ...value };
        rows.push(row);
        return [row];
      }
    };
    const event = await enqueueDomainEvent(
      {
        aggregateType: 'Supplier',
        aggregateId: 's1',
        eventType: 'SUPPLIER_CREATED',
        payload: { password: 'must-hide', name: 'Supplier' },
        sequence: 1
      },
      { outboxModel: model, session: {} }
    );
    const bus = createEventBus();
    bus.subscribe('SUPPLIER_CREATED', vi.fn().mockRejectedValue(new Error('socket unavailable')));
    await expect(publishClaimedEvent(event, { eventBus: bus })).rejects.toThrow(
      'socket unavailable'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'PENDING',
      payloadSafe: { password: '[REDACTED]', name: 'Supplier' }
    });
  });

  it('requires the outbox write to share a transaction by default', async () => {
    await expect(
      enqueueDomainEvent(
        {
          aggregateType: 'Order',
          aggregateId: 'o1',
          eventType: 'ORDER_CREATED',
          payload: {},
          sequence: 1
        },
        { outboxModel: {} }
      )
    ).rejects.toThrow(/transaction/);
  });

  it('requires the audit write to share a transaction by default', async () => {
    await expect(
      writeAudit(
        {
          eventType: 'TEST',
          category: 'SYSTEM',
          module: 'test',
          action: 'TEST',
          actor: { id: 'e1' },
          entity: { type: 'Test', id: 't1' },
          result: 'SUCCESS',
          severity: 'INFO'
        },
        { auditModel: {} }
      )
    ).rejects.toThrow(/transaction/);
  });
});
