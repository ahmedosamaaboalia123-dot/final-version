import { listAttendance } from './attendance.queries.js';

export function listByEmployee(employeeId, filters = {}, context = {}) {
  return listAttendance(
    { ...filters, employeeId },
    {
      ...context,
      models: context.attendanceModels
    }
  );
}
