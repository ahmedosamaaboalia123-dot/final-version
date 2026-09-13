import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createOrderCasesController } from './order-cases.controller.js';
import {
  decisionBody,
  emptyBody,
  idParams,
  listQuery,
  rejectBody,
  retryBody
} from './order-cases.validation.js';

export function createOrderCasesRouter(d) {
  const r = Router(),
    c = createOrderCasesController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/order-cancellation-requests',
    requirePermission(AUTH_PERMISSIONS.ORDER_CASES_READ),
    validate({ query: listQuery }),
    asyncHandler(c.list)
  );
  r.get(
    '/order-cancellation-requests/:id',
    requirePermission(AUTH_PERMISSIONS.ORDER_CASES_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.post(
    '/order-cancellation-requests/:id/approve',
    requirePermission(AUTH_PERMISSIONS.ORDER_CASES_MANAGE),
    validate({ params: idParams, body: decisionBody }),
    asyncHandler(c.approve)
  );
  r.post(
    '/order-cancellation-requests/:id/reject',
    requirePermission(AUTH_PERMISSIONS.ORDER_CASES_MANAGE),
    validate({ params: idParams, body: rejectBody }),
    asyncHandler(c.reject)
  );
  r.post(
    '/cash-refunds/:id/retry',
    requirePermission(AUTH_PERMISSIONS.ORDER_CASES_MANAGE),
    validate({ params: idParams, body: retryBody }),
    asyncHandler(c.retry)
  );
  r.post(
    '/cash-refunds/sweep',
    requirePermission(AUTH_PERMISSIONS.ORDER_CASES_MANAGE),
    validate({ body: emptyBody }),
    asyncHandler(c.sweep)
  );
  return r;
}
