const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  approvePurchase,
  cancelPurchase,
  deletePurchase,
} = require("./purchase.controller");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  requirePermission("purchases", "view_purchases"),
  getPurchases
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("purchases", "view_purchases"),
  getPurchaseById
);

router.post(
  "/",
  authMiddleware,
  requirePermission("purchases", "create_purchase"),
  createPurchase
);

router.put(
  "/:id",
  authMiddleware,
  requirePermission("purchases", "edit_purchase"),
  updatePurchase
);

router.patch(
  "/:id/approve",
  authMiddleware,
  requirePermission("purchases", "approve_purchase"),
  approvePurchase
);

router.patch(
  "/:id/cancel",
  authMiddleware,
  requirePermission("purchases", "cancel_purchase"),
  cancelPurchase
);

router.delete(
  "/:id",
  authMiddleware,
  requirePermission("purchases", "delete_purchase"),
  deletePurchase
);

module.exports = router;