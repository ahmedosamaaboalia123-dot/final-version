const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getSalesReport,
  getProfitReport,
  getTreasuryReport,
  getOverviewReport,
  getInventoryReport,
  getDailyReport,
  getMonthlyReport,
  getShiftReports,
  getProductReports,
  getInventoryLossReport,
  exportReport,
} = require("./financial-report.controller");

const router = express.Router();

const PAGE = "financial_reports";

// Sales report
router.get(
  "/sales",
  authMiddleware,
  requirePermission(PAGE, "view_sales_report"),
  getSalesReport
);

// Profit report
router.get(
  "/profit",
  authMiddleware,
  requirePermission(PAGE, "view_profit_report"),
  getProfitReport
);

// Treasury report
router.get(
  "/treasury",
  authMiddleware,
  requirePermission(PAGE, "view_treasury_report"),
  getTreasuryReport
);

router.get("/overview", authMiddleware, requirePermission(PAGE, "view_sales_report"), getOverviewReport);
router.get("/inventory", authMiddleware, requirePermission(PAGE, "view_profit_report"), getInventoryReport);
router.get("/daily", authMiddleware, requirePermission(PAGE, "view_sales_report"), getDailyReport);
router.get("/monthly", authMiddleware, requirePermission(PAGE, "view_sales_report"), getMonthlyReport);
router.get("/shifts", authMiddleware, requirePermission(PAGE, "view_shifts_report"), getShiftReports);
router.get("/products", authMiddleware, requirePermission(PAGE, "view_sales_report"), getProductReports);
router.get("/inventory-loss", authMiddleware, requirePermission(PAGE, "view_profit_report"), getInventoryLossReport);
router.get("/export", authMiddleware, requirePermission(PAGE, "view_sales_report"), exportReport);

module.exports = router;