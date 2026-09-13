import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { hasPermission } from '../../platform/auth/auth-context.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { Employee, EmployeeDevice, Role } from './employee.models.js';
import { toDeviceDto, toEmployeeDto, toEmployeePrivateDto } from './employee.mapper.js';
import { resolveEmployeePermissions } from './permission.service.js';

export async function getEmployeesScreen(filters = {}, context = {}) {
  const models = context.models ?? { Employee, Role, EmployeeDevice };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search)
    query.name = { $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [employees, totalItems, roles, activeCount, pendingDevices] = await Promise.all([
    models.Employee.find(query).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    models.Employee.countDocuments(query),
    models.Role.find({}).sort({ level: -1, name: 1 }).lean(),
    models.Employee.countDocuments({ status: 'ACTIVE' }),
    models.EmployeeDevice.countDocuments({ status: 'PENDING' })
  ]);
  return {
    summary: { total: totalItems, active: activeCount, pendingDevices },
    employees: employees.map(toEmployeeDto),
    roles: roles.map((role) => ({ id: String(role._id), name: role.name, level: role.level })),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { name: 1 } })
  };
}

export async function getEmployeeDetails(employeeId, includes = [], context = {}) {
  const models = context.models ?? { Employee, EmployeeDevice };
  const canReveal =
    includes.includes('password') && hasPermission(context, AUTH_PERMISSIONS.PASSWORD_VIEW);
  let query = models.Employee.findById(employeeId);
  if (canReveal) query = query.select('+passwordPlainText');
  const employee = await query.lean();
  if (!employee)
    throw new ApiError({ code: 'EMPLOYEE_NOT_FOUND', status: 404, messageAr: 'الموظف غير موجود' });
  const result = toEmployeePrivateDto(employee, context, { revealPassword: canReveal });
  if (includes.includes('devices')) {
    const devices = await models.EmployeeDevice.find({ employeeId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10)
      .lean();
    result.devices = {
      items: devices.map(toDeviceDto),
      pageMeta: buildPageMeta({
        page: 1,
        limit: 10,
        totalItems: devices.length,
        sort: { createdAt: -1 }
      })
    };
  }
  if (includes.includes('permissions'))
    result.permissions = await resolveEmployeePermissions(employee, context);
  if (includes.includes('attendance')) {
    if (!context.attendancePort?.listByEmployee)
      throw new ApiError({
        code: 'ATTENDANCE_SOURCE_UNAVAILABLE',
        status: 503,
        messageAr: 'سجل الحضور غير متاح'
      });
    result.attendance = await context.attendancePort.listByEmployee(
      employeeId,
      { page: 1, limit: 10 },
      context
    );
  }
  if (includes.includes('activity')) {
    if (!context.auditPort?.listByActor)
      throw new ApiError({
        code: 'ACTIVITY_SOURCE_UNAVAILABLE',
        status: 503,
        messageAr: 'سجل الأحداث غير متاح'
      });
    result.activity = await context.auditPort.listByActor(
      employeeId,
      { page: 1, limit: 10 },
      context
    );
  }
  return result;
}

export async function listEmployeeDevices(filters = {}, context = {}) {
  const models = context.models ?? { EmployeeDevice };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.status ? { status: filters.status } : {})
  };
  const [devices, totalItems] = await Promise.all([
    models.EmployeeDevice.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.EmployeeDevice.countDocuments(query)
  ]);
  return {
    items: devices.map(toDeviceDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}
