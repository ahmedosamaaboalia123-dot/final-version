import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../src/platform/http/api-error.js';
import { asyncHandler } from '../src/platform/http/async-handler.js';
import { errorHandler } from '../src/platform/http/error-handler.js';
import { requestIdMiddleware } from '../src/platform/http/request-id.js';
import { sendAccepted, sendCreated, sendList } from '../src/platform/http/response.js';
import { validate } from '../src/platform/http/validate.middleware.js';

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '1kb' }));
  app.post('/created', validate({ body: z.object({ name: z.string() }).strict() }), (req, res) =>
    sendCreated(res, req.validated.body)
  );
  app.get('/list', (_req, res) =>
    sendList(res, [{ id: '1' }], { page: 1, limit: 10, totalItems: 1 })
  );
  app.post('/accepted', (_req, res) => sendAccepted(res, { queued: true }));
  app.get(
    '/failure',
    asyncHandler(async () => {
      throw new ApiError({
        code: 'SAFE_FAILURE',
        status: 409,
        messageAr: 'فشل آمن',
        cause: new Error('password=secret')
      });
    })
  );
  app.use(errorHandler);
  return app;
}

describe('HTTP platform contract', () => {
  it('returns created, list, and accepted envelopes with request IDs', async () => {
    const app = buildApp();
    expect(
      (await request(app).post('/created').send({ name: 'A' }).expect(201)).body.meta.requestId
    ).toBeTruthy();
    expect((await request(app).get('/list').expect(200)).body.meta.limit).toBe(10);
    expect((await request(app).post('/accepted').expect(202)).body.data.queued).toBe(true);
  });

  it('never exposes stack, cause, or secrets in an error response', async () => {
    const response = await request(buildApp()).get('/failure').expect(409);
    const serialized = JSON.stringify(response.body);
    expect(response.body.error.code).toBe('SAFE_FAILURE');
    expect(serialized).not.toMatch(/stack|password|secret|cause/);
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('rejects oversized JSON with a safe 413 and request ID', async () => {
    const response = await request(buildApp())
      .post('/created')
      .send({ name: 'x'.repeat(2048) })
      .expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.meta.requestId).toBeTruthy();
  });
});
