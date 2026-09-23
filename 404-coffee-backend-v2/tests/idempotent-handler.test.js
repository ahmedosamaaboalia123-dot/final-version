import { describe, expect, it, vi } from 'vitest';
import { idempotentAsyncHandler } from '../src/platform/http/idempotent-handler.js';

function memoryModel() {
  let value = null;
  return {
    findOne: async (filter) =>
      value &&
      value.actorId === filter.actorId &&
      value.scope === filter.scope &&
      value.key === filter.key
        ? value
        : null,
    create: async ([input]) => {
      value = { _id: 'operation-1', ...input };
      return [value];
    },
    findOneAndUpdate: async (_filter, update) => {
      value = { ...value, ...update.$set };
      return value;
    }
  };
}

function response() {
  return {
    locals: { requestId: 'request-1' },
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    set: vi.fn()
  };
}

const request = (body = { amount: '10' }) => ({
  body,
  params: {},
  query: {},
  auth: { actorId: 'employee-1' },
  get: (name) => (name.toLowerCase() === 'idempotency-key' ? 'same-key-123' : undefined)
});

describe('idempotent mutation handler', () => {
  it('executes once and replays the stored financial response', async () => {
    const operationModel = memoryModel();
    const business = vi.fn(async (_req, res) =>
      res.status(201).json({ ok: true, data: { id: 'x' } })
    );
    const handler = idempotentAsyncHandler('payments.collect', business, { operationModel });
    const next = vi.fn();
    const first = response();
    await handler(request(), first, next);
    const second = response();
    await handler(request(), second, next);
    expect(business).toHaveBeenCalledTimes(1);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.payload).toEqual(first.payload);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects reuse of the same key for different money input', async () => {
    const operationModel = memoryModel();
    const business = async (_req, res) => res.json({ ok: true });
    const handler = idempotentAsyncHandler('payments.collect', business, { operationModel });
    await handler(request({ amount: '10' }), response(), vi.fn());
    const next = vi.fn();
    await handler(request({ amount: '11' }), response(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 })
    );
  });

  it('does not let a concurrent waiter mark the owning operation as failed', async () => {
    const operationModel = memoryModel();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const business = vi.fn(async (_req, res) => {
      await gate;
      return res.status(201).json({ ok: true, data: { id: 'only-once' } });
    });
    const handler = idempotentAsyncHandler('orders.create', business, { operationModel });
    const ownerResponse = response();
    const owner = handler(request(), ownerResponse, vi.fn());
    await Promise.resolve();
    const waiterNext = vi.fn();
    await handler(request(), response(), waiterNext);
    expect(waiterNext).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'OPERATION_IN_PROGRESS', status: 409 })
    );
    release();
    await owner;
    const replay = response();
    await handler(request(), replay, vi.fn());
    expect(replay.statusCode).toBe(201);
    expect(replay.payload.data.id).toBe('only-once');
    expect(business).toHaveBeenCalledTimes(1);
  });
});
