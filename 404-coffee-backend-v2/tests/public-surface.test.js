import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createV1Router } from '../src/routes/v1.routes.js';

const reviewModels = {
  OrderReview: {
    find: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) }),
    countDocuments: async () => 0
  }
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createV1Router({
      config: {
        apiBasePath: '/api/v1',
        http: { corsOrigins: [] },
        auth: { accessSecret: 'public-surface-test-secret-32-chars', accessTtlSeconds: 900, refreshTtlDays: 30 }
      },
      serviceContext: { reviewModels }
    })
  );
  return app;
}

describe('public surface (no employee token)', () => {
  it('serves public reviews without authentication', async () => {
    const response = await request(buildApp()).get('/api/v1/public-reviews?page=1&limit=2');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('keeps the private reviews list behind employee auth', async () => {
    const response = await request(buildApp()).get('/api/v1/reviews?page=1&limit=2');
    expect(response.status).toBe(401);
  });

  it('routes public order checkout past auth to validation', async () => {
    const response = await request(buildApp()).post('/api/v1/public-orders').send({});
    expect(response.status).toBe(400);
  });

  it('routes table guest bootstrap past auth to validation', async () => {
    const response = await request(buildApp()).post('/api/v1/table-experience/bootstrap').send({});
    expect(response.status).toBe(400);
  });
});
