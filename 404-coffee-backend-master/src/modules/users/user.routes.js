const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  getUserPermissions,
  deleteUser,
  getUserById,
  updateUserPageAccess,
} = require("./user.controller");

const { getUserDevices, approveOrRejectDevice, revokeDevice } = require("../devices/device.controller");
const { getUserAttendance } = require("../attendance/attendance.controller");

const router = express.Router();

// Get all users
router.get(
  "/",
  authMiddleware,
  requirePermission("users", "view_users"),
  getUsers
);

// Get user by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission("users", "view_users"),
  getUserById
);

// Create new user
router.post(
  "/",
  authMiddleware,
  requirePermission("users", "create_user"),
  createUser
);

// Update user
router.put(
  "/:id",
  authMiddleware,
  requirePermission("users", "edit_user"),
  updateUser
);

// Update user status
router.patch(
  "/:id/status",
  authMiddleware,
  requirePermission("users", "change_user_status"),
  updateUserStatus
);

// Get user effective permissions (RBAC)
router.get(
  "/:id/permissions",
  authMiddleware,
  requirePermission("users", "view_users"),
  getUserPermissions
);

// Delete user
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("users", "delete_user"),
  deleteUser
);

// Update user page access
router.put(
  "/:id/page-access",
  authMiddleware,
  requirePermission("users", "edit_user"),
  updateUserPageAccess
);

// Device management
router.get(
  "/:id/devices",
  authMiddleware,
  requirePermission("users", "view_users"),
  getUserDevices
);

router.patch(
  "/:id/devices/:deviceId",
  authMiddleware,
  requirePermission("users", "edit_user"),
  approveOrRejectDevice
);

router.delete(
  "/:id/devices/:deviceId",
  authMiddleware,
  requirePermission("users", "edit_user"),
  revokeDevice
);

// Attendance
router.get(
  "/:id/attendance",
  authMiddleware,
  requirePermission("users", "view_users"),
  getUserAttendance
);

module.exports = router;
