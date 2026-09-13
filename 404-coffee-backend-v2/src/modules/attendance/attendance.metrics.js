import { DateTime } from 'luxon';
import { ApiError } from '../../platform/http/api-error.js';

function parseScheduleDate(attendanceDate, time, timezone) {
  const value = DateTime.fromISO(`${attendanceDate}T${time}`, { zone: timezone });
  if (!value.isValid)
    throw new ApiError({
      code: 'INVALID_ATTENDANCE_TIME',
      status: 422,
      messageAr: 'وقت الحضور غير صحيح'
    });
  return value;
}

export function resolveAttendanceDate(checkInAt, schedule) {
  const local = DateTime.fromJSDate(new Date(checkInAt), { zone: schedule.timezone });
  if (!local.isValid)
    throw new ApiError({
      code: 'INVALID_ATTENDANCE_TIME',
      status: 422,
      messageAr: 'وقت الحضور غير صحيح'
    });
  if (schedule.crossesMidnight) {
    const [endHour, endMinute] = schedule.workEnd.split(':').map(Number);
    const endToday = local.startOf('day').set({ hour: endHour, minute: endMinute });
    if (local <= endToday) return local.minus({ days: 1 }).toISODate();
  }
  return local.toISODate();
}

export function calculateAttendanceMetrics({ schedule, attendanceDate, checkInAt, checkOutAt }) {
  const scheduledStart = parseScheduleDate(attendanceDate, schedule.workStart, schedule.timezone);
  let scheduledEnd = parseScheduleDate(attendanceDate, schedule.workEnd, schedule.timezone);
  if (schedule.crossesMidnight || scheduledEnd <= scheduledStart)
    scheduledEnd = scheduledEnd.plus({ days: 1 });
  const checkIn = DateTime.fromJSDate(new Date(checkInAt), { zone: schedule.timezone });
  const checkOut = checkOutAt
    ? DateTime.fromJSDate(new Date(checkOutAt), { zone: schedule.timezone })
    : null;
  if (!checkIn.isValid || (checkOut && !checkOut.isValid) || (checkOut && checkOut < checkIn))
    throw new ApiError({
      code: 'INVALID_ATTENDANCE_RANGE',
      status: 422,
      messageAr: 'وقت الانصراف يجب أن يكون بعد الحضور'
    });
  const lateMinutes = Math.max(
    0,
    Math.floor(
      checkIn.diff(scheduledStart.plus({ minutes: schedule.graceMinutes }), 'minutes').minutes
    )
  );
  const workedMinutes = checkOut
    ? Math.max(0, Math.floor(checkOut.diff(checkIn, 'minutes').minutes))
    : null;
  return {
    attendanceDate,
    scheduledStartAt: scheduledStart.toUTC().toJSDate(),
    scheduledEndAt: scheduledEnd.toUTC().toJSDate(),
    lateMinutes,
    workedMinutes
  };
}
