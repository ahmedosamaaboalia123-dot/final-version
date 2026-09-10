const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierOptions,
  getSupplierTransactions,
  createTransaction,
} = require("./supplier.controller");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  requirePermission("suppliers", "view_suppliers"),
  getSuppliers
);

router.get(
  "/options",
  authMiddleware,
  requirePermission("suppliers", "view_suppliers"),
  getSupplierOptions
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("suppliers", "view_suppliers"),
  getSupplierById
);

router.post(
  "/",
  authMiddleware,
  requirePermission("suppliers", "create_supplier"),
  createSupplier
);

router.put(
  "/:id",
  authMiddleware,
  requirePermission("suppliers", "edit_supplier"),
  updateSupplier
);

router.delete(
  "/:id",
  authMiddleware,
  requirePermission("suppliers", "delete_supplier"),
  deleteSupplier
);

router.get(
  "/:id/transactions",
  authMiddleware,
  requirePermission("suppliers", "view_suppliers"),
  getSupplierTransactions
);

router.post(
  "/:id/transactions",
  authMiddleware,
  requirePermission("suppliers", "create_supplier"),
  createTransaction
);

module.exports = router;