import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createDashboardController } from './dashboard.controller.js';
import { screenQuery } from './dashboard.validation.js';

export function createDashboardRouter(d) {
  const r = Router(),
    c = createDashboardController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/dashboard-screen',
    requirePermission(AUTH_PERMISSIONS.DASHBOARD_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  return r;
}
