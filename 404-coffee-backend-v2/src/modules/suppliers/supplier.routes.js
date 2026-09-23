import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createSupplierController } from './supplier.controller.js';
import {
  createEntryBody,
  createSupplierBody,
  deleteEntryBody,
  deleteSupplierBody,
  entriesQuery,
  reverseEntryBody,
  supplierIdParams,
  suppliersQuery,
  updateEntryBody,
  updateSupplierBody
} from './supplier.validation.js';

export function createSupplierRouter(dependencies) {
  const router = Router();
  const controller = createSupplierController(dependencies);
  router.use(employeeAuth(dependencies.config, dependencies.authDependencies));
  router.get(
    '/suppliers-screen',
    requirePermission(AUTH_PERMISSIONS.SUPPLIERS_READ),
    validate({ query: suppliersQuery }),
    asyncHandler(controller.screen)
  );
  router.post(
    '/suppliers',
    requirePermission(AUTH_PERMISSIONS.SUPPLIERS_CREATE),
    validate({ body: createSupplierBody }),
    idempotentAsyncHandler('suppliers.create', controller.create)
  );
  router.get(
    '/suppliers/:id',
    requirePermission(AUTH_PERMISSIONS.SUPPLIERS_READ),
    validate({ params: supplierIdParams }),
    asyncHandler(controller.details)
  );
  router.patch(
    '/suppliers/:id',
    requirePermission(AUTH_PERMISSIONS.SUPPLIERS_UPDATE),
    validate({ params: supplierIdParams, body: updateSupplierBody }),
    asyncHandler(controller.update)
  );
  router.delete('/suppliers/:id', requirePermission(AUTH_PERMISSIONS.SUPPLIERS_UPDATE), validate({ params: supplierIdParams, body: deleteSupplierBody }), idempotentAsyncHandler('suppliers.delete', controller.deleteSupplier));
  router.post(
    '/suppliers/:id/account-entries',
    requirePermission(AUTH_PERMISSIONS.SUPPLIERS_ACCOUNT_WRITE),
    validate({ params: supplierIdParams, body: createEntryBody }),
    idempotentAsyncHandler('suppliers.entry', controller.createEntry)
  );
  router.patch('/supplier-account-entries/:id', requirePermission(AUTH_PERMISSIONS.SUPPLIERS_ACCOUNT_WRITE), validate({ params: supplierIdParams, body: updateEntryBody }), asyncHandler(controller.updateEntry));
  router.delete('/supplier-account-entries/:id', requirePermission(AUTH_PERMISSIONS.SUPPLIERS_ACCOUNT_REVERSE), validate({ params: supplierIdParams, body: deleteEntryBody }), idempotentAsyncHandler('suppliers.delete-entry', controller.deleteEntry));
  router.get(
    '/suppliers/:id/account-entries',
    requirePermission(AUTH_PERMISSIONS.SUPPLIERS_READ),
    validate({ params: supplierIdParams, query: entriesQuery }),
    asyncHandler(controller.entries)
  );
  router.post(
    '/supplier-account-entries/:id/reverse',
    requirePermission(AUTH_PERMISSIONS.SUPPLIERS_ACCOUNT_REVERSE),
    validate({ params: supplierIdParams, body: reverseEntryBody }),
    idempotentAsyncHandler('suppliers.reverse', controller.reverse)
  );
  return router;
}
