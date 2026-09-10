const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getSales,
  getSaleById,
  getSalesSummary,
  createSale,
  updateSale,
  deleteSale,
} = require("./sale.controller");

const { validateSale } = require("./sale.validation");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  requirePermission("sales", "view_sales_history"),
  getSales
);

router.get(
  "/summary",
  authMiddleware,
  requirePermission("sales", "view_sales_history"),
  getSalesSummary
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("sales", "view_sales_history"),
  getSaleById
);

router.post(
  "/",
  authMiddleware,
  requirePermission("sales", "create_invoice"),
  validateSale,
  createSale
);

router.put(
  "/:id",
  authMiddleware,
  requirePermission("sales", "edit_invoice"),
  validateSale,
  updateSale
);

router.delete(
  "/:id",
  authMiddleware,
  requirePermission("sales", "cancel_invoice"),
  deleteSale
);

module.exports = router;