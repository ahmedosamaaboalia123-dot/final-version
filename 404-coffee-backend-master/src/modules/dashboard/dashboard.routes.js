const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const { getDashboard } = require("./dashboard.controller");

const router = express.Router();

const PAGE = "dashboard";

router.get(
  "/",
  authMiddleware,
  requirePermission(PAGE),
  getDashboard
);

module.exports = router;