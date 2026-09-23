import { runInTransaction } from '../../platform/database/transaction.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { normalizeName } from '../../shared/utils/normalize-name.js';
import { AuthSession, Employee, EmployeeDevice, Role } from './employee.models.js';
import { OutboxEvent } from '../../platform/events/outbox-event.model.js';

const modelsDefault = { Employee, EmployeeDevice, Role, AuthSession, OutboxEvent };
function auditBase(context, action, entity) {
  return {
    eventType: `EMPLOYEE_${action}`,
    category: 'SECURITY',
    module: 'employees',
    action,
    actor: { type: context.actorType, id: context.actorId },
    entity,
    result: 'SUCCESS',
    severity: 'INFO',
    requestId: context.requestId
  };
}

export async function createEmployee(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? modelsDefault;
      const role = await models.Role.findById(input.roleId).session(tx.session);
      if (!role)
        throw new ApiError({ code: 'ROLE_NOT_FOUND', status: 404, messageAr: 'الدور غير موجود' });
      const [employee] = await models.Employee.create(
        [{ ...input, normalizedName: normalizeName(input.name), createdBy: context.actorId }],
        { session: tx.session }
      );
      await writeAudit(auditBase(context, 'CREATED', { type: 'Employee', id: employee._id }), {
        ...tx,
        ...context
      });
      await enqueueDomainEvent(
        {
          aggregateType: 'Employee',
          aggregateId: String(employee._id),
          eventType: 'employee.created',
          payload: { employeeId: String(employee._id), status: employee.status },
          sequence: employee.version + 1
        },
        { ...tx, ...context }
      );
      return { employee, role, passwordPlainText: employee.passwordPlainText };
    },
    context,
    context.transactionOptions
  );
}

export async function updateEmployee(employeeId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? modelsDefault;
      const employee = await models.Employee.findOne({
        _id: employeeId,
        version: input.expectedVersion
      })
        .select('+passwordPlainText')
        .session(tx.session);
      if (!employee)
        throw new ApiError({
          code: 'EMPLOYEE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الموظف غير موجود أو تم تعديله'
        });
      if (input.roleId && !(await models.Role.exists({ _id: input.roleId }).session(tx.session)))
        throw new ApiError({ code: 'ROLE_NOT_FOUND', status: 404, messageAr: 'الدور غير موجود' });
      const passwordChanged =
        input.passwordPlainText !== undefined &&
        input.passwordPlainText !== employee.passwordPlainText;
      for (const key of ['name', 'passwordPlainText', 'position', 'roleId', 'status'])
        if (input[key] !== undefined) employee[key] = input[key];
      if (input.name) employee.normalizedName = normalizeName(input.name);
      if (input.schedule) Object.assign(employee, input.schedule);
      if (input.status === 'INACTIVE') {
        if (!input.reason)
          throw new ApiError({
            code: 'DEACTIVATION_REASON_REQUIRED',
            status: 422,
            messageAr: 'سبب إيقاف الموظف مطلوب'
          });
        employee.deactivatedAt = new Date();
        employee.deactivatedBy = context.actorId;
        employee.deactivationReason = input.reason;
        await models.AuthSession.updateMany(
          { employeeId, revokedAt: null },
          {
            $set: {
              revokedAt: new Date(),
              revokedBy: context.actorId,
              revokeReason: 'EMPLOYEE_INACTIVE'
            }
          },
          { session: tx.session }
        );
      }
      employee.updatedBy = context.actorId;
      await employee.save({ session: tx.session });
      await writeAudit(auditBase(context, 'UPDATED', { type: 'Employee', id: employee._id }), {
        ...tx,
        ...context
      });
      await enqueueDomainEvent(
        {
          aggregateType: 'Employee',
          aggregateId: String(employee._id),
          eventType: 'employee.updated',
          payload: { employeeId: String(employee._id), status: employee.status },
          sequence: employee.version + 1
        },
        { ...tx, ...context }
      );
      return { employee, passwordChanged };
    },
    context,
    context.transactionOptions
  );
}

export async function deleteEmployee(employeeId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? modelsDefault;
      const employee = await models.Employee.findOne({
        _id: employeeId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!employee)
        throw new ApiError({
          code: 'EMPLOYEE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الموظف غير موجود أو تم تعديله'
        });
      if (context.actorId && String(context.actorId) === String(employee._id))
        throw new ApiError({
          code: 'SELF_DELETE_FORBIDDEN',
          status: 403,
          messageAr: 'لا يمكنك حذف حسابك الحالي'
        });
      const snapshot = { name: employee.name, position: employee.position, status: employee.status };
      await models.Employee.deleteOne({ _id: employee._id }, { session: tx.session });
      const lastEvent = models.OutboxEvent
        ? await models.OutboxEvent.findOne({
            aggregateType: 'Employee',
            aggregateId: String(employee._id)
          })
            .sort({ sequence: -1 })
            .select('sequence')
            .session(tx.session)
        : null;
      const sequence = Number(lastEvent?.sequence ?? employee.version) + 1;
      await writeAudit(
        {
          ...auditBase(context, 'DELETED', { type: 'Employee', id: employee._id }),
          severity: 'WARNING',
          metadataSafe: snapshot
        },
        { ...tx, ...context }
      );
      await enqueueDomainEvent(
        {
          aggregateType: 'Employee',
          aggregateId: String(employee._id),
          eventType: 'employee.deleted',
          payload: { employeeId: String(employee._id), ...snapshot },
          sequence
        },
        { ...tx, ...context }
      );
      return { deleted: true, employeeId: String(employee._id) };
    },
    context,
    context.transactionOptions
  );
}

export async function decideDevice(deviceId, decision, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? modelsDefault;
      const device = await models.EmployeeDevice.findOne({
        _id: deviceId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!device)
        throw new ApiError({
          code: 'DEVICE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الجهاز غير موجود أو تم تعديله'
        });
      if ((decision === 'BLOCKED' || decision === 'PENDING') && !input.reason)
        throw new ApiError({
          code: 'BLOCK_REASON_REQUIRED',
          status: 422,
          messageAr: decision === 'BLOCKED' ? 'سبب الحظر مطلوب' : 'سبب إلغاء الاعتماد مطلوب'
        });
      device.status = decision;
      if (input.name) device.name = input.name;
      if (decision === 'APPROVED') {
        device.approvedAt = new Date();
        device.approvedBy = context.actorId;
        device.blockedAt = undefined;
        device.blockedBy = undefined;
        device.decisionReason = undefined;
      } else if (decision === 'BLOCKED') {
        device.blockedAt = new Date();
        device.blockedBy = context.actorId;
        device.decisionReason = input.reason;
      } else {
        device.approvedAt = undefined;
        device.approvedBy = undefined;
        device.decisionReason = input.reason;
      }
      await device.save({ session: tx.session });
      const revocation =
        decision === 'BLOCKED' || decision === 'PENDING'
          ? await models.AuthSession.updateMany(
              { deviceId, revokedAt: null },
              {
                $set: {
                  revokedAt: new Date(),
                  revokedBy: context.actorId,
                  revokeReason: decision === 'BLOCKED' ? 'DEVICE_BLOCKED' : 'DEVICE_APPROVAL_REVOKED'
                }
              },
              { session: tx.session }
            )
          : { modifiedCount: 0 };
      await writeAudit(
        auditBase(context, `DEVICE_${decision}`, { type: 'EmployeeDevice', id: device._id }),
        { ...tx, ...context }
      );
      await enqueueDomainEvent(
        {
          aggregateType: 'EmployeeDevice',
          aggregateId: String(device._id),
          eventType: `employee-device.${decision.toLowerCase()}`,
          payload: {
            deviceId: String(device._id),
            employeeId: String(device.employeeId),
            status: decision
          },
          sequence: device.version + 1
        },
        { ...tx, ...context }
      );
      return { device, revokedSessionsCount: revocation.modifiedCount ?? 0 };
    },
    context,
    context.transactionOptions
  );
}
