import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createPurchaseReturnController } from './purchase-return.controller.js';
import { createReturnBody, idParams, returnsQuery } from './purchase-return.validation.js';
export function createPurchaseReturnRouter(d) {
  const r = Router(),
    c = createPurchaseReturnController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/purchase-returns-screen',
    requirePermission(AUTH_PERMISSIONS.PURCHASE_RETURNS_READ),
    validate({ query: returnsQuery }),
    asyncHandler(c.screen)
  );
  r.post(
    '/purchase-returns',
    requirePermission(AUTH_PERMISSIONS.PURCHASE_RETURNS_CREATE),
    validate({ body: createReturnBody }),
    idempotentAsyncHandler('purchase-returns.create', c.create)
  );
  r.get(
    '/purchase-returns/:id',
    requirePermission(AUTH_PERMISSIONS.PURCHASE_RETURNS_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.get(
    '/purchase-returns/:id/print-data',
    requirePermission(AUTH_PERMISSIONS.PURCHASE_RETURNS_READ),
    validate({ params: idParams }),
    asyncHandler(c.print)
  );
  return r;
}
