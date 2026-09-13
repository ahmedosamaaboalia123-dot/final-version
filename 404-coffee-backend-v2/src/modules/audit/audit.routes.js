import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createAuditController } from './audit.controller.js';
import { entityParams, exportBody, idParams, listQuery, screenQuery } from './audit.validation.js';

export function createAuditRouter(d) {
  const r = Router(),
    c = createAuditController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/audit-events-screen',
    requirePermission(AUTH_PERMISSIONS.AUDIT_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.get(
    '/audit-events/exports/:id',
    requirePermission(AUTH_PERMISSIONS.AUDIT_EXPORT),
    validate({ params: idParams }),
    asyncHandler(c.exportStatus)
  );
  r.get(
    '/audit-events/:id',
    requirePermission(AUTH_PERMISSIONS.AUDIT_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.get(
    '/entities/:entityType/:entityId/timeline',
    requirePermission(AUTH_PERMISSIONS.AUDIT_READ),
    validate({ params: entityParams, query: listQuery }),
    asyncHandler(c.timeline)
  );
  r.post(
    '/audit-events/exports',
    requirePermission(AUTH_PERMISSIONS.AUDIT_EXPORT),
    validate({ body: exportBody }),
    asyncHandler(c.export)
  );
  return r;
}
