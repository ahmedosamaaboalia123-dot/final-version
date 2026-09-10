const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getDelegates,
  getDelegateById,
  createDelegate,
  updateDelegate,
  updateDelegateStatus,
  deleteDelegate,
  getDelegateOptions,
  getDelegateOrders,
  getDelegateCollections,
} = require("./delegate.controller");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  requirePermission("delegates", "view_delegates"),
  getDelegates
);

router.get(
  "/options",
  authMiddleware,
  requirePermission("delegates", "view_delegates"),
  getDelegateOptions
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("delegates", "view_delegates"),
  getDelegateById
);

router.post(
  "/",
  authMiddleware,
  requirePermission("delegates", "create_delegate"),
  createDelegate
);

router.put(
  "/:id",
  authMiddleware,
  requirePermission("delegates", "edit_delegate"),
  updateDelegate
);

router.patch(
  "/:id/status",
  authMiddleware,
  requirePermission("delegates", "change_delegate_status"),
  updateDelegateStatus
);

router.delete(
  "/:id",
  authMiddleware,
  requirePermission("delegates", "delete_delegate"),
  deleteDelegate
);

router.get(
  "/:id/orders",
  authMiddleware,
  requirePermission("delegates", "view_delegates"),
  getDelegateOrders
);

router.get(
  "/:id/collections",
  authMiddleware,
  requirePermission("delegates", "view_delegates"),
  getDelegateCollections
);

module.exports = router;