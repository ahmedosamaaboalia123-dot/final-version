import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('express', async () => {
  const { buildMockExpress } = await import('./route-walker.js');
  return buildMockExpress();
});

const { createV1Router } = await import('../../src/routes/v1.routes.js');
const { createHealthRouter } = await import('../../src/routes/health.routes.js');
const { normalizeRoutes, routeViolations } = await import('./route-walker.js');

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(here, 'route-manifest.json');

const stubDependencies = {
  config: {
    apiBasePath: '/api/v1',
    http: { corsOrigins: [] },
    auth: { accessSecret: 'contract-test-secret-at-least-32-chars' }
  }
};

function collectAll() {
  const health = createHealthRouter({ healthProbe: async () => ({}), buildInfo: {} });
  const v1 = createV1Router(stubDependencies);
  const routes = [
    ...health.__rec.routes.map((route) => ({ ...route, path: route.path })),
    ...v1.__rec.routes.map((route) => ({ ...route, path: `/api/v1${route.path}` }))
  ];
  return normalizeRoutes(routes);
}

describe('route contract', () => {
  it('matches the checked-in route manifest exactly', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const routes = collectAll().map(({ method, path }) => ({ method, path }));
    expect(routes).toEqual(manifest);
  });
  it('guards every route with auth validation and a handler', () => {
    expect(routeViolations(collectAll())).toEqual([]);
  });
});
