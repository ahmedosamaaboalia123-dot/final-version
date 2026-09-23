import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createInvoiceController } from './invoice.controller.js';
import { idParams, invoiceListQuery } from './invoice.validation.js';
export function createInvoiceRouter(d) {
  const r = Router(),
    c = createInvoiceController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/invoices',
    requirePermission(AUTH_PERMISSIONS.INVOICES_READ),
    validate({ query: invoiceListQuery }),
    asyncHandler(c.list)
  );
  r.get(
    '/invoices/:id',
    requirePermission(AUTH_PERMISSIONS.INVOICES_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.get(
    '/invoices/:id/print-data',
    requirePermission(AUTH_PERMISSIONS.INVOICES_PRINT),
    validate({ params: idParams }),
    asyncHandler(c.print)
  );
  r.post(
    '/invoices/:id/print-events',
    requirePermission(AUTH_PERMISSIONS.INVOICES_PRINT),
    validate({ params: idParams }),
    idempotentAsyncHandler('invoices.print-event', c.printEvent)
  );
  r.get(
    '/orders/:id/invoice-preview',
    requirePermission(AUTH_PERMISSIONS.INVOICES_READ),
    validate({ params: idParams }),
    asyncHandler(c.preview)
  );
  r.post(
    '/orders/:id/invoice-finalize',
    requirePermission(AUTH_PERMISSIONS.INVOICES_PRINT),
    validate({ params: idParams }),
    idempotentAsyncHandler('invoices.finalize', c.finalize)
  );
  return r;
}
