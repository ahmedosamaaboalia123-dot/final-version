const orderService = require("./order.service");

const { logAudit } = require("../../utils/audit");

const { parsePagination } = require("../../utils/pagination");

const {
    emitOrderCreated,
    emitOrderItemUpdated,
    emitOrderUpdated,
} = require("../../websocket/socket.events");

const { checkIdempotency, storeIdempotency } = require("./order.idempotency");

// ============================================================
// Create order
// POST /api/orders
// ============================================================

const createOrder = async (req, res, next) => {
    try {
        // Check idempotency key
        const idempotencyKey = req.headers["idempotency-key"];
        if (idempotencyKey) {
            const cached = await checkIdempotency(idempotencyKey);
            if (cached) {
                return res.status(cached.statusCode).json(cached.body);
            }
        }

        const order = await orderService.createOrder(req.body);

        const responsePayload = {
            success: true,
            message: order._autoPrepared
                ? "Order created and preparation started"
                : "Order created successfully",
            data: order,
        };

        // Store idempotency response
        if (idempotencyKey) {
            const statusCode = 201;
            await storeIdempotency(idempotencyKey, "POST /api/orders", statusCode, responsePayload);
        }

        emitOrderCreated(order);

        await logAudit(req, "orders", "create_order", "Order created successfully");
        return res.status(201).json(responsePayload);
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get all orders
// GET /api/orders
// ============================================================

const getOrders = async (req, res, next) => {
    try {
        const { items, total } = await orderService.getOrders(req.query);

        const { page, pageSize } = parsePagination(req.query);

        return res.status(200).json({
            success: true,
            data: items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get order by ID
// GET /api/orders/:id
// ============================================================

const getOrderById = async (req, res, next) => {
    try {
        const order = await orderService.getOrderById(
            req.params.id
        );

        return res.status(200).json({
            success: true,
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update order
// PUT /api/orders/:id
// ============================================================

const updateOrder = async (req, res, next) => {
    try {
        const order = await orderService.updateOrder(
            req.params.id,
            req.body
        );

        emitOrderUpdated(order);

        await logAudit(req, "orders", "edit_order", "Order updated successfully");
        return res.status(200).json({
            success: true,
            message: "Order updated successfully",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Delete order
// DELETE /api/orders/:id
// ============================================================
// Delete order
// DELETE /api/orders/:id
// ============================================================

const deleteOrder = async (req, res, next) => {
    try {
        const order = await orderService.deleteOrder(req.params.id);

        await logAudit(req, "orders", "delete_order", "Order deleted successfully");
        return res.status(200).json({
            success: true,
            message: "Order deleted successfully",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get order tracking
// GET /api/orders/:id/tracking
// ============================================================

const getOrderTracking = async (req, res, next) => {
    try {
        const tracking = await orderService.getOrderTracking(req.params.id);

        return res.status(200).json({
            success: true,
            data: tracking,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update order item status
// PATCH /api/orders/:id/items/:itemId/status
// ============================================================

const updateOrderItemStatus = async (req, res, next) => {
    try {
        const result = await orderService.updateOrderItemStatus(
            req.params.id,
            req.params.itemId,
            req.body
        );

        emitOrderItemUpdated({
            orderId: Number(req.params.id),
            itemId: Number(req.params.itemId),
            status: result.item.status,
            orderStatus: result.orderStatus,
        });

        await logAudit(req, "orders", "update_item_status", `Order item ${req.params.itemId} status updated`);
        return res.status(200).json({
            success: true,
            message: "Order item status updated",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get prep orders
// GET /api/orders/prep
// ============================================================

const getPrepOrders = async (req, res, next) => {
    try {
        const items = await orderService.getPrepOrders();
        return res.status(200).json({ success: true, data: { items } });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get table summaries
// GET /api/orders/tables/summary
// ============================================================

const getTableSummaries = async (req, res, next) => {
    try {
        const data = await orderService.getTableSummaries();
        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update order status (with inventoryEffect/financialEffect)
// PATCH /api/orders/:id/status
// ============================================================

const updateOrderStatus = async (req, res, next) => {
    try {
        // Check idempotency key
        const idempotencyKey = req.headers["idempotency-key"];
        if (idempotencyKey) {
            const cached = await checkIdempotency(idempotencyKey);
            if (cached) {
                return res.status(cached.statusCode).json(cached.body);
            }
        }

        const result = await orderService.updateOrderStatus(req.params.id, req.body, req.user?.userId);
        emitOrderUpdated(result.order);

        const responsePayload = {
            success: true,
            message: "Order status updated",
            data: result,
        };

        // Store idempotency response
        if (idempotencyKey) {
            await storeIdempotency(idempotencyKey, `PATCH /api/orders/${req.params.id}/status`, 200, responsePayload);
        }

        await logAudit(req, "orders", "edit_order", `Order ${result.order.orderNumber} status changed to ${result.order.status}`);
        return res.status(200).json(responsePayload);
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Hand over order to delegate
// PATCH /api/orders/:id/hand-over-delegate
// ============================================================

const handOverOrderToDelegate = async (req, res, next) => {
    try {
        const order = await orderService.handOverOrderToDelegate(
            req.params.id,
            req.body.delegateId
        );

        emitOrderUpdated(order);

        await logAudit(req, "orders", "edit_order", `Order ${order.orderNumber} handed over to delegate`);
        return res.status(200).json({
            success: true,
            message: "Order handed over to delegate",
            data: order,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Close table
// PATCH /api/orders/tables/:tableNumber/close
// ============================================================

const closeTableOrder = async (req, res, next) => {
    try {
        const result = await orderService.closeTableOrder(
            req.params.tableNumber,
            req.user?.userId
        );

        for (const order of result.orders) {
            emitOrderUpdated(order);
        }

        await logAudit(req, "orders", "edit_order", `Table ${req.params.tableNumber} closed`);
        return res.status(200).json({
            success: true,
            message: "Table closed successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get public order tracking (no auth)
// GET /api/orders/public/:code/tracking
// ============================================================

const getPublicOrderTracking = async (req, res, next) => {
    try {
        const tracking = await orderService.getPublicOrderTracking(
            req.params.code,
            req.query.token
        );
        return res.status(200).json({ success: true, data: tracking });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Cancel order (with restoreInventory)
// POST /api/orders/:id/cancel
// ============================================================

const cancelOrder = async (req, res, next) => {
    try {
        const result = await orderService.cancelOrder(req.params.id, {
            reason: req.body.reason || "Cancelled by admin",
            restoreInventory: req.body.restoreInventory !== false,
        }, req.user?.userId);
        emitOrderUpdated(result.order);
        await logAudit(req, "orders", "edit_order", `Order ${result.order.orderNumber} cancelled`);
        return res.status(200).json({
            success: true,
            message: "Order cancelled",
            data: {
                order: result.order,
                status: "CANCELLED",
                releasedReservations: result.restoredBatches || [],
                restoredBatches: result.restoredBatches || [],
            },
        });
    } catch (error) { next(error); }
};

// ============================================================
// Get order invoice
// GET /api/orders/:id/invoice
// ============================================================

const getOrderInvoice = async (req, res, next) => {
    try {
        const invoice = await orderService.getOrderInvoice(req.params.id);
        return res.status(200).json({ success: true, data: invoice });
    } catch (error) { next(error); }
};

// ============================================================
// Get order events
// GET /api/orders/:id/events
// ============================================================

const getOrderEvents = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await orderService.getOrderEvents(req.params.id, req.query);
        return res.status(200).json({ success: true, data: items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (error) { next(error); }
};

// ============================================================
// Start preparation
// POST /api/orders/:id/preparation/start
// ============================================================

const startPreparation = async (req, res, next) => {
    try {
        const result = await orderService.startPreparation(req.params.id, req.user?.userId);
        emitOrderUpdated(result.order);
        await logAudit(req, "orders", "edit_order", `Order ${result.order.orderNumber} preparation started`);
        return res.status(200).json({ success: true, message: "Preparation started", data: result });
    } catch (error) { next(error); }
};

// ============================================================
// Mark item ready
// POST /api/orders/:id/items/:itemId/ready
// ============================================================

const markItemReady = async (req, res, next) => {
    try {
        const result = await orderService.markItemReady(req.params.id, req.params.itemId);
        emitOrderItemUpdated({ orderId: Number(req.params.id), itemId: Number(req.params.itemId), status: result.item.status, orderStatus: result.orderStatus });
        return res.status(200).json({ success: true, message: "Item marked ready", data: result });
    } catch (error) { next(error); }
};

// ============================================================
// Reopen item
// POST /api/orders/:id/items/:itemId/reopen
// ============================================================

const reopenItem = async (req, res, next) => {
    try {
        const result = await orderService.reopenItem(req.params.id, req.params.itemId, req.body.reason);
        emitOrderItemUpdated({ orderId: Number(req.params.id), itemId: Number(req.params.itemId), status: result.item.status, orderStatus: result.orderStatus });
        return res.status(200).json({ success: true, message: "Item reopened for preparation", data: result });
    } catch (error) { next(error); }
};

// ============================================================
// Get table details
// GET /api/orders/tables/:tableNumber/details
// ============================================================

const getTableDetails = async (req, res, next) => {
    try {
        const data = await orderService.getTableDetails(req.params.tableNumber);
        return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

// ============================================================
// Create table order
// POST /api/orders/tables/:tableNumber/orders
// ============================================================

const createTableOrder = async (req, res, next) => {
    try {
        const order = await orderService.createTableOrder(req.params.tableNumber, req.body);
        emitOrderCreated(order);
        await logAudit(req, "orders", "create_order", `Table order created for table ${req.params.tableNumber}`);
        return res.status(201).json({ success: true, message: "Table order created", data: order });
    } catch (error) { next(error); }
};

// ============================================================
// Add items to table
// POST /api/orders/tables/:tableNumber/items
// ============================================================

const addTableItems = async (req, res, next) => {
    try {
        const order = await orderService.addTableItems(req.params.tableNumber, req.body);
        emitOrderUpdated(order);
        return res.status(200).json({ success: true, message: "Items added to table", data: order });
    } catch (error) { next(error); }
};

// ============================================================
// Table checkout
// POST /api/orders/tables/:tableNumber/checkout
// ============================================================

const checkoutTable = async (req, res, next) => {
    try {
        const result = await orderService.checkoutTable(req.params.tableNumber, req.body, req.user?.userId);
        emitOrderUpdated(result.order);
        await logAudit(req, "orders", "edit_order", `Table ${req.params.tableNumber} checked out`);
        return res.status(200).json({ success: true, message: "Table checked out", data: result });
    } catch (error) { next(error); }
};

// ============================================================
// Get table history
// GET /api/orders/tables/:tableNumber/history
// ============================================================

const getTableHistory = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await orderService.getTableHistory(req.params.tableNumber, req.query);
        return res.status(200).json({ success: true, data: items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (error) { next(error); }
};

// ============================================================
// Get active table order
// GET /api/table-sessions/:tableNumber/active-order
// ============================================================

const getActiveTableOrder = async (req, res, next) => {
    try {
        const order = await orderService.getActiveTableOrder(
            req.params.tableNumber
        );
        return res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Complete delivery
// POST /api/orders/:id/delivery/complete
// ============================================================

const completeDelivery = async (req, res, next) => {
    try {
        const result = await orderService.completeDelivery(req.params.id, req.body, req.user?.userId);
        emitOrderUpdated(result.order);
        await logAudit(req, "orders", "edit_order", `Order ${result.order.orderNumber} delivery completed`);
        return res.status(200).json({
            success: true,
            message: "Delivery completed",
            data: {
                order: result.order,
                deliveredAt: result.deliveredAt,
                sale: result.sale,
                drawerTransaction: result.drawerTransaction,
            },
        });
    } catch (error) { next(error); }
};

// ============================================================
// Lookup order by orderNumber + phone (public, no auth)
// GET /api/orders/public/lookup
// ============================================================

const lookupOrderByNumberAndPhone = async (req, res, next) => {
    try {
        const { orderNumber, phone } = req.query;
        if (!orderNumber || !phone) {
            return res.status(400).json({ success: false, message: "orderNumber and phone are required" });
        }
        const data = await orderService.lookupOrderByNumberAndPhone(orderNumber, phone);
        return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

// ============================================================
// Get orders by phone (public, no auth)
// GET /api/orders/public/by-phone
// ============================================================

const getOrdersByPhone = async (req, res, next) => {
    try {
        const { phone } = req.query;
        if (!phone) {
            return res.status(400).json({ success: false, message: "phone is required" });
        }
        const data = await orderService.getOrdersByPhone(phone);
        return res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

// ============================================================
// Record payment for an order
// POST /api/orders/:id/payments
// ============================================================

const recordPayment = async (req, res, next) => {
    try {
        const result = await orderService.recordPayment(req.params.id, req.body, req.user?.userId);
        emitOrderUpdated(result.order);
        await logAudit(req, "orders", "edit_order", `Payment recorded for order`);
        return res.status(200).json({ success: true, message: "Payment recorded", data: result });
    } catch (error) { next(error); }
};

// ============================================================
// Get unified order (spec section 3 shape)
// GET /api/orders/:id (upgraded response)
// ============================================================

const getUnifiedOrderById = async (req, res, next) => {
    try {
        const order = await orderService.getUnifiedOrder(req.params.id);
        return res.status(200).json({ success: true, data: order });
    } catch (error) { next(error); }
};

module.exports = {
    createOrder,
    getOrders,
    getOrderById,
    updateOrder,
    deleteOrder,
    getOrderTracking,
    updateOrderItemStatus,
    getPrepOrders,
    getTableSummaries,
    updateOrderStatus,
    handOverOrderToDelegate,
    closeTableOrder,
    getPublicOrderTracking,
    getActiveTableOrder,
    cancelOrder,
    getOrderInvoice,
    getOrderEvents,
    startPreparation,
    markItemReady,
    reopenItem,
    getTableDetails,
    createTableOrder,
    addTableItems,
    checkoutTable,
    getTableHistory,
    completeDelivery,
    lookupOrderByNumberAndPhone,
    getOrdersByPhone,
    recordPayment,
    getUnifiedOrderById,
};