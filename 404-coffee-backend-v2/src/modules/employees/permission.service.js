import { ApiError } from '../../platform/http/api-error.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import {
  Employee,
  EmployeePageAccess,
  EmployeePermission,
  Permission,
  Role,
  RolePermission
} from './employee.models.js';

const permissionCache = new Map();
const PERMISSION_CACHE_TTL_MS = 30_000;
const PERMISSION_CACHE_MAX = 500;

function permissionCacheKey(employee) {
  return `${employee._id}:${employee.roleId}:${employee.permissionsVersion}`;
}

async function loadEmployeePermissions(employee, models) {
  const [catalog, roleLinks, overrides, pages] = await Promise.all([
    models.Permission.find({}).lean(),
    models.RolePermission.find({ roleId: employee.roleId }).lean(),
    models.EmployeePermission.find({ employeeId: employee._id }).lean(),
    models.EmployeePageAccess.find({ employeeId: employee._id }).lean()
  ]);
  const byId = new Map(catalog.map((item) => [String(item._id), item]));
  const effective = new Map(roleLinks.map((link) => [String(link.permissionId), 'ALLOW']));
  for (const override of overrides) effective.set(String(override.permissionId), override.effect);
  return {
    permissionKeys: [...effective]
      .filter(([, effect]) => effect === 'ALLOW')
      .map(([permissionId]) => byId.get(permissionId)?.key)
      .filter(Boolean),
    rows: [...effective]
      .map(([permissionId, effect]) => ({ ...byId.get(permissionId), effect }))
      .filter((row) => row.key),
    pages
  };
}

export async function resolveEmployeePermissions(employee, context = {}) {
  const models = context.models ?? {
    Permission,
    RolePermission,
    EmployeePermission,
    EmployeePageAccess
  };
  if (context.models || context.disablePermissionCache)
    return loadEmployeePermissions(employee, models);
  const key = permissionCacheKey(employee);
  const now = Date.now();
  const cached = permissionCache.get(key);
  if (cached?.expiresAt > now) return cached.promise;
  if (permissionCache.size >= PERMISSION_CACHE_MAX)
    permissionCache.delete(permissionCache.keys().next().value);
  const promise = loadEmployeePermissions(employee, models).catch((error) => {
    permissionCache.delete(key);
    throw error;
  });
  permissionCache.set(key, { promise, expiresAt: now + PERMISSION_CACHE_TTL_MS });
  return promise;
}

async function replacePermissionMatrixInTransaction(input, context = {}) {
  const models = context.models ?? {
    Employee,
    Role,
    Permission,
    EmployeePermission,
    EmployeePageAccess
  };
  const employee = await models.Employee.findById(input.employeeId).session(context.session);
  if (!employee)
    throw new ApiError({ code: 'EMPLOYEE_NOT_FOUND', status: 404, messageAr: 'الموظف غير موجود' });
  if (employee.permissionsVersion !== input.expectedPermissionsVersion)
    throw new ApiError({
      code: 'VERSION_CONFLICT',
      status: 409,
      messageAr: 'صلاحيات الموظف تغيرت، أعد تحميل الصفحة'
    });
  const role = await models.Role.findById(input.roleId).session(context.session);
  if (!role)
    throw new ApiError({ code: 'ROLE_NOT_FOUND', status: 404, messageAr: 'الدور غير موجود' });
  const permissionKeys = [...new Set(input.permissions.map((item) => item.permissionKey))];
  const permissions = await models.Permission.find({ key: { $in: permissionKeys } }).session(
    context.session
  );
  if (permissions.length !== permissionKeys.length)
    throw new ApiError({
      code: 'UNKNOWN_PERMISSION',
      status: 422,
      messageAr: 'توجد صلاحية غير معرفة'
    });
  await models.EmployeePermission.deleteMany(
    { employeeId: employee._id },
    { session: context.session }
  );
  if (permissions.length)
    await models.EmployeePermission.insertMany(
      permissions.map((permission) => ({
        employeeId: employee._id,
        permissionId: permission._id,
        effect: input.permissions.find((item) => item.permissionKey === permission.key).effect,
        grantedBy: context.actorId
      })),
      { session: context.session }
    );
  await models.EmployeePageAccess.deleteMany(
    { employeeId: employee._id },
    { session: context.session }
  );
  if (input.pages.length)
    await models.EmployeePageAccess.insertMany(
      input.pages.map((page) => ({
        ...page,
        employeeId: employee._id,
        updatedBy: context.actorId
      })),
      { session: context.session }
    );
  employee.roleId = role._id;
  employee.permissionsVersion += 1;
  await employee.save({ session: context.session });
  await writeAudit(
    {
      eventType: 'EMPLOYEE_PERMISSIONS_REPLACED',
      category: 'SECURITY',
      module: 'employees',
      action: 'PERMISSIONS_REPLACED',
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'Employee', id: employee._id },
      result: 'SUCCESS',
      severity: 'WARNING',
      metadataSafe: { permissionsVersion: employee.permissionsVersion },
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'Employee',
      aggregateId: String(employee._id),
      eventType: 'employee.permissions-replaced',
      payload: {
        employeeId: String(employee._id),
        permissionsVersion: employee.permissionsVersion
      },
      sequence: employee.permissionsVersion
    },
    context
  );
  return {
    employee,
    role,
    permissions,
    pages: input.pages,
    permissionsVersion: employee.permissionsVersion
  };
}

export async function replacePermissionMatrix(input, context = {}) {
  return runInTransaction(
    (tx) => replacePermissionMatrixInTransaction(input, { ...context, session: tx.session }),
    context,
    context.transactionOptions
  );
}
