const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const { getAuditLogs, getAuditLogById } = require("./audit-log.controller");

const router = express.Router();

const PAGE = "audit_log";

// Get all audit logs
router.get(
  "/",
  authMiddleware,
  requirePermission(PAGE, "view_audit_log"),
  getAuditLogs
);

// Get audit log by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission(PAGE, "view_audit_log"),
  getAuditLogById
);

module.exports = router;