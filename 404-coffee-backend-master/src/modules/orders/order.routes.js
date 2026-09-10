const express = require("express");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const orderController = require("./order.controller");
const { validateOrder } = require("./order.validation");
const {
    validateCreatePublicOrder,
    validateCreateAdminOrder,
    validateUpdateOrderStatus,
    validateUpdateItemStatus,
    validateHandOverDelegate,
    validateCheckoutTable,
    validateCancelOrder,
    validateOrderQuery,
} = require("./order.validation.v2");

const router = express.Router();

// ============================================================
// Public order routes (NO auth required)
// ============================================================

// Public order tracking (by tracking token)
router.get(
  "/public/:code/tracking",
  orderController.getPublicOrderTracking
);

// Lookup order by orderNumber + phone
router.get(
  "/public/lookup",
  orderController.lookupOrderByNumberAndPhone
);

// Get orders by phone
router.get(
  "/public/by-phone",
  orderController.getOrdersByPhone
);

// Create public order (customer-facing)
router.post(
  "/public",
  validateCreatePublicOrder,
  orderController.createOrder
);

// ============================================================
// Admin order routes (auth required)
// ============================================================

// Create order
router.post(
  "/",
  authMiddleware,
  requirePermission("orders", "create_order"),
  validateCreateAdminOrder,
  orderController.createOrder
);

// Get all orders
router.get(
  "/",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  validateOrderQuery,
  orderController.getOrders
);

// Prep orders (kitchen screen)
router.get(
  "/prep",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getPrepOrders
);

// Table summaries
router.get(
  "/tables/summary",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getTableSummaries
);

// Close table (must be before /:id routes)
router.patch(
  "/tables/:tableNumber/close",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateCheckoutTable,
  orderController.closeTableOrder
);

// Table details
router.get(
  "/tables/:tableNumber",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getTableDetails
);

// Table orders (create order for table)
router.post(
  "/tables/:tableNumber/orders",
  authMiddleware,
  requirePermission("orders", "create_order"),
  orderController.createTableOrder
);

// Add items to table
router.post(
  "/tables/:tableNumber/items",
  authMiddleware,
  requirePermission("orders", "create_order"),
  orderController.addTableItems
);

// Table checkout
router.post(
  "/tables/:tableNumber/checkout",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateCheckoutTable,
  orderController.checkoutTable
);

// Table history
router.get(
  "/tables/:tableNumber/history",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getTableHistory
);

// ============================================================
// Order-specific routes (must be after /tables/* to avoid conflicts)
// ============================================================

// Get order by ID (unified shape per spec)
router.get(
  "/:id",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getUnifiedOrderById
);

// Update order
router.put(
  "/:id",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateCreateAdminOrder,
  orderController.updateOrder
);

// Delete order
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("orders", "delete_order"),
  orderController.deleteOrder
);

// Order tracking (admin)
router.get(
  "/:id/tracking",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrderTracking
);

// Cancel order
router.post(
  "/:id/cancel",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateCancelOrder,
  orderController.cancelOrder
);

// Record payment for order
router.post(
  "/:id/payments",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.recordPayment
);

// Complete delivery
router.post(
  "/:id/delivery/complete",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.completeDelivery
);

// Order invoice
router.get(
  "/:id/invoice",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrderInvoice
);

// Order events
router.get(
  "/:id/events",
  authMiddleware,
  requirePermission("orders", "view_orders"),
  orderController.getOrderEvents
);

// Preparation start
router.post(
  "/:id/preparation/start",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.startPreparation
);

// Item ready
router.post(
  "/:id/items/:itemId/ready",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.markItemReady
);

// Item reopen
router.post(
  "/:id/items/:itemId/reopen",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  orderController.reopenItem
);

// Update order status (with new transitions)
router.patch(
  "/:id/status",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateUpdateOrderStatus,
  orderController.updateOrderStatus
);

// Update order item status
router.patch(
  "/:id/items/:itemId/status",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateUpdateItemStatus,
  orderController.updateOrderItemStatus
);

// Hand over order to delegate
router.patch(
  "/:id/hand-over-delegate",
  authMiddleware,
  requirePermission("orders", "edit_order"),
  validateHandOverDelegate,
  orderController.handOverOrderToDelegate
);

module.exports = router;
