import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createTablesController } from './tables.controller.js';
import {
  adminOrderBody,
  cancelSessionBody,
  closeSessionBody,
  idParams,
  sessionItemsBody,
  tableStatusBody
} from './tables.validation.js';

export function createTablesRouter(d) {
  const r = Router(),
    c = createTablesController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get('/tables-board', requirePermission(AUTH_PERMISSIONS.TABLES_READ), asyncHandler(c.board));
  r.get(
    '/tables/:id',
    requirePermission(AUTH_PERMISSIONS.TABLES_READ),
    validate({ params: idParams }),
    asyncHandler(c.table)
  );
  r.patch(
    '/tables/:id',
    requirePermission(AUTH_PERMISSIONS.TABLES_MANAGE),
    validate({ params: idParams, body: tableStatusBody }),
    idempotentAsyncHandler('tables.status', c.status)
  );
  r.post(
    '/tables/:id/admin-orders',
    requirePermission(AUTH_PERMISSIONS.TABLES_MANAGE),
    validate({ params: idParams, body: adminOrderBody }),
    idempotentAsyncHandler('tables.open-order', c.openOrder)
  );
  r.get(
    '/table-sessions/:id',
    requirePermission(AUTH_PERMISSIONS.TABLES_READ),
    validate({ params: idParams }),
    asyncHandler(c.session)
  );
  r.post(
    '/table-sessions/:id/items',
    requirePermission(AUTH_PERMISSIONS.TABLES_MANAGE),
    validate({ params: idParams, body: sessionItemsBody }),
    idempotentAsyncHandler('tables.add-items', c.addItems)
  );
  r.post(
    '/table-sessions/:id/cancel',
    requirePermission(AUTH_PERMISSIONS.TABLES_MANAGE),
    validate({ params: idParams, body: cancelSessionBody }),
    idempotentAsyncHandler('tables.cancel-session', c.cancel)
  );
  r.post(
    '/table-sessions/:id/close',
    requirePermission(AUTH_PERMISSIONS.TABLES_MANAGE),
    validate({ params: idParams, body: closeSessionBody }),
    idempotentAsyncHandler('tables.close-session', c.close)
  );
  r.get(
    '/table-sessions/:id/print-data',
    requirePermission(AUTH_PERMISSIONS.TABLES_READ),
    validate({ params: idParams }),
    asyncHandler(c.print)
  );
  return r;
}
