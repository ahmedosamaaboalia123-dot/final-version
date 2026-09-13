import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  add,
  compare,
  divide,
  multiply,
  roundMoney,
  roundQuantity,
  toApiString
} from '../src/platform/database/decimal.js';
import {
  appendStableTieBreaker,
  buildPageMeta,
  parsePage
} from '../src/platform/database/pagination.js';
import { runInTransaction } from '../src/platform/database/transaction.js';
import {
  createEmployeeContext,
  requireContextPermission
} from '../src/platform/auth/auth-context.js';
import { ApiError } from '../src/platform/http/api-error.js';
import { validate } from '../src/platform/http/validate.middleware.js';
import {
  beginOperation,
  hashCanonicalRequest
} from '../src/platform/idempotency/idempotency.service.js';
import { redactSensitive } from '../src/platform/observability/redact.js';

describe('decimal and pagination primitives', () => {
  it('keeps exact decimal arithmetic and applies explicit rounding', () => {
    expect(toApiString(add('0.1', '0.2'))).toBe('0.3');
    expect(toApiString(multiply('12.345', '3'))).toBe('37.035');
    expect(toApiString(divide('1', '3', 6))).toBe('0.333333');
    expect(toApiString(roundMoney('10.555'))).toBe('10.56');
    expect(toApiString(roundQuantity('0.1234567'))).toBe('0.123457');
    expect(compare('999999999999999999.99', '999999999999999999.98')).toBe(1);
  });

  it('enforces ten rows and stable ordering', () => {
    expect(parsePage({})).toEqual({ page: 1, limit: 10 });
    expect(() => parsePage({ limit: 11 })).toThrow(ApiError);
    expect(appendStableTieBreaker({ createdAt: -1 })).toEqual({ createdAt: -1, _id: -1 });
    expect(buildPageMeta({ page: 2, limit: 10, totalItems: 21, sort: { name: 1 } })).toMatchObject({
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true
    });
  });
});

describe('validation, redaction, and idempotency', () => {
  it('builds immutable employee auth context and enforces permission keys', () => {
    const context = createEmployeeContext({
      employeeId: 'e1',
      deviceId: 'd1',
      permissions: ['suppliers.read', 'suppliers.read']
    });
    expect(context.permissions).toEqual(['suppliers.read']);
    expect(() => requireContextPermission(context, 'suppliers.write')).toThrow(ApiError);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('rejects unknown body fields and formats issues', async () => {
    const middleware = validate({ body: z.object({ name: z.string() }).strict() });
    const req = { body: { name: 'valid', $where: 'attack' } };
    const next = vi.fn();
    middleware(req, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('redacts nested secrets and canonicalizes request hashes', () => {
    expect(redactSensitive({ user: { password: 'plain' }, authorization: 'Bearer x' })).toEqual({
      user: { password: '[REDACTED]' },
      authorization: '[REDACTED]'
    });
    expect(hashCanonicalRequest({ b: 2, a: 1 })).toBe(hashCanonicalRequest({ a: 1, b: 2 }));
  });

  it('preserves dates and bson values instead of emptying them', () => {
    const at = new Date('2026-09-12T10:00:00Z');
    const out = redactSensitive({ occurredAt: at, nested: { token: 'abc', at } });
    expect(out.occurredAt).toBe(at);
    expect(out.nested).toMatchObject({ token: '[REDACTED]', at });
  });

  it('returns one operation for a double click and rejects another body', async () => {
    const rows = [];
    const model = {
      findOne: async (filter) =>
        rows.find(
          (row) =>
            row.actorId === filter.actorId && row.scope === filter.scope && row.key === filter.key
        ) ?? null,
      create: async ([value]) => {
        const row = { _id: 'op-1', ...value };
        rows.push(row);
        return [row];
      }
    };
    const base = {
      actorId: 'employee-1',
      scope: 'supplier.create',
      key: 'request-0001',
      requestHash: hashCanonicalRequest({ name: 'A' }),
      leaseMs: 1000
    };
    expect((await beginOperation(base, { operationModel: model })).state).toBe('NEW');
    expect((await beginOperation(base, { operationModel: model })).state).toBe('PROCESSING');
    await expect(
      beginOperation(
        { ...base, requestHash: hashCanonicalRequest({ name: 'B' }) },
        { operationModel: model }
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
    expect(rows).toHaveLength(1);
  });
});

describe('transaction wrapper', () => {
  it('reuses a parent session instead of opening a nested transaction', async () => {
    const startSession = vi.fn();
    const parent = { id: 'parent' };
    const result = await runInTransaction(
      async (context) => context.session.id,
      { session: parent },
      { startSession }
    );
    expect(result).toBe('parent');
    expect(startSession).not.toHaveBeenCalled();
  });

  it('retries transient failures and ends every session', async () => {
    let workAttempts = 0;
    const sessions = [];
    const transient = new Error('write conflict');
    transient.hasErrorLabel = (label) => label === 'TransientTransactionError';
    const startSession = async () => {
      const session = { withTransaction: async (callback) => callback(), endSession: vi.fn() };
      sessions.push(session);
      return session;
    };
    const result = await runInTransaction(
      async () => {
        workAttempts += 1;
        if (workAttempts === 1) throw transient;
        return 'committed';
      },
      {},
      { startSession }
    );
    expect(result).toBe('committed');
    expect(workAttempts).toBe(2);
    expect(sessions.every((session) => session.endSession.mock.calls.length === 1)).toBe(true);
  });

  it('rolls back changes across multiple stores when work fails', async () => {
    const first = [];
    const second = [];
    const session = {
      async withTransaction(callback) {
        const snapshots = [first.slice(), second.slice()];
        try {
          await callback();
        } catch (error) {
          first.splice(0, first.length, ...snapshots[0]);
          second.splice(0, second.length, ...snapshots[1]);
          throw error;
        }
      },
      endSession: vi.fn()
    };
    await expect(
      runInTransaction(
        async () => {
          first.push('supplier');
          second.push('audit');
          throw new Error('abort');
        },
        {},
        { startSession: async () => session }
      )
    ).rejects.toThrow('abort');
    expect(first).toEqual([]);
    expect(second).toEqual([]);
  });
});
