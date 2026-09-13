import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createWarningController } from './warning.controller.js';
import { warningsQuery } from './warning.validation.js';

export function createWarningRouter(dependencies) {
  const router = Router();
  const controller = createWarningController(dependencies);
  router.use(employeeAuth(dependencies.config, dependencies.authDependencies));
  router.get(
    '/warnings-screen',
    requirePermission(AUTH_PERMISSIONS.WARNINGS_READ),
    validate({ query: warningsQuery }),
    asyncHandler(controller.screen)
  );
  router.get(
    '/warnings/summary',
    requirePermission(AUTH_PERMISSIONS.WARNINGS_READ),
    asyncHandler(controller.summary)
  );
  return router;
}
