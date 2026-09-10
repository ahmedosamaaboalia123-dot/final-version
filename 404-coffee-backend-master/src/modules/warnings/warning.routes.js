const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const { getWarnings } = require("./warning.controller");

const router = express.Router();

const PAGE = "warnings";

router.get(
  "/",
  authMiddleware,
  requirePermission(PAGE, "view_warnings"),
  getWarnings
);

module.exports = router;