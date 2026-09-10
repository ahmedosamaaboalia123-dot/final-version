const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerOrders,
  lookupCustomer,
  mergeCustomers,
} = require("./customer.controller");

const { validateCustomer } = require("./customer.validation");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  getCustomers
);

router.get(
  "/lookup",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  lookupCustomer
);

router.get(
  "/:id/orders",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  getCustomerOrders
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  getCustomerById
);

router.post(
  "/",
  authMiddleware,
  requirePermission("customers", "create_customer"),
  validateCustomer,
  createCustomer
);

router.put(
  "/:id",
  authMiddleware,
  requirePermission("customers", "edit_customer"),
  updateCustomer
);

router.delete(
  "/:id",
  authMiddleware,
  requirePermission("customers", "delete_customer"),
  deleteCustomer
);

router.post(
  "/:id/merge",
  authMiddleware,
  requirePermission("customers", "edit_customer"),
  mergeCustomers
);

module.exports = router;