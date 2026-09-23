import { describe, expect, it, vi } from 'vitest';
import { login, refreshSession } from '../src/modules/auth/auth.service.js';
import { toEmployeePrivateDto } from '../src/modules/employees/employee.mapper.js';
import { decideDevice, deleteEmployee } from '../src/modules/employees/employee.service.js';
import { employeeAuth } from '../src/platform/auth/employee-auth.middleware.js';
import { AUTH_PERMISSIONS } from '../src/shared/constants/auth.constants.js';
import { hashToken, signAccessToken, verifyAccessToken } from '../src/shared/utils/hash-token.js';

const config = {
  auth: {
    accessSecret: 'a-secure-test-secret-with-32-characters',
    accessTtlSeconds: 900,
    refreshTtlDays: 30
  }
};
function chained(value) {
  const query = { select: () => query, session: async () => value, lean: async () => value };
  return query;
}
const baseContext = {
  config,
  session: {},
  requestId: 'request-1',
  ip: '127.0.0.1',
  userAgent: 'test',
  actorType: 'EMPLOYEE',
  actorId: 'admin-1'
};

describe('employee password and token policy', () => {
  it('reveals plaintext password only with the dedicated permission', () => {
    const employee = {
      _id: 'e1',
      name: 'Admin',
      position: 'Manager',
      roleId: 'r1',
      status: 'ACTIVE',
      workStart: '09:00',
      workEnd: '17:00',
      crossesMidnight: false,
      timezone: 'Africa/Cairo',
      graceMinutes: 0,
      permissionsVersion: 1,
      passwordPlainText: 'visible-value'
    };
    expect(
      toEmployeePrivateDto(employee, { permissions: [] }, { revealPassword: true })
        .passwordPlainText
    ).toBeUndefined();
    expect(
      toEmployeePrivateDto(
        employee,
        { permissions: [AUTH_PERMISSIONS.PASSWORD_VIEW] },
        { revealPassword: true }
      ).passwordPlainText
    ).toBe('visible-value');
  });

  it('signs, verifies, and expires access tokens deterministically', () => {
    const token = signAccessToken({ sub: 'e1', pv: 2 }, config.auth.accessSecret, 60, 1_000_000);
    expect(verifyAccessToken(token, config.auth.accessSecret, 1_030_000)).toMatchObject({
      sub: 'e1',
      pv: 2
    });
    expect(() => verifyAccessToken(token, config.auth.accessSecret, 1_061_000)).toThrow(
      'TOKEN_EXPIRED'
    );
  });
});

describe('login device flow', () => {
  it('creates a pending device without issuing a full session', async () => {
    const createdDevices = [];
    const employee = {
      _id: 'e1',
      name: 'Admin',
      normalizedName: 'admin',
      passwordPlainText: 'plain',
      status: 'ACTIVE'
    };
    const models = {
      Employee: { findOne: () => chained(employee) },
      Role: { findById: () => chained({ _id: 'r1', name: 'Cashier', level: 10 }) },
      EmployeeDevice: {
        findOne: () => chained(null),
        create: async ([value]) => {
          const device = { _id: 'd1', version: 0, ...value };
          createdDevices.push(device);
          return [device];
        }
      },
      LoginAttempt: { create: vi.fn(async () => [{}]) },
      AuthSession: { create: vi.fn() }
    };
    const result = await login(
      {
        name: 'ADMIN',
        password: 'plain',
        fingerprint: 'fingerprint-001',
        device: { name: 'Chrome', browser: 'Chrome', os: 'Windows' }
      },
      { ...baseContext, models }
    );
    expect(result).toMatchObject({
      httpStatus: 202,
      status: 'DEVICE_APPROVAL_REQUIRED',
      deviceRequestId: 'd1'
    });
    expect(createdDevices[0].status).toBe('PENDING');
    expect(models.AuthSession.create).not.toHaveBeenCalled();
  });

  it('auto-approves a new device for the Admin role and issues a full session', async () => {
    const createdDevices = [];
    const employee = {
      _id: 'e1',
      name: 'Admin',
      normalizedName: 'admin',
      passwordPlainText: 'plain',
      status: 'ACTIVE',
      roleId: 'r1',
      permissionsVersion: 1,
      save: vi.fn(async () => undefined)
    };
    const permission = { _id: 'p1', key: 'orders.read', pageKey: 'orders', action: 'read' };
    const models = {
      Employee: { findOne: () => chained(employee) },
      Role: { findById: () => chained({ _id: 'r1', name: 'Admin', level: 100 }) },
      EmployeeDevice: {
        findOne: () => chained(null),
        create: async ([value]) => {
          const device = { _id: 'd9', version: 0, save: vi.fn(async () => undefined), ...value };
          createdDevices.push(device);
          return [device];
        }
      },
      LoginAttempt: { create: vi.fn(async () => [{}]) },
      AuthSession: { create: async ([value]) => [{ _id: 's9', ...value }] },
      Permission: { find: () => ({ lean: async () => [permission] }) },
      RolePermission: { find: () => ({ lean: async () => [{ roleId: 'r1', permissionId: 'p1' }] }) },
      EmployeePermission: { find: () => ({ lean: async () => [] }) },
      EmployeePageAccess: { find: () => ({ lean: async () => [] }) }
    };
    const attendance = {
      _id: 'a1',
      employeeId: 'e1',
      attendanceDate: '2026-09-11',
      scheduleSnapshot: {},
      checkInAt: new Date(),
      lateMinutes: 0,
      status: 'OPEN',
      version: 0
    };
    const result = await login(
      { name: 'admin', password: 'plain', fingerprint: 'brand-new-fp', device: {} },
      {
        ...baseContext,
        models,
        attendanceService: { checkIn: async () => ({ attendance, alreadyOpen: false }) }
      }
    );
    expect(result.httpStatus).toBe(200);
    expect(createdDevices[0].status).toBe('APPROVED');
    expect(result.auth.accessToken).toContain('.');
  });

  it('issues access and refresh tokens after the device is approved', async () => {
    const employee = {
      _id: 'e1',
      name: 'Admin',
      position: 'Manager',
      roleId: 'r1',
      passwordPlainText: 'plain',
      status: 'ACTIVE',
      permissionsVersion: 1,
      workStart: '09:00',
      workEnd: '17:00',
      crossesMidnight: false,
      timezone: 'Africa/Cairo',
      graceMinutes: 0,
      save: vi.fn(async () => undefined)
    };
    const device = {
      _id: 'd1',
      employeeId: 'e1',
      status: 'APPROVED',
      attemptCount: 1,
      save: vi.fn(async () => undefined)
    };
    const permission = { _id: 'p1', key: 'orders.read', pageKey: 'orders', action: 'read' };
    const models = {
      Employee: { findOne: () => chained(employee) },
      EmployeeDevice: { findOne: () => chained(device) },
      LoginAttempt: { create: vi.fn(async () => [{}]) },
      AuthSession: { create: async ([value]) => [{ _id: 's1', ...value }] },
      Role: { findById: () => chained({ _id: 'r1', name: 'Admin', level: 100 }) },
      Permission: { find: () => ({ lean: async () => [permission] }) },
      RolePermission: {
        find: () => ({ lean: async () => [{ roleId: 'r1', permissionId: 'p1' }] })
      },
      EmployeePermission: { find: () => ({ lean: async () => [] }) },
      EmployeePageAccess: { find: () => ({ lean: async () => [] }) }
    };
    const attendance = {
      _id: 'a1',
      employeeId: 'e1',
      attendanceDate: '2026-09-11',
      scheduleSnapshot: {},
      checkInAt: new Date(),
      lateMinutes: 0,
      status: 'OPEN',
      version: 0
    };
    const result = await login(
      { name: 'Admin', password: 'plain', fingerprint: 'fingerprint-001', device: {} },
      {
        ...baseContext,
        models,
        attendanceService: { checkIn: async () => ({ attendance, alreadyOpen: false }) }
      }
    );
    expect(result.httpStatus).toBe(200);
    expect(result.auth.accessToken).toContain('.');
    expect(result.auth.refreshToken.length).toBeGreaterThan(32);
    expect(result.permissions).toEqual([{ pageKey: 'orders', visible: true, actions: ['read'] }]);
    expect(result.currentAttendance.id).toBe('a1');
  });

  it('persists an inactive-login attempt and denies access', async () => {
    const attempts = [];
    const models = {
      Employee: {
        findOne: () => chained({ _id: 'e1', passwordPlainText: 'plain', status: 'INACTIVE' })
      },
      LoginAttempt: {
        create: async ([value]) => {
          attempts.push(value);
          return [value];
        }
      }
    };
    await expect(
      login(
        { name: 'Admin', password: 'plain', fingerprint: 'fingerprint-001', device: {} },
        { ...baseContext, models }
      )
    ).rejects.toMatchObject({ code: 'EMPLOYEE_INACTIVE' });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe('EMPLOYEE_INACTIVE');
  });
});

describe('device, refresh, and permission invalidation', () => {
  it('blocking a device revokes every live refresh session', async () => {
    const device = {
      _id: 'd1',
      version: 0,
      status: 'APPROVED',
      save: vi.fn(async () => undefined)
    };
    const models = {
      EmployeeDevice: { findOne: () => chained(device) },
      AuthSession: { updateMany: vi.fn(async () => ({ modifiedCount: 3 })) }
    };
    const auditModel = { create: async ([value]) => [value] };
    const outboxModel = { create: async ([value]) => [value] };
    const sequenceModel = { findOneAndUpdate: async () => ({ value: 1 }) };
    const result = await decideDevice(
      'd1',
      'BLOCKED',
      { reason: 'lost device', expectedVersion: 0 },
      { ...baseContext, models, auditModel, outboxModel, sequenceModel }
    );
    expect(result.revokedSessionsCount).toBe(3);
    expect(device.status).toBe('BLOCKED');
  });

  it('rejects refresh after employee deactivation', async () => {
    const session = {
      _id: 's1',
      employeeId: 'e1',
      deviceId: 'd1',
      permissionsVersion: 1,
      save: vi.fn(async () => undefined)
    };
    const models = {
      AuthSession: { findOne: () => chained(session) },
      Employee: {
        findById: () => chained({ _id: 'e1', status: 'INACTIVE', permissionsVersion: 1 })
      },
      EmployeeDevice: { findById: () => chained({ _id: 'd1', status: 'APPROVED' }) }
    };
    await expect(refreshSession('x'.repeat(48), { ...baseContext, models })).rejects.toMatchObject({
      code: 'SESSION_STALE'
    });
    expect(session.revokeReason).toBe('AUTH_STATE_CHANGED');
  });

  it('rejects an access token after permissionsVersion changes', async () => {
    const token = signAccessToken(
      { sub: 'e1', sid: 's1', did: 'd1', pv: 1 },
      config.auth.accessSecret,
      900
    );
    const models = {
      Employee: {
        findById: () => ({
          lean: async () => ({ _id: 'e1', roleId: 'r1', status: 'ACTIVE', permissionsVersion: 2 })
        })
      },
      EmployeeDevice: {
        findById: () => ({ lean: async () => ({ _id: 'd1', status: 'APPROVED' }) })
      },
      AuthSession: {
        findById: () => ({
          lean: async () => ({
            _id: 's1',
            permissionsVersion: 1,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000)
          })
        })
      }
    };
    const middleware = employeeAuth(config, { models });
    const req = {
      get: (name) => (name === 'authorization' ? `Bearer ${token}` : 'test'),
      requestId: 'r1',
      ip: '127.0.0.1'
    };
    const next = vi.fn();
    await middleware(req, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'SESSION_STALE', status: 401 });
  });

  it('uses only token hashes for refresh lookup', () => {
    expect(hashToken('plain-refresh')).not.toContain('plain-refresh');
  });
});

describe('hard delete employee', () => {
  const deleteContext = (employee, actorId = 'admin-1', lastSequence = null) => ({
    ...baseContext,
    actorId,
    models: {
      Employee: {
        findOne: () => chained(employee),
        deleteOne: vi.fn(async () => ({ deletedCount: 1 }))
      },
      OutboxEvent: {
        findOne: () => ({
          sort: () => ({ select: () => ({ session: async () => lastSequence === null ? null : { sequence: lastSequence } }) })
        })
      }
    },
    auditModel: { create: async ([value]) => [value] },
    outboxModel: { create: async ([value]) => [value] },
    sequenceModel: { findOneAndUpdate: async () => ({ value: 1 }) }
  });

  it('deletes only the employee document', async () => {
    const context = deleteContext({ _id: 'e1', name: 'أحمد', position: 'كاشير', status: 'ACTIVE', version: 2 });
    const result = await deleteEmployee('e1', { expectedVersion: 2 }, context);
    expect(result).toMatchObject({ deleted: true, employeeId: 'e1' });
    expect(context.models.Employee.deleteOne).toHaveBeenCalledWith({ _id: 'e1' }, expect.anything());
  });

  it('forbids deleting your own account', async () => {
    const context = deleteContext({ _id: 'e1', name: 'أحمد', position: 'كاشير', status: 'ACTIVE', version: 0 }, 'e1');
    await expect(deleteEmployee('e1', { expectedVersion: 0 }, context)).rejects.toMatchObject({
      code: 'SELF_DELETE_FORBIDDEN',
      status: 403
    });
    expect(context.models.Employee.deleteOne).not.toHaveBeenCalled();
  });

  it('conflicts when the employee is missing or modified', async () => {
    const context = deleteContext(null);
    await expect(deleteEmployee('e1', { expectedVersion: 0 }, context)).rejects.toMatchObject({
      code: 'EMPLOYEE_VERSION_CONFLICT',
      status: 409
    });
  });

  it('continues the outbox sequence after previous aggregate events', async () => {
    const seen = [];
    const context = {
      ...deleteContext({ _id: 'e1', name: 'أحمد', position: 'كاشير', status: 'ACTIVE', version: 0 }, 'admin-1', 7),
      outboxModel: {
        create: async ([value]) => {
          seen.push(value);
          return [value];
        }
      }
    };
    const result = await deleteEmployee('e1', { expectedVersion: 0 }, context);
    expect(result).toMatchObject({ deleted: true });
    expect(seen[0].sequence).toBe(8);
  });
});
