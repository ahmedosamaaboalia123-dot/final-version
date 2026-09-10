const attendanceService = require("./attendance.service");
const { logAudit } = require("../../utils/audit");

// POST /api/attendance/check-in
const checkIn = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { deviceFingerprint } = req.body || {};
        const result = await attendanceService.checkIn(userId, { deviceFingerprint });
        await logAudit(req, "attendance", "check_in", `User #${userId} checked in at ${result.checkedInAt} [${result.status}]`);
        const statusCode = result.idempotent ? 200 : 201;
        res.status(statusCode).json({ success: true, message: result.idempotent ? "Already checked in today" : "Check-in successful", data: result });
    } catch (error) { next(error); }
};

// POST /api/attendance/check-out
const checkOut = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const result = await attendanceService.checkOut(userId);
        await logAudit(req, "attendance", "check_out", `User #${userId} checked out at ${result.checkedOutAt} [${result.workedMinutes} min]`);
        res.status(200).json({ success: true, message: "Check-out successful", data: result });
    } catch (error) { next(error); }
};

// GET /api/users/:id/attendance
const getUserAttendance = async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        if (!Number.isInteger(userId) || userId <= 0) {
            const error = new Error("Invalid user ID"); error.statusCode = 400; throw error;
        }
        const result = await attendanceService.getUserAttendance(userId, req.query);
        res.status(200).json({ success: true, data: result.items, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages }, summary: result.summary });
    } catch (error) { next(error); }
};

module.exports = { checkIn, checkOut, getUserAttendance };
