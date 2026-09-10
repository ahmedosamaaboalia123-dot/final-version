const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");
const { formatInTimeZone } = require("date-fns-tz");

const CAIRO_TZ = "Africa/Cairo";

const httpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// ============================================================
// Shared idempotent check-in logic
// Accepts an optional `tx` (Prisma transaction client).
// If no existing record for (userId, attendanceDate), creates one.
// If one already exists, returns it unchanged (idempotent).
// ============================================================
const checkInToday = async (userId, { deviceFingerprint, tx: txClient } = {}) => {
    const db = txClient || prisma;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw httpError("User not found", 404);

    const now = new Date();
    const attendanceDate = formatInTimeZone(now, CAIRO_TZ, "yyyy-MM-dd");
    const scheduledStart = user.workStartTime || null;
    const scheduledEnd = user.workEndTime || null;

    // Find-or-create by (userId, attendanceDate) — unique constraint enforced by DB
    const existing = await db.attendance.findUnique({
        where: { userId_attendanceDate: { userId, attendanceDate } },
    });

    if (existing) {
        // Already checked in today — return existing record (idempotent, no overwrite)
        return { attendance: existing, status: existing.status, lateMinutes: existing.lateMinutes, checkedInAt: existing.checkInAt, idempotent: true };
    }

    // Compute ON_TIME / LATE from Cairo local time
    let status = "ON_TIME";
    let lateMinutes = 0;

    if (scheduledStart) {
        const [sH, sM] = scheduledStart.split(":").map(Number);
        const workStartMinutes = sH * 60 + sM;

        const cairoTime = formatInTimeZone(now, CAIRO_TZ, "HH:mm:ss");
        const [cH, cM] = cairoTime.split(":").map(Number);
        const checkInMinutes = cH * 60 + cM;

        if (checkInMinutes > workStartMinutes) {
            status = "LATE";
            lateMinutes = checkInMinutes - workStartMinutes;
        }
    }

    const attendance = await db.attendance.create({
        data: {
            userId,
            attendanceDate,
            scheduledStart,
            scheduledEnd,
            checkInAt: now,
            status,
            lateMinutes,
            deviceFingerprint: deviceFingerprint || null,
        },
    });

    return { attendance, status, lateMinutes, checkedInAt: now, idempotent: false };
};

// Manual check-in endpoint — delegates to shared logic (idempotent)
const checkIn = async (userId, { deviceFingerprint } = {}) => {
    return checkInToday(userId, { deviceFingerprint });
};

// Check-out — ALWAYS uses server time. `at` parameter is intentionally ignored
// even if sent by client, to prevent timestamp fabrication.
const checkOut = async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw httpError("User not found", 404);

    const checkOutAt = new Date();
    const attendanceDate = formatInTimeZone(checkOutAt, CAIRO_TZ, "yyyy-MM-dd");

    const openAttendance = await prisma.attendance.findUnique({
        where: { userId_attendanceDate: { userId, attendanceDate } },
    });

    if (!openAttendance) throw httpError("No open check-in found for today");
    if (openAttendance.checkOutAt) throw httpError("Already checked out today");

    const workedMs = checkOutAt.getTime() - openAttendance.checkInAt.getTime();
    const workedMinutes = Math.round(workedMs / (1000 * 60));

    const attendance = await prisma.attendance.update({
        where: { id: openAttendance.id },
        data: { checkOutAt },
    });

    return { attendance, workedMinutes, checkedOutAt: checkOutAt };
};

// Get attendance for a user with summary
const getUserAttendance = async (userId, filters = {}) => {
    const { page, pageSize, skip, take } = parsePagination(filters);
    const { from, to, status } = filters;

    const where = { userId: Number(userId) };

    if (from || to) {
        where.checkInAt = {};
        if (from) where.checkInAt.gte = new Date(from);
        if (to) where.checkInAt.lte = new Date(to);
    }

    if (status) where.status = status;

    const [items, total] = await Promise.all([
        prisma.attendance.findMany({
            where,
            orderBy: { checkInAt: "desc" },
            skip,
            take,
        }),
        prisma.attendance.count({ where }),
    ]);

    // Compute summary
    const allRecords = await prisma.attendance.findMany({
        where: { userId: Number(userId) },
        select: { status: true, checkInAt: true, checkOutAt: true, lateMinutes: true },
    });

    const totalDays = allRecords.length;
    const onTimeCount = allRecords.filter((r) => r.status === "ON_TIME").length;
    const lateCount = allRecords.filter((r) => r.status === "LATE").length;
    const totalWorkedMinutes = allRecords.reduce((sum, r) => {
        if (r.checkOutAt) {
            return sum + Math.round((new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / (1000 * 60));
        }
        return sum;
    }, 0);

    return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        summary: {
            totalDays,
            onTimeCount,
            lateCount,
            totalWorkedHours: Math.round(totalWorkedMinutes / 60 * 10) / 10,
        },
    };
};

module.exports = { checkIn, checkInToday, checkOut, getUserAttendance };
