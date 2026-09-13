export function toAttendanceDto(record) {
  return {
    id: String(record._id),
    employeeId: String(record.employeeId),
    attendanceDate: record.attendanceDate,
    scheduleSnapshot: record.scheduleSnapshot,
    checkInAt: record.checkInAt,
    checkInDeviceId: record.checkInDeviceId ? String(record.checkInDeviceId) : null,
    checkOutAt: record.checkOutAt ?? null,
    checkedOutBy: record.checkedOutBy ? String(record.checkedOutBy) : null,
    checkOutMethod: record.checkOutMethod ?? null,
    lateMinutes: record.lateMinutes,
    workedMinutes: record.workedMinutes ?? null,
    status: record.status,
    notes: record.notes ?? '',
    version: record.version ?? 0
  };
}
export function toAdjustmentDto(record) {
  return {
    id: String(record._id),
    attendanceId: String(record.attendanceId),
    employeeId: String(record.employeeId),
    kind: record.kind,
    oldValues: record.oldValuesSafe,
    newValues: record.newValuesSafe,
    reason: record.reason,
    createdBy: String(record.createdBy),
    createdAt: record.createdAt
  };
}
