const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getShifts,
  getCurrentShift,
  getShiftById,
  getShiftTransactions,
  getShiftReconciliation,
  openShift,
  closeShift,
  recordCashIn,
  recordCashOut,
} = require("./cash-drawer-shift.controller");

const {
  validateShiftOpening,
  validateShiftClosing,
  validateCashIn,
  validateCashOut,
} = require("./cash-drawer-shift.validation");

const router = express.Router();

const PAGE = "cash_drawer_shifts";

// Get all shifts
router.get(
  "/",
  authMiddleware,
  requirePermission(PAGE, "view_shifts_report"),
  getShifts
);

// Get current open shift
router.get(
  "/current",
  authMiddleware,
  requirePermission(PAGE, "view_shifts_report"),
  getCurrentShift
);

// Get shift by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission(PAGE, "view_shifts_report"),
  getShiftById
);

router.get(
  "/:id/transactions",
  authMiddleware,
  requirePermission(PAGE, "view_shifts_report"),
  getShiftTransactions
);

router.get(
  "/:id/reconciliation",
  authMiddleware,
  requirePermission(PAGE, "view_shifts_report"),
  getShiftReconciliation
);

// Open shift
router.post(
  "/",
  authMiddleware,
  requirePermission(PAGE, "open_shift"),
  validateShiftOpening,
  openShift
);

// Close shift
router.post(
  "/:id/close",
  authMiddleware,
  requirePermission(PAGE, "close_shift"),
  validateShiftClosing,
  closeShift
);

// Record cash in
router.post(
  "/:id/cash-in",
  authMiddleware,
  requirePermission(PAGE, "record_cash_in"),
  validateCashIn,
  recordCashIn
);

// Record cash out
router.post(
  "/:id/cash-out",
  authMiddleware,
  requirePermission(PAGE, "record_cash_out"),
  validateCashOut,
  recordCashOut
);

module.exports = router;