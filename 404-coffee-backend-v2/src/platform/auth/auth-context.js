import { ApiError } from '../http/api-error.js';

export function createAnonymousContext({ requestId, ip, userAgent } = {}) {
  return Object.freeze({
    actorType: 'ANONYMOUS',
    actorId: null,
    permissions: Object.freeze([]),
    requestId,
    ip,
    userAgent
  });
}

export function createEmployeeContext({
  employeeId,
  deviceId,
  sessionId,
  roleIds = [],
  permissions = [],
  requestId,
  ip,
  userAgent
}) {
  if (!employeeId || !deviceId)
    throw new ApiError({
      code: 'INVALID_AUTH_CONTEXT',
      status: 401,
      messageAr: 'بيانات جلسة الموظف غير مكتملة'
    });
  return Object.freeze({
    actorType: 'EMPLOYEE',
    actorId: String(employeeId),
    deviceId: String(deviceId),
    sessionId: sessionId ? String(sessionId) : null,
    roleIds: Object.freeze([...roleIds]),
    permissions: Object.freeze([...new Set(permissions)]),
    requestId,
    ip,
    userAgent
  });
}

export function hasPermission(context, permission) {
  return context?.permissions?.includes('*') || context?.permissions?.includes(permission);
}

export function requireContextPermission(context, permission) {
  if (!hasPermission(context, permission))
    throw new ApiError({
      code: 'FORBIDDEN',
      status: 403,
      messageAr: 'ليس لديك صلاحية لتنفيذ العملية'
    });
}
