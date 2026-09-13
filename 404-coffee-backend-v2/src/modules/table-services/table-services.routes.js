import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createGuestGuards } from '../table-experience/table-experience.middleware.js';
import {
  createTableServiceAdminController,
  createTableServiceGuestController
} from './table-services.controller.js';
import {
  guestCancelBody,
  idParams,
  resolveBody,
  screenQuery,
  serviceBody
} from './table-services.validation.js';

export function createTableServiceGuestRouter(d) {
  const r = Router(),
    c = createTableServiceGuestController(d),
    guards = createGuestGuards(d);
  r.post(
    '/table-experience/services',
    validate({ body: serviceBody }),
    guards.guest,
    asyncHandler(c.create)
  );
  r.post(
    '/table-experience/services/:id/cancel',
    validate({ params: idParams, body: guestCancelBody }),
    guards.guest,
    asyncHandler(c.cancel)
  );
  return r;
}

export function createTableServiceAdminRouter(d) {
  const r = Router(),
    c = createTableServiceAdminController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/table-services-screen',
    requirePermission(AUTH_PERMISSIONS.TABLE_SERVICES_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.get(
    '/table-service-requests/:id',
    requirePermission(AUTH_PERMISSIONS.TABLE_SERVICES_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.post(
    '/table-service-requests/:id/resolve',
    requirePermission(AUTH_PERMISSIONS.TABLE_SERVICES_MANAGE),
    validate({ params: idParams, body: resolveBody }),
    asyncHandler(c.resolve)
  );
  return r;
}
