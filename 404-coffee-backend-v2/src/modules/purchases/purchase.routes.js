import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createPurchaseController } from './purchase.controller.js';
import {
  createGroupBody,
  deleteGroupBody,
  idParams,
  registerItemBody,
  registerManyBody,
  screenQuery,
  splitBody,
  updateGroupBody
} from './purchase.validation.js';
export function createPurchaseRouter(d) {
  const r = Router(),
    c = createPurchaseController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/purchases-screen',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.post(
    '/purchase-groups',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_MANAGE),
    validate({ body: createGroupBody }),
    asyncHandler(c.create)
  );
  r.get(
    '/purchase-groups/:id',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.patch(
    '/purchase-groups/:id',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_MANAGE),
    validate({ params: idParams, body: updateGroupBody }),
    asyncHandler(c.update)
  );
  r.delete(
    '/purchase-groups/:id',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_MANAGE),
    validate({ params: idParams, body: deleteGroupBody }),
    asyncHandler(c.remove)
  );
  r.post(
    '/purchase-groups/:id/split-by-supplier',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_MANAGE),
    validate({ params: idParams, body: splitBody }),
    asyncHandler(c.split)
  );
  r.post(
    '/purchase-items/:id/register',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_REGISTER),
    validate({ params: idParams, body: registerItemBody }),
    asyncHandler(c.register)
  );
  r.post(
    '/purchase-groups/:id/register-many',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_REGISTER),
    validate({ params: idParams, body: registerManyBody }),
    asyncHandler(c.registerMany)
  );
  r.get(
    '/purchase-groups/:id/print-data',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_READ),
    validate({ params: idParams }),
    asyncHandler(c.groupPrint)
  );
  r.get(
    '/supplier-purchase-invoices/:id/print-data',
    requirePermission(AUTH_PERMISSIONS.PURCHASES_READ),
    validate({ params: idParams }),
    asyncHandler(c.invoicePrint)
  );
  return r;
}
