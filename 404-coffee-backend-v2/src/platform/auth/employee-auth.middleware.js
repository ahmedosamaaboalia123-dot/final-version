import { ApiError } from '../http/api-error.js';
import { verifyAccessToken } from '../../shared/utils/hash-token.js';
import { AuthSession, Employee, EmployeeDevice } from '../../modules/employees/employee.models.js';
import { resolveEmployeePermissions } from '../../modules/employees/permission.service.js';
import { createEmployeeContext } from './auth-context.js';

export function employeeAuth(config, dependencies = {}) {
  const models = dependencies.models ?? { AuthSession, Employee, EmployeeDevice };
  return async function authenticateEmployee(req, _res, next) {
    try {
      const header = req.get('authorization');
      if (!header?.startsWith('Bearer '))
        throw new ApiError({ code: 'AUTH_REQUIRED', status: 401, messageAr: 'تسجيل الدخول مطلوب' });
      let claims;
      try {
        claims = verifyAccessToken(header.slice(7), config.auth.accessSecret);
      } catch {
        throw new ApiError({
          code: 'INVALID_ACCESS_TOKEN',
          status: 401,
          messageAr: 'رمز الدخول غير صالح أو منتهي'
        });
      }
      const [employee, device, session] = await Promise.all([
        models.Employee.findById(claims.sub).lean(),
        models.EmployeeDevice.findById(claims.did).lean(),
        models.AuthSession.findById(claims.sid).lean()
      ]);
      if (
        !employee ||
        employee.status !== 'ACTIVE' ||
        !device ||
        device.status !== 'APPROVED' ||
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        claims.pv !== employee.permissionsVersion ||
        session.permissionsVersion !== employee.permissionsVersion
      )
        throw new ApiError({ code: 'SESSION_STALE', status: 401, messageAr: 'الجلسة غير صالحة' });
      const permissions = await resolveEmployeePermissions(employee, dependencies);
      req.authRuntime = { employee, permissions };
      req.auth = createEmployeeContext({
        employeeId: employee._id,
        deviceId: device._id,
        sessionId: session._id,
        roleIds: [employee.roleId],
        permissions: permissions.permissionKeys,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}
