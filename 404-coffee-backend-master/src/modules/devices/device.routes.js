const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const deviceController = require("./device.controller");

// Auth device routes (mounted under /api/auth/devices)
const router = express.Router();
router.post("/register", authMiddleware, deviceController.registerDevice);

// User device management routes (mounted under /api/users/:id/devices)
const userDeviceRouter = express.Router({ mergeParams: true });
userDeviceRouter.get("/", authMiddleware, requirePermission("users", "view_users"), deviceController.getUserDevices);
userDeviceRouter.patch("/:deviceId", authMiddleware, requirePermission("users", "edit_user"), deviceController.approveOrRejectDevice);
userDeviceRouter.delete("/:deviceId", authMiddleware, requirePermission("users", "edit_user"), deviceController.revokeDevice);

// Employee device management routes (mounted under /api/employees/:id/devices)
const employeeDeviceRouter = express.Router({ mergeParams: true });
employeeDeviceRouter.get("/", authMiddleware, requirePermission("users", "view_users"), deviceController.getUserDevices);
employeeDeviceRouter.put("/:deviceId/approve", authMiddleware, requirePermission("users", "edit_user"), deviceController.approveDevice);
employeeDeviceRouter.put("/:deviceId/reject", authMiddleware, requirePermission("users", "edit_user"), deviceController.rejectDevice);
employeeDeviceRouter.put("/:deviceId/block", authMiddleware, requirePermission("users", "edit_user"), deviceController.blockDevice);

module.exports = router;
module.exports.userDeviceRouter = userDeviceRouter;
module.exports.employeeDeviceRouter = employeeDeviceRouter;
