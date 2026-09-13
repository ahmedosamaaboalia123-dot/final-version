import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { bootstrap, shutdown } from '../src/bootstrap.js';

const config = { apiBasePath: '/api/v1', http: { corsOrigins: ['http://localhost:3000'] } };
const buildInfo = { apiVersion: 'v1', schemaVersion: 1, build: 'test' };

describe('health and bootstrap HTTP contract', () => {
  it('returns liveness without probing dependencies', async () => {
    const app = createApp({
      config,
      buildInfo,
      healthProbe: async () => {
        throw new Error('must not run');
      }
    });
    const response = await request(app).get('/health/live').expect(200);
    expect(response.body.data.status).toBe('UP');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('returns readiness when required dependencies are up', async () => {
    const app = createApp({
      config,
      buildInfo,
      healthProbe: async () => ({ mongodb: { status: 'UP', required: true } })
    });
    const response = await request(app).get('/health/ready').expect(200);
    expect(response.body.data.status).toBe('UP');
  });

  it('returns retryable 503 when a required dependency is down', async () => {
    const app = createApp({
      config,
      buildInfo,
      healthProbe: async () => ({ mongodb: { status: 'DOWN', required: true } })
    });
    const response = await request(app).get('/health/ready').expect(503);
    expect(response.body.error.code).toBe('SERVICE_NOT_READY');
    expect(response.body.error.retryable).toBe(true);
  });

  it('returns version and a safe 404 envelope', async () => {
    const app = createApp({ config, buildInfo, healthProbe: async () => ({}) });
    expect((await request(app).get('/system/version').expect(200)).body.data.apiVersion).toBe('v1');
    expect((await request(app).get('/missing').expect(404)).body.error.code).toBe('NOT_FOUND');
  });

  it('mounts the auth contract under api v1 and rejects unknown fields before database access', async () => {
    const app = createApp({ config, buildInfo, healthProbe: async () => ({}) });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        name: 'Admin',
        password: 'plain',
        fingerprint: 'fingerprint-001',
        device: {},
        injected: true
      })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('builds without opening Mongo and shuts down cleanly', async () => {
    const runtime = await bootstrap({
      env: {
        NODE_ENV: 'test',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/test?replicaSet=rs0'
      },
      connectDatabase: false
    });
    expect(runtime.server.listening).toBe(false);
    await expect(shutdown(runtime, 'TEST')).resolves.toEqual({ stopped: true, signal: 'TEST' });
  });
});
