import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/platform/http/error-handler.js';
import { requestPerformance } from '../src/platform/http/request-performance.js';
import { responseTimeout } from '../src/platform/http/response-timeout.js';
import { sendSuccess } from '../src/platform/http/response.js';

describe('request performance controls', () => {
  it('adds response timing headers', async () => {
    const app = express();
    app.use(requestPerformance({ slowMs: 10_000 }));
    app.get('/ok', (_req, res) => sendSuccess(res, { ready: true }));
    const response = await request(app).get('/ok').expect(200);
    expect(response.headers['x-response-time']).toMatch(/^\d+\.\dms$/);
    expect(response.headers['server-timing']).toMatch(/^app;dur=/);
  });

  it('does not send a second response when work finishes after the deadline', async () => {
    const app = express();
    const uncaught = vi.fn();
    app.use(responseTimeout(20));
    app.get('/slow', async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      try {
        sendSuccess(res, { late: true });
      } catch (error) {
        uncaught(error);
      }
    });
    app.use(errorHandler);
    await request(app).get('/slow').expect(503);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(uncaught).not.toHaveBeenCalled();
  });
});
