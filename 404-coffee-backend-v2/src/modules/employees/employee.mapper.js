import { hasPermission } from '../../platform/auth/auth-context.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';

const id = (value) => String(value?._id ?? value?.id ?? value);
export function toEmployeeDto(employee) {
  return {
    id: id(employee),
    name: employee.name,
    position: employee.position,
    roleId: id(employee.roleId),
    status: employee.status,
    schedule: {
      workStart: employee.workStart,
      workEnd: employee.workEnd,
      crossesMidnight: employee.crossesMidnight,
      timezone: employee.timezone,
      graceMinutes: employee.graceMinutes
    },
    permissionsVersion: employee.permissionsVersion,
    lastLoginAt: employee.lastLoginAt ?? null,
    version: employee.version ?? 0
  };
}
export function toEmployeePrivateDto(employee, context, { revealPassword = false } = {}) {
  const result = { employee: toEmployeeDto(employee) };
  if (revealPassword && hasPermission(context, AUTH_PERMISSIONS.PASSWORD_VIEW))
    result.passwordPlainText = employee.passwordPlainText;
  return result;
}
export function toDeviceDto(device) {
  return {
    id: id(device),
    employeeId: id(device.employeeId),
    name: device.name ?? null,
    browser: device.browser ?? null,
    os: device.os ?? null,
    status: device.status,
    firstSeenAt: device.firstSeenAt,
    lastSeenAt: device.lastSeenAt,
    lastLoginAt: device.lastLoginAt ?? null,
    attemptCount: device.attemptCount,
    version: device.version ?? 0
  };
}

export function toSidebarPermissions(permissionRows, pageRows = []) {
  const denied = new Set(
    permissionRows.filter((row) => row.effect === 'DENY').map((row) => row.key)
  );
  const allowed = permissionRows.filter((row) => row.effect !== 'DENY' && !denied.has(row.key));
  const visibility = new Map(pageRows.map((row) => [row.pageKey, row.visible]));
  const grouped = new Map();
  for (const permission of allowed) {
    const current = grouped.get(permission.pageKey) ?? [];
    current.push(permission.action);
    grouped.set(permission.pageKey, current);
  }
  return [...grouped]
    .map(([pageKey, actions]) => ({
      pageKey,
      visible: visibility.get(pageKey) ?? true,
      actions: [...new Set(actions)].sort()
    }))
    .filter((item) => item.visible);
}
