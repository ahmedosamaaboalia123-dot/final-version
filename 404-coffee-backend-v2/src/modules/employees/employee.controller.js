import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { createEmployee, decideDevice, deleteEmployee, updateEmployee } from './employee.service.js';
import { getEmployeeDetails, getEmployeesScreen, listEmployeeDevices } from './employee.queries.js';
import { toDeviceDto, toEmployeePrivateDto } from './employee.mapper.js';
import { replacePermissionMatrix } from './permission.service.js';
import {
  createRole,
  listPermissions,
  listRoles,
  replaceRolePermissions,
  updateRole
} from './role.service.js';

const contextFrom = (req, dependencies) => ({ ...req.auth, ...dependencies.serviceContext });
export function createEmployeeController(dependencies) {
  return {
    screen: async (req, res) =>
      sendSuccess(
        res,
        await getEmployeesScreen(req.validated?.query ?? req.query, contextFrom(req, dependencies))
      ),
    create: async (req, res) => {
      const context = contextFrom(req, dependencies);
      const result = await createEmployee(req.validated.body, context);
      return sendCreated(
        res,
        toEmployeePrivateDto(result.employee, context, { revealPassword: true })
      );
    },
    details: async (req, res) => {
      const ctx = contextFrom(req, dependencies);
      ctx.activityPage = req.validated?.query?.activityPage;
      ctx.activityLimit = req.validated?.query?.activityLimit;
      ctx.attendancePage = req.validated?.query?.attendancePage;
      ctx.attendanceLimit = req.validated?.query?.attendanceLimit;
      return sendSuccess(
        res,
        await getEmployeeDetails(
          req.validated.params.id,
          req.validated?.query?.include ?? [],
          ctx
        )
      );
    },
    devices: async (req, res) =>
      sendSuccess(
        res,
        await listEmployeeDevices(req.validated.query, contextFrom(req, dependencies))
      ),
    update: async (req, res) => {
      const result = await updateEmployee(
        req.validated.params.id,
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendSuccess(res, {
        employee: toEmployeePrivateDto(result.employee, contextFrom(req, dependencies)).employee,
        passwordChanged: result.passwordChanged
      });
    },
    remove: async (req, res) =>
      sendSuccess(
        res,
        await deleteEmployee(
          req.validated.params.id,
          req.validated.body,
          contextFrom(req, dependencies)
        )
      ),
    approveDevice: async (req, res) => {
      const result = await decideDevice(
        req.validated.params.id,
        'APPROVED',
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendSuccess(res, {
        device: toDeviceDto(result.device),
        revokedSessionsCount: result.revokedSessionsCount
      });
    },
    blockDevice: async (req, res) => {
      const result = await decideDevice(
        req.validated.params.id,
        'BLOCKED',
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendSuccess(res, {
        device: toDeviceDto(result.device),
        revokedSessionsCount: result.revokedSessionsCount
      });
    },
    revokeDevice: async (req, res) => {
      const result = await decideDevice(
        req.validated.params.id,
        'PENDING',
        req.validated.body,
        contextFrom(req, dependencies)
      );
      return sendSuccess(res, {
        device: toDeviceDto(result.device),
        revokedSessionsCount: result.revokedSessionsCount
      });
    },
    permissionMatrix: async (req, res) =>
      sendSuccess(
        res,
        await replacePermissionMatrix(
          { employeeId: req.validated.params.id, ...req.validated.body },
          contextFrom(req, dependencies)
        )
      ),
    roles: async (req, res) =>
      sendSuccess(res, { items: await listRoles(contextFrom(req, dependencies)) }),
    createRole: async (req, res) =>
      sendCreated(res, await createRole(req.validated.body, contextFrom(req, dependencies))),
    updateRole: async (req, res) =>
      sendSuccess(
        res,
        await updateRole(
          req.validated.params.id,
          req.validated.body,
          contextFrom(req, dependencies)
        )
      ),
    rolePermissions: async (req, res) =>
      sendSuccess(
        res,
        await replaceRolePermissions(
          req.validated.params.id,
          req.validated.body,
          contextFrom(req, dependencies)
        )
      ),
    permissions: async (req, res) =>
      sendSuccess(res, { items: await listPermissions(contextFrom(req, dependencies)) })
  };
}
