import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createOrderController } from './order.controller.js';
import {
  appendBody,
  cancelItemBody,
  cancelOrderBody,
  completeTakeawayBody,
  confirmBody,
  detailQuery,
  historyQuery,
  idParams,
  itemIdParams,
  readyBody,
  readyItemParams,
  screenQuery
} from './order.validation.js';

export function createOrderRouter(d) {
  const r = Router(),
    c = createOrderController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.post(
    '/orders',
    requirePermission(AUTH_PERMISSIONS.ORDERS_CREATE),
    validate({ body: confirmBody }),
    idempotentAsyncHandler('orders.create', c.confirm)
  );
  r.get(
    '/orders-online-screen',
    requirePermission(AUTH_PERMISSIONS.ORDERS_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.get(
    '/order-history-screen',
    requirePermission(AUTH_PERMISSIONS.ORDERS_READ),
    validate({ query: historyQuery }),
    asyncHandler(c.history)
  );
  r.get(
    '/orders/:id',
    requirePermission(AUTH_PERMISSIONS.ORDERS_READ),
    validate({ params: idParams, query: detailQuery }),
    asyncHandler(c.details)
  );
  r.get(
    '/orders/:id/print-data',
    requirePermission(AUTH_PERMISSIONS.ORDERS_READ),
    validate({ params: idParams }),
    asyncHandler(c.print)
  );
  r.post(
    '/orders/:id/items',
    requirePermission(AUTH_PERMISSIONS.ORDERS_UPDATE),
    validate({ params: idParams, body: appendBody }),
    idempotentAsyncHandler('orders.append', c.append)
  );
  r.post(
    '/orders/:id/items/:itemId/cancel',
    requirePermission(AUTH_PERMISSIONS.ORDERS_CANCEL),
    validate({ params: itemIdParams, body: cancelItemBody }),
    idempotentAsyncHandler('orders.cancel-item', c.cancelItem)
  );
  r.post(
    '/orders/:id/cancel',
    requirePermission(AUTH_PERMISSIONS.ORDERS_CANCEL),
    validate({ params: idParams, body: cancelOrderBody }),
    idempotentAsyncHandler('orders.cancel', c.cancel)
  );
  r.post(
    '/orders/:id/complete-takeaway',
    requirePermission(AUTH_PERMISSIONS.ORDERS_COMPLETE),
    validate({ params: idParams, body: completeTakeawayBody }),
    idempotentAsyncHandler('orders.complete-takeaway', c.completeTakeaway)
  );
  r.post(
    '/preparation/order-items/:itemId/ready',
    requirePermission(AUTH_PERMISSIONS.PREPARATION_UPDATE),
    validate({ params: readyItemParams, body: readyBody }),
    idempotentAsyncHandler('orders.item-ready', c.markReady)
  );
  return r;
}
