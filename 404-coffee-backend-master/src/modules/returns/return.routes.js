const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const controller = require("./return.controller");
const { validateReturn } = require("./return.validation");

const router = express.Router();

// Get all returns
router.get(
  "/",
  authMiddleware,
  requirePermission("returns", "view_returns"),
  controller.getReturns
);

// Create return
router.post(
  "/",
  authMiddleware,
  requirePermission("returns", "create_return"),
  validateReturn,
  controller.createReturn
);

// Approve return
router.patch(
  "/:id/approve",
  authMiddleware,
  requirePermission("returns", "approve_return"),
  controller.approveReturn
);

// Cancel return
router.patch(
  "/:id/cancel",
  authMiddleware,
  requirePermission("returns", "cancel_return"),
  controller.cancelReturn
);

// Get return by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission("returns", "view_returns"),
  controller.getReturnById
);

// Update return
router.put(
  "/:id",
  authMiddleware,
  requirePermission("returns", "edit_return"),
  validateReturn,
  controller.updateReturn
);

// Delete return
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("returns", "delete_return"),
  controller.deleteReturn
);

module.exports = router;