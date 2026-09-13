import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createInventoryController } from './inventory.controller.js';
import {
  createMaterialBody,
  deleteMaterialBody,
  idParams,
  materialsQuery,
  prioritiesBody,
  unitsQuery,
  updateMaterialBody,
  withdrawalBody,
  withdrawalsQuery
} from './inventory.validation.js';

export function createInventoryRouter(dependencies) {
  const router = Router();
  const controller = createInventoryController(dependencies);
  router.use(employeeAuth(dependencies.config, dependencies.authDependencies));
  router.get(
    '/measurement-units',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_READ),
    validate({ query: unitsQuery }),
    asyncHandler(controller.units)
  );
  router.get(
    '/raw-materials-screen',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_READ),
    validate({ query: materialsQuery }),
    asyncHandler(controller.screen)
  );
  router.post(
    '/raw-materials',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_MANAGE),
    validate({ body: createMaterialBody }),
    asyncHandler(controller.createMaterial)
  );
  router.get(
    '/raw-materials/:id',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_READ),
    validate({ params: idParams }),
    asyncHandler(controller.details)
  );
  router.patch(
    '/raw-materials/:id',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_MANAGE),
    validate({ params: idParams, body: updateMaterialBody }),
    asyncHandler(controller.updateMaterial)
  );
  router.delete('/raw-materials/:id', requirePermission(AUTH_PERMISSIONS.INVENTORY_MANAGE), validate({ params: idParams, body: deleteMaterialBody }), asyncHandler(controller.deleteMaterial));
  router.post(
    '/raw-materials/:id/withdrawals',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_WITHDRAW),
    validate({ params: idParams, body: withdrawalBody }),
    asyncHandler(controller.withdraw)
  );
  router.put(
    '/raw-materials/:id/batch-priorities',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_PRIORITIES),
    validate({ params: idParams, body: prioritiesBody }),
    asyncHandler(controller.priorities)
  );
  router.get(
    '/withdrawals',
    requirePermission(AUTH_PERMISSIONS.INVENTORY_READ),
    validate({ query: withdrawalsQuery }),
    asyncHandler(controller.withdrawals)
  );
  return router;
}
