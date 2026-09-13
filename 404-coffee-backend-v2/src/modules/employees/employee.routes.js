import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createEmployeeController } from './employee.controller.js';
import {
  createEmployeeBody,
  deviceDecisionBody,
  employeeDetailsQuery,
  employeeDevicesQuery,
  employeeIdParams,
  employeesQuery,
  permissionMatrixBody,
  updateEmployeeBody
} from './employee.validation.js';
import {
  createRoleBody,
  roleIdParams,
  rolePermissionsBody,
  updateRoleBody
} from './role.validation.js';

export function createEmployeeRouter(dependencies) {
  const router = Router();
  const controller = createEmployeeController(dependencies);
  router.use(employeeAuth(dependencies.config, dependencies.authDependencies));
  router.get(
    '/employees-screen',
    requirePermission(AUTH_PERMISSIONS.EMPLOYEES_READ),
    validate({ query: employeesQuery }),
    asyncHandler(controller.screen)
  );
  router.post(
    '/employees',
    requirePermission(AUTH_PERMISSIONS.EMPLOYEES_CREATE),
    validate({ body: createEmployeeBody }),
    asyncHandler(controller.create)
  );
  router.get(
    '/employees/:id',
    requirePermission(AUTH_PERMISSIONS.EMPLOYEES_READ),
    validate({ params: employeeIdParams, query: employeeDetailsQuery }),
    asyncHandler(controller.details)
  );
  router.get(
    '/employee-devices',
    requirePermission(AUTH_PERMISSIONS.DEVICES_DECIDE),
    validate({ query: employeeDevicesQuery }),
    asyncHandler(controller.devices)
  );
  router.patch(
    '/employees/:id',
    requirePermission(AUTH_PERMISSIONS.EMPLOYEES_UPDATE),
    validate({ params: employeeIdParams, body: updateEmployeeBody }),
    asyncHandler(controller.update)
  );
  router.post(
    '/employee-devices/:id/approve',
    requirePermission(AUTH_PERMISSIONS.DEVICES_DECIDE),
    validate({ params: employeeIdParams, body: deviceDecisionBody }),
    asyncHandler(controller.approveDevice)
  );
  router.post(
    '/employee-devices/:id/block',
    requirePermission(AUTH_PERMISSIONS.DEVICES_DECIDE),
    validate({ params: employeeIdParams, body: deviceDecisionBody }),
    asyncHandler(controller.blockDevice)
  );
  router.post(
    '/employee-devices/:id/revoke',
    requirePermission(AUTH_PERMISSIONS.DEVICES_DECIDE),
    validate({ params: employeeIdParams, body: deviceDecisionBody }),
    asyncHandler(controller.revokeDevice)
  );
  router.put(
    '/employees/:id/permission-matrix',
    requirePermission(AUTH_PERMISSIONS.PERMISSIONS_MANAGE),
    validate({ params: employeeIdParams, body: permissionMatrixBody }),
    asyncHandler(controller.permissionMatrix)
  );
  router.get(
    '/roles',
    requirePermission(AUTH_PERMISSIONS.PERMISSIONS_MANAGE),
    asyncHandler(controller.roles)
  );
  router.post(
    '/roles',
    requirePermission(AUTH_PERMISSIONS.PERMISSIONS_MANAGE),
    validate({ body: createRoleBody }),
    asyncHandler(controller.createRole)
  );
  router.patch(
    '/roles/:id',
    requirePermission(AUTH_PERMISSIONS.PERMISSIONS_MANAGE),
    validate({ params: roleIdParams, body: updateRoleBody }),
    asyncHandler(controller.updateRole)
  );
  router.put(
    '/roles/:id/permissions',
    requirePermission(AUTH_PERMISSIONS.PERMISSIONS_MANAGE),
    validate({ params: roleIdParams, body: rolePermissionsBody }),
    asyncHandler(controller.rolePermissions)
  );
  router.get(
    '/permissions',
    requirePermission(AUTH_PERMISSIONS.PERMISSIONS_MANAGE),
    asyncHandler(controller.permissions)
  );
  return router;
}
