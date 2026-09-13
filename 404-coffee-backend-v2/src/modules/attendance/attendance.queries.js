import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { AttendanceAdjustment, AttendanceRecord } from './attendance.models.js';
import { toAdjustmentDto, toAttendanceDto } from './attendance.mapper.js';

export async function listAttendance(filters = {}, context = {}) {
  const models = context.models ?? { AttendanceRecord };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.employeeId) query.employeeId = filters.employeeId;
  if (filters.status) query.status = filters.status;
  if (filters.from || filters.to)
    query.attendanceDate = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {})
    };
  const summaryQuery = { ...query };
  delete summaryQuery.status;
  const [records, totalItems, openCount, closedCount] = await Promise.all([
    models.AttendanceRecord.find(query)
      .sort({ attendanceDate: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.AttendanceRecord.countDocuments(query),
    models.AttendanceRecord.countDocuments({ ...summaryQuery, status: 'OPEN' }),
    models.AttendanceRecord.countDocuments({ ...summaryQuery, status: 'CLOSED' })
  ]);
  return {
    items: records.map(toAttendanceDto),
    summary: { total: totalItems, open: openCount, closed: closedCount },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { attendanceDate: -1 } })
  };
}

export async function getAttendanceDetails(attendanceId, context = {}) {
  const models = context.models ?? { AttendanceRecord, AttendanceAdjustment };
  const [record, adjustments] = await Promise.all([
    models.AttendanceRecord.findById(attendanceId).lean(),
    models.AttendanceAdjustment.find({ attendanceId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(10)
      .lean()
  ]);
  if (!record)
    throw new ApiError({
      code: 'ATTENDANCE_NOT_FOUND',
      status: 404,
      messageAr: 'سجل الحضور غير موجود'
    });
  return {
    attendance: toAttendanceDto(record),
    adjustments: {
      items: adjustments.map(toAdjustmentDto),
      pageMeta: buildPageMeta({
        page: 1,
        limit: 10,
        totalItems: adjustments.length,
        sort: { createdAt: -1 }
      })
    }
  };
}
