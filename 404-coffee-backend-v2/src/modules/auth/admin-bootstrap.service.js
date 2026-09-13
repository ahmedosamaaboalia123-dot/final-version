import { ApiError } from '../../platform/http/api-error.js';
import { Employee, Role } from '../employees/employee.models.js';
import { resolveEmployeePermissions } from '../employees/permission.service.js';
import { toEmployeeDto, toSidebarPermissions } from '../employees/employee.mapper.js';
import { AttendanceRecord } from '../attendance/attendance.models.js';
import { toAttendanceDto } from '../attendance/attendance.mapper.js';

export async function getAdminBootstrap(context = {}) {
  const models = context.models ?? { Employee, Role, AttendanceRecord };
  const employee =
    context.authRuntime?.employee ?? (await models.Employee.findById(context.actorId).lean());
  if (!employee || employee.status !== 'ACTIVE')
    throw new ApiError({
      code: 'EMPLOYEE_INACTIVE',
      status: 401,
      messageAr: 'حساب الموظف غير متاح'
    });
  const [role, resolved, currentAttendance] = await Promise.all([
    models.Role.findById(employee.roleId).lean(),
    context.authRuntime?.permissions ?? resolveEmployeePermissions(employee, context),
    models.AttendanceRecord.findOne({ employeeId: employee._id, status: 'OPEN' }).lean()
  ]);
  return {
    employee: toEmployeeDto(employee),
    role: role ? { id: String(role._id), name: role.name, level: role.level } : null,
    permissions: toSidebarPermissions(resolved.rows, resolved.pages),
    notifications: { unreadCount: 0, items: [] },
    currentAttendance: currentAttendance ? toAttendanceDto(currentAttendance) : null,
    currentShift: null,
    featureFlags: {},
    realtime: { token: null, lastSequence: 0 }
  };
}
