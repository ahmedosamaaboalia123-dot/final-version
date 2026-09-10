const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const { getSettings, getSettingByKey, updateSetting, updateSettingsBulk } = require("./setting.controller");

const router = express.Router();

const PAGE = "settings";

// Get all settings
router.get(
  "/",
  authMiddleware,
  requirePermission(PAGE, "view_settings"),
  getSettings
);

// Get single setting by key
router.get(
  "/:key",
  authMiddleware,
  requirePermission(PAGE, "view_settings"),
  getSettingByKey
);

// Bulk update settings
router.post(
  "/bulk",
  authMiddleware,
  requirePermission(PAGE, "update_settings"),
  updateSettingsBulk
);

// Update single setting by key
router.put(
  "/:key",
  authMiddleware,
  requirePermission(PAGE, "update_settings"),
  updateSetting
);

module.exports = router;