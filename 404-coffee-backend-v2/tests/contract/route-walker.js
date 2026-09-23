const AUTH_GUARDS = new Set(['authenticateEmployee', 'tracking', 'action', 'session', 'guest']);

const SIMPLE_INFRA_ROUTES = new Set([
  'GET /health/live',
  'GET /health/ready',
  'GET /system/version',
  'GET /api/v1/'
]);

const AUTH_ONLY_BY_DESIGN = new Set([
  'GET /api/v1/admin/bootstrap',
  'POST /api/v1/attendance/check-in'
]);

function recordingRouter() {
  const rec = { routes: [], guards: [] };
  const router = { __rec: rec };
  router.use = (...args) => {
    const prefix = args.find((arg) => typeof arg === 'string') ?? '';
    const fns = args.filter((arg) => typeof arg !== 'string');
    const child = fns.find((fn) => fn?.__rec);
    if (!prefix && !child) {
      rec.guards.push(...fns);
      return router;
    }
    for (const fn of fns) {
      if (fn?.__rec) {
        for (const route of fn.__rec.routes)
          rec.routes.push({
            method: route.method,
            path: `${prefix}${route.path}`.replace(/\/+/g, '/'),
            guards: [...rec.guards, ...route.guards]
          });
      } else if (typeof fn === 'function') rec.guards.push(fn);
    }
    return router;
  };
  for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
    router[method] = (path, ...handlers) => {
      rec.routes.push({ method: method.toUpperCase(), path, guards: [...rec.guards, ...handlers] });
      return router;
    };
  }
  return router;
}

export function buildMockExpress() {
  return { Router: recordingRouter };
}

export function normalizeRoutes(routes) {
  return routes
    .map((route) => ({
      method: route.method,
      path: route.path.replace(/\/+/g, '/'),
      guards: [...new Set(route.guards.map((guard) => guard?.name || 'anonymous'))]
    }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function isPublicRoute(route) {
  const key = `${route.method} ${route.path}`;
  if (
    [
      'GET /health/live',
      'GET /health/ready',
      'GET /system/version',
      'GET /api/v1/',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'POST /api/v1/auth/logout',
      'GET /api/v1/catalog',
      'POST /api/v1/customer-ai/chat',
      'GET /api/v1/realtime/sync',
      'GET /api/v1/media/:id/content',
      'GET /api/v1/public-reviews'
    ].includes(key)
  )
    return true;
  return (
    route.path.startsWith('/api/v1/public-orders') ||
    route.path.startsWith('/api/v1/customer-access-sessions') ||
    route.path.startsWith('/api/v1/customer/orders') ||
    route.path.startsWith('/api/v1/table-experience/')
  );
}

export function routeViolations(routes) {
  const violations = [];
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    const hasAuth = route.guards.some((guard) => AUTH_GUARDS.has(guard));
    if (!hasAuth && !isPublicRoute(route))
      violations.push(`missing-auth ${route.method} ${route.path}`);
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(route.method) &&
      !route.guards.includes('validationMiddleware')
    )
      violations.push(`missing-validation ${route.method} ${route.path}`);
    if (route.guards[route.guards.length - 1] !== 'handledRequest' && !SIMPLE_INFRA_ROUTES.has(key))
      violations.push(`missing-handler ${route.method} ${route.path}`);
    if (
      hasAuth &&
      !route.guards.includes('permissionMiddleware') &&
      !AUTH_ONLY_BY_DESIGN.has(key) &&
      !['tracking', 'action', 'session', 'guest'].some((guard) => route.guards.includes(guard))
    )
      violations.push(`missing-permission ${route.method} ${route.path}`);
  }
  return violations;
}
