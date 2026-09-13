import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createNotificationsController } from './notifications.controller.js';
import { idParams, listQuery, readAllBody } from './notifications.validation.js';

export function createNotificationsRouter(d) {
  const r = Router(),
    c = createNotificationsController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/notifications',
    requirePermission(AUTH_PERMISSIONS.NOTIFICATIONS_READ),
    validate({ query: listQuery }),
    asyncHandler(c.list)
  );
  r.post(
    '/notifications/:id/read',
    requirePermission(AUTH_PERMISSIONS.NOTIFICATIONS_READ),
    validate({ params: idParams }),
    asyncHandler(c.read)
  );
  r.post(
    '/notifications/read-all',
    requirePermission(AUTH_PERMISSIONS.NOTIFICATIONS_READ),
    validate({ body: readAllBody }),
    asyncHandler(c.readAll)
  );
  return r;
}
