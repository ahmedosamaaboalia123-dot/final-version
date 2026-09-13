import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createDrawerController } from './drawer.controller.js';
import {
  closeBody,
  idParams,
  listQuery,
  movementBody,
  openBody,
  reverseBody
} from './drawer.validation.js';
export function createDrawerRouter(d) {
  const r = Router(),
    c = createDrawerController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/cash-drawer-screen',
    requirePermission(AUTH_PERMISSIONS.DRAWER_READ),
    asyncHandler(c.screen)
  );
  r.get(
    '/cash-drawer-shifts/:id/transactions',
    requirePermission(AUTH_PERMISSIONS.DRAWER_READ),
    validate({ params: idParams, query: listQuery.pick({ page: true, limit: true }) }),
    asyncHandler(c.transactions)
  );
  r.get(
    '/cash-drawer-shifts/:id/alerts',
    requirePermission(AUTH_PERMISSIONS.DRAWER_READ),
    validate({ params: idParams, query: listQuery.pick({ page: true, limit: true }) }),
    asyncHandler(c.alerts)
  );
  r.post(
    '/cash-drawer-transactions/:id/reverse',
    requirePermission(AUTH_PERMISSIONS.DRAWER_MOVE),
    validate({ params: idParams, body: reverseBody }),
    asyncHandler(c.reverse)
  );
  r.get(
    '/cash-drawer-shifts',
    requirePermission(AUTH_PERMISSIONS.DRAWER_READ),
    validate({ query: listQuery }),
    asyncHandler(c.list)
  );
  r.post(
    '/cash-drawer-shifts',
    requirePermission(AUTH_PERMISSIONS.DRAWER_OPEN),
    validate({ body: openBody }),
    asyncHandler(c.open)
  );
  r.get(
    '/cash-drawer-shifts/:id',
    requirePermission(AUTH_PERMISSIONS.DRAWER_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.post(
    '/cash-drawer-shifts/:id/cash-in',
    requirePermission(AUTH_PERMISSIONS.DRAWER_MOVE),
    validate({ params: idParams, body: movementBody }),
    asyncHandler(c.cashIn)
  );
  r.post(
    '/cash-drawer-shifts/:id/cash-out',
    requirePermission(AUTH_PERMISSIONS.DRAWER_MOVE),
    validate({ params: idParams, body: movementBody }),
    asyncHandler(c.cashOut)
  );
  r.post(
    '/cash-drawer-shifts/:id/close',
    requirePermission(AUTH_PERMISSIONS.DRAWER_CLOSE),
    validate({ params: idParams, body: closeBody }),
    asyncHandler(c.close)
  );
  r.get(
    '/cash-drawer-shifts/:id/print-data',
    requirePermission(AUTH_PERMISSIONS.DRAWER_READ),
    validate({ params: idParams }),
    asyncHandler(c.print)
  );
  return r;
}
