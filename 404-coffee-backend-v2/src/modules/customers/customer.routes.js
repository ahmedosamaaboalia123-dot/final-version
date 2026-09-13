import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createCustomerController } from './customer.controller.js';
import {
  createBody,
  detailQuery,
  idParams,
  screenQuery,
  updateBody
} from './customer.validation.js';

export function createCustomerRouter(d) {
  const r = Router(),
    c = createCustomerController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/customers-screen',
    requirePermission(AUTH_PERMISSIONS.CUSTOMERS_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.post(
    '/customers',
    requirePermission(AUTH_PERMISSIONS.CUSTOMERS_MANAGE),
    validate({ body: createBody }),
    asyncHandler(c.create)
  );
  r.get(
    '/customers/:id',
    requirePermission(AUTH_PERMISSIONS.CUSTOMERS_READ),
    validate({ params: idParams, query: detailQuery }),
    asyncHandler(c.details)
  );
  r.patch(
    '/customers/:id',
    requirePermission(AUTH_PERMISSIONS.CUSTOMERS_MANAGE),
    validate({ params: idParams, body: updateBody }),
    asyncHandler(c.update)
  );
  return r;
}
