import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createPreparationController } from './preparation.controller.js';
import { idParams, screenQuery } from './preparation.validation.js';

export function createPreparationRouter(d) {
  const r = Router(),
    c = createPreparationController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/preparation-screen',
    requirePermission(AUTH_PERMISSIONS.PREPARATION_READ),
    asyncHandler(c.dashboard)
  );
  r.get(
    '/preparation/orders',
    requirePermission(AUTH_PERMISSIONS.PREPARATION_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.get(
    '/preparation/orders/:id',
    requirePermission(AUTH_PERMISSIONS.PREPARATION_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  return r;
}
