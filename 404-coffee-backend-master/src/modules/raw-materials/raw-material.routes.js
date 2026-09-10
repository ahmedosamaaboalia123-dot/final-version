const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getRawMaterials,
  getRawMaterialById,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  addBatch,
  getMaterialBatches,
  getRawMaterialsOptions,
  updateBatch,
  deleteBatch,
  updateBatchesPriority,
  createWithdrawal,
  getWithdrawals,
  getReturnOptions,
} = require("./raw-material.controller");

const router = express.Router();

// Get raw materials options (for dropdowns)
router.get(
  "/options",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getRawMaterialsOptions
);

// Get return options (materials with batches for returns)
router.get(
  "/return-options",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getReturnOptions
);

// Get withdrawal history (must be before /:id)
router.get(
  "/withdrawals",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getWithdrawals
);

// Get all raw materials
router.get(
  "/",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getRawMaterials
);

// Create raw material
router.post(
  "/",
  authMiddleware,
  requirePermission("inventory", "create_material"),
  createRawMaterial
);

// Get raw material by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getRawMaterialById
);

// Get batches for a material
router.get(
  "/:id/batches",
  authMiddleware,
  requirePermission("inventory", "view_inventory"),
  getMaterialBatches
);

// Add batch
router.post(
  "/:id/batches",
  authMiddleware,
  requirePermission("inventory", "add_batch"),
  addBatch
);

// Edit batch
router.put(
  "/:id/batches/:batchId",
  authMiddleware,
  requirePermission("inventory", "edit_material"),
  updateBatch
);

// Delete batch
router.delete(
  "/:id/batches/:batchId",
  authMiddleware,
  requirePermission("inventory", "delete_material"),
  deleteBatch
);

// Update batch withdrawal priorities
router.put(
  "/:id/batches-priority",
  authMiddleware,
  requirePermission("inventory", "edit_material"),
  updateBatchesPriority
);

// Manual withdrawal from batch
router.post(
  "/:id/withdrawals",
  authMiddleware,
  requirePermission("inventory", "add_batch"),
  createWithdrawal
);

// Update raw material
router.put(
  "/:id",
  authMiddleware,
  requirePermission("inventory", "edit_material"),
  updateRawMaterial
);

// Delete raw material
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("inventory", "delete_material"),
  deleteRawMaterial
);

module.exports = router;