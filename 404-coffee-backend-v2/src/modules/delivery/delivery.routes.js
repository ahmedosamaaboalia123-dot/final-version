import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createDeliveryController } from './delivery.controller.js';
import {
  assignBody,
  assignmentActionBody,
  createDelegateBody,
  detailQuery,
  failBody,
  idParams,
  overrideBody,
  reassignBody,
  screenQuery,
  updateDelegateBody
} from './delivery.validation.js';

export function createDeliveryRouter(d) {
  const r = Router(),
    c = createDeliveryController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/delegates-screen',
    requirePermission(AUTH_PERMISSIONS.DELEGATES_READ),
    validate({ query: screenQuery }),
    asyncHandler(c.screen)
  );
  r.post(
    '/delegates',
    requirePermission(AUTH_PERMISSIONS.DELEGATES_MANAGE),
    validate({ body: createDelegateBody }),
    asyncHandler(c.create)
  );
  r.get(
    '/delegates/:id',
    requirePermission(AUTH_PERMISSIONS.DELEGATES_READ),
    validate({ params: idParams, query: detailQuery }),
    asyncHandler(c.details)
  );
  r.patch(
    '/delegates/:id',
    requirePermission(AUTH_PERMISSIONS.DELEGATES_MANAGE),
    validate({ params: idParams, body: updateDelegateBody }),
    asyncHandler(c.update)
  );
  r.post(
    '/orders/:id/assign-delegate',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: assignBody }),
    asyncHandler(c.assign)
  );
  r.get(
    '/delivery-assignments/:id',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams }),
    asyncHandler(c.assignment)
  );
  r.post(
    '/delivery-assignments/:id/handover',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: assignmentActionBody }),
    asyncHandler(c.handover)
  );
  r.post(
    '/delivery-assignments/:id/reassign',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: reassignBody }),
    asyncHandler(c.reassign)
  );
  r.post(
    '/delivery-assignments/:id/failed',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: failBody }),
    asyncHandler(c.failed)
  );
  r.post(
    '/delivery-assignments/:id/returned',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: failBody }),
    asyncHandler(c.returned)
  );
  r.post(
    '/delivery-assignments/:id/admin-confirm-delivery',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: overrideBody }),
    asyncHandler(c.override)
  );
  r.post(
    '/delivery-assignments/:id/settle-cash',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: assignmentActionBody }),
    asyncHandler(c.settle)
  );
  r.post(
    '/delivery-assignments/:id/whatsapp-share-opened',
    requirePermission(AUTH_PERMISSIONS.DELIVERY_MANAGE),
    validate({ params: idParams, body: assignmentActionBody }),
    asyncHandler(c.whatsapp)
  );
  return r;
}
