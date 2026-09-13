import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createReportsController } from './reports.controller.js';
import {
  delegatesQuery,
  exportBody,
  idParams,
  rangeQuery,
  salesQuery,
  screenQuery,
  suppliersQuery
} from './reports.validation.js';

export function createReportsRouter(d) {
  const r = Router(),
    c = createReportsController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/financial-reports-screen',
    requirePermission(AUTH_PERMISSIONS.REPORTS_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.get(
    '/financial-reports/sales',
    requirePermission(AUTH_PERMISSIONS.REPORTS_READ),
    validate({ query: salesQuery }),
    asyncHandler(c.sales)
  );
  r.get(
    '/financial-reports/inventory',
    requirePermission(AUTH_PERMISSIONS.REPORTS_READ),
    validate({ query: rangeQuery }),
    asyncHandler(c.inventory)
  );
  r.get(
    '/financial-reports/drawer',
    requirePermission(AUTH_PERMISSIONS.REPORTS_READ),
    validate({ query: rangeQuery }),
    asyncHandler(c.drawer)
  );
  r.get(
    '/financial-reports/suppliers',
    requirePermission(AUTH_PERMISSIONS.REPORTS_READ),
    validate({ query: suppliersQuery }),
    asyncHandler(c.suppliers)
  );
  r.get(
    '/financial-reports/delegates',
    requirePermission(AUTH_PERMISSIONS.REPORTS_READ),
    validate({ query: delegatesQuery }),
    asyncHandler(c.delegates)
  );
  r.post(
    '/financial-reports/exports',
    requirePermission(AUTH_PERMISSIONS.REPORTS_EXPORT),
    validate({ body: exportBody }),
    asyncHandler(c.export)
  );
  r.get(
    '/financial-reports/exports/:id',
    requirePermission(AUTH_PERMISSIONS.REPORTS_EXPORT),
    validate({ params: idParams }),
    asyncHandler(c.exportStatus)
  );
  return r;
}
