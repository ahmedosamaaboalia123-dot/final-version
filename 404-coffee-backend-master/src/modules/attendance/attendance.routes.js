const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const attendanceController = require("./attendance.controller");

const router = express.Router();

// Check-in (authenticated)
router.post("/check-in", authMiddleware, attendanceController.checkIn);

// Check-out (authenticated)
router.post("/check-out", authMiddleware, attendanceController.checkOut);

module.exports = router;
