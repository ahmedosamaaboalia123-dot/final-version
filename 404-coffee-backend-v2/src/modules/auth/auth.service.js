import { hashToken, createOpaqueToken, signAccessToken } from '../../shared/utils/hash-token.js';
import { normalizeName } from '../../shared/utils/normalize-name.js';
import { ApiError } from '../../platform/http/api-error.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import {
  DEVICE_STATUS,
  EMPLOYEE_STATUS,
  LOGIN_RESULT
} from '../../shared/constants/auth.constants.js';
import {
  AuthSession,
  Employee,
  EmployeeDevice,
  LoginAttempt,
  Role
} from '../employees/employee.models.js';
import { resolveEmployeePermissions } from '../employees/permission.service.js';
import { toEmployeeDto, toSidebarPermissions } from '../employees/employee.mapper.js';
import { checkIn } from '../attendance/attendance.service.js';
import { toAttendanceDto } from '../attendance/attendance.mapper.js';

const defaults = { AuthSession, Employee, EmployeeDevice, LoginAttempt, Role };
async function recordAttempt(models, data, context) {
  await models.LoginAttempt.create(
    [{ ...data, ip: context.ip, requestId: context.requestId, occurredAt: new Date() }],
    { session: context.session }
  );
}
async function issueSession(employee, device, context) {
  const models = context.models ?? defaults;
  const refreshToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + context.config.auth.refreshTtlDays * 86_400_000);
  const [session] = await models.AuthSession.create(
    [
      {
        employeeId: employee._id,
        deviceId: device._id,
        refreshTokenHash: hashToken(refreshToken),
        permissionsVersion: employee.permissionsVersion,
        expiresAt,
        ip: context.ip,
        userAgent: context.userAgent
      }
    ],
    { session: context.session }
  );
  const accessToken = signAccessToken(
    {
      sub: String(employee._id),
      sid: String(session._id),
      did: String(device._id),
      pv: employee.permissionsVersion
    },
    context.config.auth.accessSecret,
    context.config.auth.accessTtlSeconds
  );
  return { accessToken, refreshToken, expiresIn: context.config.auth.accessTtlSeconds, session };
}

export async function login(input, context) {
  const result = await runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const normalizedLoginName = normalizeName(input.name);
      const employee = await models.Employee.findOne({ normalizedName: normalizedLoginName })
        .select('+passwordPlainText')
        .session(tx.session);
      const fingerprintHash = hashToken(input.fingerprint);
      if (!employee || employee.passwordPlainText !== input.password) {
        await recordAttempt(
          models,
          {
            employeeId: employee?._id,
            normalizedLoginName,
            fingerprintHash,
            result: LOGIN_RESULT.INVALID_CREDENTIALS
          },
          { ...context, ...tx }
        );
        return {
          failure: new ApiError({
            code: 'INVALID_CREDENTIALS',
            status: 401,
            messageAr: 'الاسم أو كلمة المرور غير صحيحة'
          })
        };
      }
      if (employee.status !== EMPLOYEE_STATUS.ACTIVE) {
        await recordAttempt(
          models,
          {
            employeeId: employee._id,
            normalizedLoginName,
            fingerprintHash,
            result: LOGIN_RESULT.EMPLOYEE_INACTIVE
          },
          { ...context, ...tx }
        );
        return {
          failure: new ApiError({
            code: 'EMPLOYEE_INACTIVE',
            status: 403,
            messageAr: 'حساب الموظف متوقف'
          })
        };
      }
      let device = await models.EmployeeDevice.findOne({
        employeeId: employee._id,
        fingerprintHash
      }).session(tx.session);
      // Admin role bypasses device approval (DECISIONS.md): trusted role logs in
      // from any device with password only. All other roles keep PENDING/BLOCKED flow.
      const loginRole = await models.Role.findById(employee.roleId).session(tx.session);
      const isAdminLogin =
        loginRole !== null &&
        loginRole !== undefined &&
        (loginRole.name === 'Admin' || (loginRole.level ?? 0) >= 100);
      if (!device) {
        [device] = await models.EmployeeDevice.create(
          [
            {
              employeeId: employee._id,
              fingerprint: input.fingerprint,
              fingerprintHash,
              ...input.device,
              userAgentSummary: context.userAgent,
              status: isAdminLogin ? DEVICE_STATUS.APPROVED : DEVICE_STATUS.PENDING
            }
          ],
          { session: tx.session }
        );
      } else {
        device.lastSeenAt = new Date();
        device.attemptCount += 1;
        if (isAdminLogin && device.status !== DEVICE_STATUS.APPROVED) {
          device.status = DEVICE_STATUS.APPROVED;
          device.approvedAt = new Date();
          device.blockedAt = undefined;
          device.blockedBy = undefined;
          device.decisionReason = undefined;
        }
        await device.save({ session: tx.session });
      }
      if (device.status === DEVICE_STATUS.BLOCKED) {
        await recordAttempt(
          models,
          {
            employeeId: employee._id,
            normalizedLoginName,
            deviceId: device._id,
            fingerprintHash,
            result: LOGIN_RESULT.DEVICE_BLOCKED
          },
          { ...context, ...tx }
        );
        return {
          failure: new ApiError({
            code: 'DEVICE_BLOCKED',
            status: 403,
            messageAr: 'هذا الجهاز محظور'
          })
        };
      }
      if (device.status === DEVICE_STATUS.PENDING) {
        await recordAttempt(
          models,
          {
            employeeId: employee._id,
            normalizedLoginName,
            deviceId: device._id,
            fingerprintHash,
            result: LOGIN_RESULT.DEVICE_PENDING
          },
          { ...context, ...tx }
        );
        return {
          httpStatus: 202,
          status: 'DEVICE_APPROVAL_REQUIRED',
          deviceRequestId: String(device._id),
          pollAfterSeconds: 5
        };
      }
      const [role, resolved] = await Promise.all([
        models.Role.findById(employee.roleId).lean(),
        resolveEmployeePermissions(employee, { ...context, ...tx })
      ]);
      const auth = await issueSession(employee, device, { ...context, ...tx });
      const attendanceCheckIn = context.attendanceService?.checkIn ?? checkIn;
      const attendanceResult = await attendanceCheckIn(employee._id, {
        ...context,
        ...tx,
        models: context.attendanceModels,
        deviceId: device._id,
        authSessionId: auth.session._id
      });
      employee.lastLoginAt = new Date();
      device.lastLoginAt = employee.lastLoginAt;
      await Promise.all([
        employee.save({ session: tx.session }),
        device.save({ session: tx.session })
      ]);
      await recordAttempt(
        models,
        {
          employeeId: employee._id,
          normalizedLoginName,
          deviceId: device._id,
          fingerprintHash,
          result: LOGIN_RESULT.SUCCESS
        },
        { ...context, ...tx }
      );
      return {
        httpStatus: 200,
        employee: toEmployeeDto(employee),
        role: role ? { id: String(role._id), name: role.name } : null,
        permissions: toSidebarPermissions(resolved.rows, resolved.pages),
        permissionKeys: resolved.permissionKeys,
        notifications: { unreadCount: 0, items: [] },
        shift: null,
        currentAttendance: toAttendanceDto(attendanceResult.attendance),
        auth: {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          expiresIn: auth.expiresIn
        }
      };
    },
    context,
    context.transactionOptions
  );
  if (result.failure) throw result.failure;
  return result;
}

export async function refreshSession(refreshToken, context) {
  const result = await runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const session = await models.AuthSession.findOne({
        refreshTokenHash: hashToken(refreshToken),
        revokedAt: null,
        expiresAt: { $gt: new Date() }
      })
        .select('+refreshTokenHash')
        .session(tx.session);
      if (!session)
        throw new ApiError({
          code: 'INVALID_REFRESH_TOKEN',
          status: 401,
          messageAr: 'جلسة التحديث غير صالحة'
        });
      const [employee, device] = await Promise.all([
        models.Employee.findById(session.employeeId).session(tx.session),
        models.EmployeeDevice.findById(session.deviceId).session(tx.session)
      ]);
      if (
        !employee ||
        employee.status !== EMPLOYEE_STATUS.ACTIVE ||
        !device ||
        device.status !== DEVICE_STATUS.APPROVED ||
        session.permissionsVersion !== employee.permissionsVersion
      ) {
        session.revokedAt = new Date();
        session.revokeReason = 'AUTH_STATE_CHANGED';
        await session.save({ session: tx.session });
        return {
          failure: new ApiError({
            code: 'SESSION_STALE',
            status: 401,
            messageAr: 'انتهت صلاحية الجلسة بسبب تغير الحساب أو الصلاحيات'
          })
        };
      }
      session.revokedAt = new Date();
      session.revokeReason = 'ROTATED';
      session.lastUsedAt = new Date();
      await session.save({ session: tx.session });
      const auth = await issueSession(employee, device, { ...context, ...tx });
      return {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        expiresIn: auth.expiresIn
      };
    },
    context,
    context.transactionOptions
  );
  if (result.failure) throw result.failure;
  return result;
}

export async function logout({ refreshToken, allSessions }, context) {
  const models = context.models ?? defaults;
  const current = await models.AuthSession.findOne({
    refreshTokenHash: hashToken(refreshToken),
    revokedAt: null
  }).select('+refreshTokenHash');
  if (!current) return { revoked: true };
  const filter = allSessions
    ? { employeeId: current.employeeId, revokedAt: null }
    : { _id: current._id, revokedAt: null };
  await models.AuthSession.updateMany(filter, {
    $set: {
      revokedAt: new Date(),
      revokedBy: context.actorId,
      revokeReason: allSessions ? 'LOGOUT_ALL' : 'LOGOUT'
    }
  });
  return { revoked: true };
}
