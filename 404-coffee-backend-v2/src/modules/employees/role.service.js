import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { AuthSession, Employee, Permission, Role, RolePermission } from './employee.models.js';

const defaults = { AuthSession, Employee, Permission, Role, RolePermission };

export async function ensureSystemRoles(context = {}) {
  const model = context.models?.Role ?? Role;
  const result = await model.bulkWrite(
    [
      { updateOne: { filter: { name: 'Admin' }, update: { $setOnInsert: { name: 'Admin', level: 100, description: 'مدير النظام', isSystem: true } }, upsert: true } },
      { updateOne: { filter: { name: 'Employee' }, update: { $setOnInsert: { name: 'Employee', level: 10, description: 'موظف', isSystem: true } }, upsert: true } }
    ],
    { ordered: false }
  );
  return { created: result.upsertedCount ?? 0 };
}
async function recordRoleChange(role, action, context) {
  await writeAudit(
    {
      eventType: `ROLE_${action}`,
      category: 'SECURITY',
      module: 'employees',
      action,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'Role', id: role._id },
      result: 'SUCCESS',
      severity: 'WARNING',
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'Role',
      aggregateId: String(role._id),
      eventType: `role.${action.toLowerCase()}`,
      payload: { roleId: String(role._id) },
      sequence: (role.version ?? 0) + 1
    },
    context
  );
}
async function resolveCatalog(keys, models, session) {
  const unique = [...new Set(keys)];
  const permissions = await models.Permission.find({ key: { $in: unique } }).session(session);
  if (permissions.length !== unique.length)
    throw new ApiError({
      code: 'UNKNOWN_PERMISSION',
      status: 422,
      messageAr: 'توجد صلاحية غير معرفة'
    });
  return permissions;
}
export async function createRole(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const permissions = await resolveCatalog(input.permissionKeys, models, tx.session);
      const [role] = await models.Role.create(
        [{ name: input.name, level: input.level, description: input.description, isSystem: false }],
        { session: tx.session }
      );
      if (permissions.length)
        await models.RolePermission.insertMany(
          permissions.map((permission) => ({ roleId: role._id, permissionId: permission._id })),
          { session: tx.session }
        );
      await recordRoleChange(role, 'CREATED', { ...context, ...tx });
      return { role, permissions };
    },
    context,
    context.transactionOptions
  );
}
export async function replaceRolePermissions(roleId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const role = await models.Role.findOne({
        _id: roleId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!role)
        throw new ApiError({
          code: 'ROLE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الدور غير موجود أو تم تعديله'
        });
      const permissions = await resolveCatalog(input.permissionKeys, models, tx.session);
      await models.RolePermission.deleteMany({ roleId }, { session: tx.session });
      if (permissions.length)
        await models.RolePermission.insertMany(
          permissions.map((permission) => ({ roleId, permissionId: permission._id })),
          { session: tx.session }
        );
      await role.save({ session: tx.session });
      const employees = await models.Employee.find({ roleId })
        .select('_id permissionsVersion')
        .session(tx.session);
      const employeeIds = employees.map((employee) => employee._id);
      await models.Employee.updateMany(
        { _id: { $in: employeeIds } },
        { $inc: { permissionsVersion: 1 } },
        { session: tx.session }
      );
      await models.AuthSession.updateMany(
        { employeeId: { $in: employeeIds }, revokedAt: null },
        {
          $set: {
            revokedAt: new Date(),
            revokeReason: 'ROLE_PERMISSIONS_CHANGED',
            revokedBy: context.actorId
          }
        },
        { session: tx.session }
      );
      await recordRoleChange(role, 'PERMISSIONS_REPLACED', { ...context, ...tx });
      return { role, permissions, affectedEmployees: employeeIds.length };
    },
    context,
    context.transactionOptions
  );
}

export async function updateRole(roleId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const role = await models.Role.findOne({
        _id: roleId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!role)
        throw new ApiError({
          code: 'ROLE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الدور غير موجود أو تم تعديله'
        });
      if (role.isSystem && input.name && input.name !== role.name)
        throw new ApiError({
          code: 'SYSTEM_ROLE_NAME_LOCKED',
          status: 409,
          messageAr: 'لا يمكن تغيير اسم الدور الأساسي'
        });
      for (const key of ['name', 'level', 'description'])
        if (input[key] !== undefined) role[key] = input[key];
      await role.save({ session: tx.session });
      await recordRoleChange(role, 'UPDATED', { ...context, ...tx });
      return { role };
    },
    context,
    context.transactionOptions
  );
}

export async function listRoles(context = {}) {
  const models = context.models ?? defaults;
  const [roles, permissions, links] = await Promise.all([
    models.Role.find({}).sort({ level: -1, name: 1 }).lean(),
    models.Permission.find({}).sort({ pageKey: 1, action: 1 }).lean(),
    models.RolePermission.find({}).lean()
  ]);
  const byId = new Map(permissions.map((permission) => [String(permission._id), permission.key]));
  return roles.map((role) => ({
    id: String(role._id),
    name: role.name,
    level: role.level,
    description: role.description ?? '',
    isSystem: role.isSystem,
    version: role.version ?? 0,
    permissions: links
      .filter((link) => String(link.roleId) === String(role._id))
      .map((link) => byId.get(String(link.permissionId)))
      .filter(Boolean)
  }));
}

export async function listPermissions(context = {}) {
  const models = context.models ?? defaults;
  return models.Permission.find({}).sort({ pageKey: 1, action: 1 }).lean();
}
