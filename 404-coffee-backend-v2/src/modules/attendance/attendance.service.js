import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Employee } from '../employees/employee.models.js';
import { AttendanceAdjustment, AttendanceRecord } from './attendance.models.js';
import { calculateAttendanceMetrics, resolveAttendanceDate } from './attendance.metrics.js';
import { assertEmployeeHasNoOpenDrawer } from './drawer-checkout.port.js';

const defaults = { Employee, AttendanceRecord, AttendanceAdjustment };
const scheduleOf = (employee) => ({
  workStart: employee.workStart,
  workEnd: employee.workEnd,
  crossesMidnight: employee.crossesMidnight,
  timezone: employee.timezone,
  graceMinutes: employee.graceMinutes
});
const auditEvent = (context, action, record, metadataSafe = {}) => ({
  eventType: `ATTENDANCE_${action}`,
  category: 'HR',
  module: 'attendance',
  action,
  actor: { type: context.actorType, id: context.actorId },
  entity: { type: 'AttendanceRecord', id: record._id },
  metadataSafe,
  result: 'SUCCESS',
  severity: 'INFO',
  requestId: context.requestId,
  occurredAt: new Date()
});

export async function checkIn(employeeId, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const employee = await models.Employee.findById(employeeId).session(tx.session);
      if (!employee || employee.status !== 'ACTIVE')
        throw new ApiError({ code: 'EMPLOYEE_INACTIVE', status: 403, messageAr: 'الموظف غير نشط' });
      const existing = await models.AttendanceRecord.findOne({
        employeeId,
        status: 'OPEN'
      }).session(tx.session);
      if (existing) return { attendance: existing, alreadyOpen: true };
      const checkInAt = context.now ? new Date(context.now) : new Date();
      const scheduleSnapshot = scheduleOf(employee);
      const attendanceDate = resolveAttendanceDate(checkInAt, scheduleSnapshot);
      const metrics = calculateAttendanceMetrics({
        schedule: scheduleSnapshot,
        attendanceDate,
        checkInAt
      });
      let attendance;
      try {
        [attendance] = await models.AttendanceRecord.create(
          [
            {
              employeeId,
              attendanceDate,
              scheduleSnapshot,
              checkInAt,
              checkInDeviceId: context.deviceId,
              checkInSessionId: context.authSessionId,
              lateMinutes: metrics.lateMinutes,
              status: 'OPEN'
            }
          ],
          { session: tx.session }
        );
      } catch (error) {
        if (error?.code !== 11000) throw error;
        attendance = await models.AttendanceRecord.findOne({ employeeId, status: 'OPEN' }).session(
          tx.session
        );
        if (attendance) return { attendance, alreadyOpen: true };
        throw error;
      }
      await writeAudit(
        auditEvent(context, 'CHECKED_IN', attendance, {
          attendanceDate,
          lateMinutes: metrics.lateMinutes
        }),
        { ...context, ...tx }
      );
      await enqueueDomainEvent(
        {
          aggregateType: 'AttendanceRecord',
          aggregateId: String(attendance._id),
          eventType: 'attendance.checked-in',
          payload: {
            attendanceId: String(attendance._id),
            employeeId: String(employeeId),
            status: 'OPEN'
          },
          sequence: 1
        },
        { ...context, ...tx }
      );
      return { attendance, alreadyOpen: false };
    },
    context,
    context.transactionOptions
  );
}

async function closeRecord(attendanceId, input, method, context) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const record = await models.AttendanceRecord.findOne({
        _id: attendanceId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!record)
        throw new ApiError({
          code: 'ATTENDANCE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'سجل الحضور غير موجود أو تم تعديله'
        });
      if (record.status !== 'OPEN')
        throw new ApiError({
          code: 'ATTENDANCE_ALREADY_CLOSED',
          status: 409,
          messageAr: 'تم تسجيل الانصراف بالفعل'
        });
      await assertEmployeeHasNoOpenDrawer(record.employeeId, { ...context, ...tx });
      const checkOutAt = input.checkOutAt
        ? new Date(input.checkOutAt)
        : context.now
          ? new Date(context.now)
          : new Date();
      const metrics = calculateAttendanceMetrics({
        schedule: record.scheduleSnapshot,
        attendanceDate: record.attendanceDate,
        checkInAt: record.checkInAt,
        checkOutAt
      });
      record.checkOutAt = checkOutAt;
      record.checkedOutBy = context.actorId;
      record.checkOutMethod = method;
      record.workedMinutes = metrics.workedMinutes;
      record.status = 'CLOSED';
      record.notes = input.notes ?? input.reason ?? record.notes;
      await record.save({ session: tx.session });
      let adjustment = null;
      if (method === 'FORCE')
        [adjustment] = await models.AttendanceAdjustment.create(
          [
            {
              attendanceId: record._id,
              employeeId: record.employeeId,
              oldValuesSafe: { checkOutAt: null, status: 'OPEN' },
              newValuesSafe: { checkOutAt, status: 'CLOSED', workedMinutes: metrics.workedMinutes },
              kind: 'FORCE_CLOSE',
              reason: input.reason,
              createdBy: context.actorId
            }
          ],
          { session: tx.session }
        );
      await writeAudit(
        auditEvent(context, method === 'FORCE' ? 'FORCE_CLOSED' : 'CHECKED_OUT', record, {
          workedMinutes: metrics.workedMinutes,
          reason: input.reason
        }),
        { ...context, ...tx }
      );
      await enqueueDomainEvent(
        {
          aggregateType: 'AttendanceRecord',
          aggregateId: String(record._id),
          eventType: 'attendance.closed',
          payload: {
            attendanceId: String(record._id),
            employeeId: String(record.employeeId),
            status: 'CLOSED'
          },
          sequence: record.version + 1
        },
        { ...context, ...tx }
      );
      return { attendance: record, adjustment };
    },
    context,
    context.transactionOptions
  );
}

export const adminCheckOut = (attendanceId, input, context) =>
  closeRecord(attendanceId, input, 'ADMIN', context);
export const forceCloseAttendance = (attendanceId, input, context) =>
  closeRecord(attendanceId, input, 'FORCE', context);

export async function createAttendanceAdjustment(attendanceId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const record = await models.AttendanceRecord.findOne({
        _id: attendanceId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!record)
        throw new ApiError({
          code: 'ATTENDANCE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'سجل الحضور غير موجود أو تم تعديله'
        });
      const oldValuesSafe = {
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt ?? null,
        attendanceDate: record.attendanceDate,
        lateMinutes: record.lateMinutes,
        workedMinutes: record.workedMinutes ?? null,
        status: record.status
      };
      const checkInAt = input.changes.checkInAt
        ? new Date(input.changes.checkInAt)
        : record.checkInAt;
      const checkOutAt =
        input.changes.checkOutAt === null
          ? null
          : input.changes.checkOutAt
            ? new Date(input.changes.checkOutAt)
            : record.checkOutAt;
      const attendanceDate = resolveAttendanceDate(checkInAt, record.scheduleSnapshot);
      const metrics = calculateAttendanceMetrics({
        schedule: record.scheduleSnapshot,
        attendanceDate,
        checkInAt,
        checkOutAt
      });
      record.checkInAt = checkInAt;
      record.checkOutAt = checkOutAt;
      record.attendanceDate = attendanceDate;
      record.lateMinutes = metrics.lateMinutes;
      record.workedMinutes = metrics.workedMinutes;
      record.status = checkOutAt ? 'CLOSED' : 'OPEN';
      record.checkOutMethod = checkOutAt ? 'ADJUSTMENT' : undefined;
      record.checkedOutBy = checkOutAt ? context.actorId : undefined;
      await record.save({ session: tx.session });
      const newValuesSafe = {
        checkInAt,
        checkOutAt,
        attendanceDate,
        lateMinutes: metrics.lateMinutes,
        workedMinutes: metrics.workedMinutes,
        status: record.status
      };
      const [adjustment] = await models.AttendanceAdjustment.create(
        [
          {
            attendanceId: record._id,
            employeeId: record.employeeId,
            oldValuesSafe,
            newValuesSafe,
            kind: input.kind,
            reason: input.reason,
            createdBy: context.actorId
          }
        ],
        { session: tx.session }
      );
      await writeAudit(
        auditEvent(context, 'ADJUSTED', record, {
          oldValuesSafe,
          newValuesSafe,
          reason: input.reason
        }),
        { ...context, ...tx }
      );
      await enqueueDomainEvent(
        {
          aggregateType: 'AttendanceRecord',
          aggregateId: String(record._id),
          eventType: 'attendance.adjusted',
          payload: {
            attendanceId: String(record._id),
            employeeId: String(record.employeeId),
            status: record.status
          },
          sequence: record.version + 1
        },
        { ...context, ...tx }
      );
      return { attendance: record, adjustment };
    },
    context,
    context.transactionOptions
  );
}
