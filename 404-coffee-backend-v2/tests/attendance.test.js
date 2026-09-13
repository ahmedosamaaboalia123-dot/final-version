import { describe, expect, it, vi } from 'vitest';
import {
  calculateAttendanceMetrics,
  resolveAttendanceDate
} from '../src/modules/attendance/attendance.metrics.js';
import {
  adminCheckOut,
  checkIn,
  createAttendanceAdjustment
} from '../src/modules/attendance/attendance.service.js';

function chained(value) {
  const query = { session: async () => value };
  return query;
}
const daySchedule = {
  workStart: '09:00',
  workEnd: '17:00',
  crossesMidnight: false,
  timezone: 'Africa/Cairo',
  graceMinutes: 5
};
const nightSchedule = {
  workStart: '22:00',
  workEnd: '06:00',
  crossesMidnight: true,
  timezone: 'Africa/Cairo',
  graceMinutes: 0
};
const baseContext = {
  session: {},
  actorType: 'EMPLOYEE',
  actorId: 'admin-1',
  requestId: 'request-1',
  deviceId: 'device-1'
};

describe('Cairo attendance calculations', () => {
  it('calculates grace and lateness using Cairo local time', () => {
    const checkInAt = new Date('2026-09-11T06:06:30.000Z');
    const attendanceDate = resolveAttendanceDate(checkInAt, daySchedule);
    expect(attendanceDate).toBe('2026-09-11');
    expect(
      calculateAttendanceMetrics({ schedule: daySchedule, attendanceDate, checkInAt }).lateMinutes
    ).toBe(1);
  });

  it('assigns after-midnight work to the previous overnight schedule date', () => {
    const checkInAt = new Date('2026-09-11T23:00:00.000Z');
    const attendanceDate = resolveAttendanceDate(checkInAt, nightSchedule);
    const metrics = calculateAttendanceMetrics({
      schedule: nightSchedule,
      attendanceDate,
      checkInAt,
      checkOutAt: new Date('2026-09-12T05:00:00.000Z')
    });
    expect(attendanceDate).toBe('2026-09-11');
    expect(metrics.workedMinutes).toBe(360);
    expect(metrics.scheduledEndAt.toISOString()).toBe('2026-09-12T03:00:00.000Z');
  });
});

describe('attendance state and audit', () => {
  it('returns the existing open record for a duplicate check-in', async () => {
    const existing = { _id: 'a1', employeeId: 'e1', status: 'OPEN' };
    const models = {
      Employee: { findById: () => chained({ _id: 'e1', status: 'ACTIVE' }) },
      AttendanceRecord: { findOne: () => chained(existing), create: vi.fn() }
    };
    const result = await checkIn('e1', { ...baseContext, models });
    expect(result).toEqual({ attendance: existing, alreadyOpen: true });
    expect(models.AttendanceRecord.create).not.toHaveBeenCalled();
  });

  it('prevents admin checkout while the employee owns an open drawer', async () => {
    const record = { _id: 'a1', employeeId: 'e1', version: 0, status: 'OPEN' };
    const models = { AttendanceRecord: { findOne: () => chained(record) } };
    await expect(
      adminCheckOut(
        'a1',
        { expectedVersion: 0 },
        { ...baseContext, models, drawerPort: { hasOpenShiftForEmployee: async () => true } }
      )
    ).rejects.toMatchObject({ code: 'EMPLOYEE_HAS_OPEN_DRAWER', status: 409 });
  });

  it('closes attendance and calculates worked minutes after the drawer check passes', async () => {
    const record = {
      _id: 'a1',
      employeeId: 'e1',
      version: 0,
      status: 'OPEN',
      attendanceDate: '2026-09-11',
      scheduleSnapshot: daySchedule,
      checkInAt: new Date('2026-09-11T06:00:00Z'),
      save: vi.fn(async () => {
        record.version = 1;
      })
    };
    const models = { AttendanceRecord: { findOne: () => chained(record) } };
    const context = {
      ...baseContext,
      now: '2026-09-11T14:00:00Z',
      models,
      drawerPort: { hasOpenShiftForEmployee: async () => false },
      auditModel: { create: async ([value]) => [value] },
      sequenceModel: { findOneAndUpdate: async () => ({ value: 1 }) },
      outboxModel: { create: async ([value]) => [value] }
    };
    const result = await adminCheckOut(
      'a1',
      { expectedVersion: 0, notes: 'انصراف طبيعي' },
      context
    );
    expect(result.attendance).toMatchObject({
      status: 'CLOSED',
      workedMinutes: 480,
      checkOutMethod: 'ADMIN'
    });
    expect(record.save).toHaveBeenCalledOnce();
  });

  it('creates an immutable historical adjustment with old and new values', async () => {
    const record = {
      _id: 'a1',
      employeeId: 'e1',
      version: 1,
      status: 'CLOSED',
      attendanceDate: '2026-09-11',
      scheduleSnapshot: daySchedule,
      checkInAt: new Date('2026-09-11T06:10:00Z'),
      checkOutAt: new Date('2026-09-11T14:00:00Z'),
      lateMinutes: 5,
      workedMinutes: 470,
      save: vi.fn(async () => undefined)
    };
    let adjustmentStored;
    const models = {
      AttendanceRecord: { findOne: () => chained(record) },
      AttendanceAdjustment: {
        create: async ([value]) => {
          adjustmentStored = { _id: 'adj1', createdAt: new Date(), ...value };
          return [adjustmentStored];
        }
      }
    };
    const context = {
      ...baseContext,
      models,
      auditModel: { create: async ([value]) => [value] },
      sequenceModel: { findOneAndUpdate: async () => ({ value: 1 }) },
      outboxModel: { create: async ([value]) => [value] }
    };
    const result = await createAttendanceAdjustment(
      'a1',
      {
        kind: 'CHECK_IN',
        changes: { checkInAt: '2026-09-11T06:00:00.000Z' },
        reason: 'تصحيح وقت الحضور',
        expectedVersion: 1
      },
      context
    );
    expect(result.attendance.lateMinutes).toBe(0);
    expect(adjustmentStored.oldValuesSafe.checkInAt.toISOString()).toBe('2026-09-11T06:10:00.000Z');
    expect(adjustmentStored.newValuesSafe.checkInAt.toISOString()).toBe('2026-09-11T06:00:00.000Z');
    expect(adjustmentStored.reason).toBe('تصحيح وقت الحضور');
  });
});
