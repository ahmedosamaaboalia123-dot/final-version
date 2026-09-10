// ============================================================
// Orders Module — Comprehensive Validation Middleware
// Covers all spec endpoints with structured error codes
// Replaces the hand-rolled validateOrder when ready
// ============================================================

const {
    ORDER_CHANNELS,
    FULFILLMENT_TYPES,
    ORDER_STATUSES,
    ORDER_ITEM_STATUSES,
    PAYMENT_METHODS,
    PAYMENT_STATUSES,
    ORDER_TYPES,
    SERVICE_REQUEST_TYPES,
    ERROR_CODES,
} = require("./order.constants");

// ============================================================
// Helpers
// ============================================================

const sendError = (res, statusCode, code, message) => {
    return res.status(statusCode).json({ success: false, message, code });
};

const isValidInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

const isValidPhone = (v) => typeof v === "string" && /^0[0-9]{9,10}$/.test(v.trim());

const isValidString = (v, opts = {}) => {
    if (typeof v !== "string") return false;
    const trimmed = v.trim();
    if (opts.minLength && trimmed.length < opts.minLength) return false;
    if (opts.maxLength && trimmed.length > opts.maxLength) return false;
    return trimmed.length > 0;
};

// ============================================================
// Item validation (shared across create/update)
// ============================================================

const validateItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        return "Items must be a non-empty array";
    }
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.productId || !isValidInt(item.productId)) {
            return `Item ${i + 1}: productId is required and must be a positive integer`;
        }
        if (!item.productSizeId || !isValidInt(item.productSizeId)) {
            return `Item ${i + 1}: productSizeId is required and must be a positive integer`;
        }
        if (item.quantity === undefined || item.quantity === null) {
            return `Item ${i + 1}: quantity is required`;
        }
        if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
            return `Item ${i + 1}: quantity must be a positive number`;
        }
        if (item.typeName !== undefined && item.typeName !== null && typeof item.typeName !== "string") {
            return `Item ${i + 1}: typeName must be a string`;
        }
        if (item.notes !== undefined && item.notes !== null && typeof item.notes !== "string") {
            return `Item ${i + 1}: notes must be a string`;
        }
        if (item.addonIds !== undefined) {
            if (!Array.isArray(item.addonIds)) {
                return `Item ${i + 1}: addonIds must be an array`;
            }
            for (const id of item.addonIds) {
                if (!isValidInt(id)) {
                    return `Item ${i + 1}: addonIds must contain positive integers`;
                }
            }
        }
    }
    return null; // valid
};

// ============================================================
// Create public order (POST /api/orders/public)
// ============================================================

const validateCreatePublicOrder = (req, res, next) => {
    const { channel, fulfillmentType, customer, items, deliveryAddress } = req.body;

    if (!channel || !Object.values(ORDER_CHANNELS).includes(channel)) {
        return sendError(res, 400, ERROR_CODES.INVALID_CHANNEL, "Invalid or missing channel");
    }

    if (!fulfillmentType || !Object.values(FULFILLMENT_TYPES).includes(fulfillmentType)) {
        return sendError(res, 400, ERROR_CODES.INVALID_FULFILLMENT_TYPE, "Invalid or missing fulfillmentType");
    }

    // Customer validation
    if (!customer || typeof customer !== "object") {
        return sendError(res, 400, "VALIDATION_ERROR", "customer object is required");
    }
    if (!customer.name || !isValidString(customer.name)) {
        return sendError(res, 400, "VALIDATION_ERROR", "customer.name is required");
    }
    if (!customer.phone || !isValidPhone(customer.phone)) {
        return sendError(res, 400, ERROR_CODES.INVALID_PHONE, "customer.phone is required and must be valid (0XXXXXXXXX)");
    }

    // Delivery address for DELIVERY
    if (fulfillmentType === "DELIVERY") {
        if (!deliveryAddress || typeof deliveryAddress !== "object") {
            return sendError(res, 400, ERROR_CODES.DELIVERY_ADDRESS_REQUIRED, "deliveryAddress is required for DELIVERY orders");
        }
    }

    // Items
    const itemError = validateItems(items);
    if (itemError) {
        return sendError(res, 400, ERROR_CODES.EMPTY_ORDER, itemError);
    }

    next();
};

// ============================================================
// Create admin order (POST /api/orders)
// ============================================================

const validateCreateAdminOrder = (req, res, next) => {
    const { channel, fulfillmentType, table, items, customerName, phone, customerId } = req.body;

    if (channel !== undefined && !Object.values(ORDER_CHANNELS).includes(channel)) {
        return sendError(res, 400, ERROR_CODES.INVALID_CHANNEL, "Invalid channel");
    }

    if (fulfillmentType !== undefined && !Object.values(FULFILLMENT_TYPES).includes(fulfillmentType)) {
        return sendError(res, 400, ERROR_CODES.INVALID_FULFILLMENT_TYPE, "Invalid fulfillmentType");
    }

    // table for DINE_IN
    if (fulfillmentType === "DINE_IN" && (!table && table !== 0)) {
        return sendError(res, 400, ERROR_CODES.TABLE_REQUIRED, "Table is required for DINE_IN orders");
    }

    // customerName or customerId for non-DINE_IN
    if (fulfillmentType !== "DINE_IN" && !customerName && !customerId) {
        // Not strictly required — some channels don't need customer
    }

    // phone validation
    if (phone !== undefined && phone !== null && !isValidPhone(phone)) {
        return sendError(res, 400, ERROR_CODES.INVALID_PHONE, "Phone must be valid (0XXXXXXXXX)");
    }

    // Items
    const itemError = validateItems(items);
    if (itemError) {
        return sendError(res, 400, ERROR_CODES.EMPTY_ORDER, itemError);
    }

    // Validate optional fields
    if (customerName !== undefined && customerName !== null && typeof customerName !== "string") {
        return sendError(res, 400, "VALIDATION_ERROR", "customerName must be a string");
    }

    if (customerId !== undefined && customerId !== null && !isValidInt(customerId)) {
        return sendError(res, 400, "VALIDATION_ERROR", "customerId must be a positive integer");
    }

    if (table !== undefined && table !== null && typeof table !== "string" && typeof table !== "number") {
        return sendError(res, 400, "VALIDATION_ERROR", "table must be a string or number");
    }

    next();
};

// ============================================================
// Update order status (PATCH /api/orders/:orderId/status)
// ============================================================

const validateUpdateOrderStatus = (req, res, next) => {
    const { status, reason } = req.body;

    if (!status || !Object.values(ORDER_STATUSES).includes(status)) {
        return sendError(res, 400, ERROR_CODES.INVALID_ORDER_STATUS, `Invalid status. Allowed: ${Object.values(ORDER_STATUSES).join(", ")}`);
    }

    // reason required for cancellation
    if (status === "CANCELLED" && (!reason || !isValidString(reason))) {
        return sendError(res, 400, "VALIDATION_ERROR", "reason is required when cancelling an order");
    }

    next();
};

// ============================================================
// Update item status (PATCH /api/orders/:orderId/items/:itemId/status)
// ============================================================

const validateUpdateItemStatus = (req, res, next) => {
    const { status } = req.body;

    if (!status || !Object.values(ORDER_ITEM_STATUSES).includes(status)) {
        return sendError(res, 400, ERROR_CODES.INVALID_ITEM_STATUS, `Invalid status. Allowed: ${Object.values(ORDER_ITEM_STATUSES).join(", ")}`);
    }

    next();
};

// ============================================================
// Order ID param validation (shared)
// ============================================================

const validateOrderId = (req, res, next) => {
    const { id } = req.params;
    if (!id || !isValidInt(id)) {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid order ID");
    }
    next();
};

// ============================================================
// Table session: create session (POST /api/table-sessions)
// ============================================================

const validateCreateTableSession = (req, res, next) => {
    const { tableNumber, guestsCount } = req.body;

    if (!tableNumber && tableNumber !== 0) {
        return sendError(res, 400, ERROR_CODES.TABLE_REQUIRED, "tableNumber is required");
    }

    if (guestsCount !== undefined && guestsCount !== null) {
        if (!Number.isInteger(Number(guestsCount)) || Number(guestsCount) < 0) {
            return sendError(res, 400, "VALIDATION_ERROR", "guestsCount must be a non-negative integer");
        }
    }

    next();
};

// ============================================================
// Table session: create order (POST /api/table-sessions/:tableNumber/orders)
// ============================================================

const validateCreateTableSessionOrder = (req, res, next) => {
    const { items } = req.body;

    const itemError = validateItems(items);
    if (itemError) {
        return sendError(res, 400, ERROR_CODES.EMPTY_ORDER, itemError);
    }

    next();
};

// ============================================================
// Table session: service request (POST /api/table-sessions/:tableNumber/service-requests)
// ============================================================

const validateCreateServiceRequest = (req, res, next) => {
    const { type, reason } = req.body;

    if (!type || !Object.values(SERVICE_REQUEST_TYPES).includes(type)) {
        return sendError(res, 400, "VALIDATION_ERROR", `Invalid type. Allowed: ${Object.values(SERVICE_REQUEST_TYPES).join(", ")}`);
    }

    if (reason !== undefined && reason !== null && typeof reason !== "string") {
        return sendError(res, 400, "VALIDATION_ERROR", "reason must be a string");
    }

    next();
};

// ============================================================
// Delegate hand-over (PATCH /api/orders/:orderId/hand-over-delegate)
// ============================================================

const validateHandOverDelegate = (req, res, next) => {
    const { delegateId } = req.body;

    if (!delegateId || !isValidInt(delegateId)) {
        return sendError(res, 400, "VALIDATION_ERROR", "delegateId is required and must be a positive integer");
    }

    next();
};

// ============================================================
// Checkout table (POST /api/orders/tables/:tableNumber/checkout)
// ============================================================

const validateCheckoutTable = (req, res, next) => {
    const { paymentMethod, discount, amountPaid } = req.body;

    if (paymentMethod !== undefined && !Object.values(PAYMENT_METHODS).includes(paymentMethod)) {
        return sendError(res, 400, ERROR_CODES.INVALID_PAYMENT_METHOD, `Invalid paymentMethod. Allowed: ${Object.values(PAYMENT_METHODS).join(", ")}`);
    }

    if (discount !== undefined) {
        if (!Number.isFinite(Number(discount)) || Number(discount) < 0) {
            return sendError(res, 400, ERROR_CODES.DISCOUNT_CANNOT_BE_NEGATIVE, "discount must be a non-negative number");
        }
    }

    if (amountPaid !== undefined) {
        if (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0) {
            return sendError(res, 400, "VALIDATION_ERROR", "amountPaid must be a non-negative number");
        }
    }

    next();
};

// ============================================================
// Cancel order (POST /api/orders/:id/cancel)
// ============================================================

const validateCancelOrder = (req, res, next) => {
    const { reason } = req.body;

    if (reason !== undefined && reason !== null && typeof reason !== "string") {
        return sendError(res, 400, "VALIDATION_ERROR", "reason must be a string");
    }

    next();
};

// ============================================================
// Service request update (PATCH /api/table-sessions/service-requests/:requestId)
// ============================================================

const validateUpdateServiceRequest = (req, res, next) => {
    const { status, reason } = req.body;
    const allowed = ["ACKNOWLEDGED", "RESOLVED", "CANCELLED"];

    if (!status || !allowed.includes(status)) {
        return sendError(res, 400, "VALIDATION_ERROR", `Invalid status. Allowed: ${allowed.join(", ")}`);
    }

    if (status === "CANCELLED" && (!reason || !isValidString(reason))) {
        return sendError(res, 400, "VALIDATION_ERROR", "reason is required when cancelling a service request");
    }

    next();
};

// ============================================================
// Query parameter validation helpers
// ============================================================

const validateOrderQuery = (req, res, next) => {
    const { status, orderType, paymentMethod, fulfillmentType, channel, scope } = req.query;

    if (status !== undefined && !Object.values(ORDER_STATUSES).includes(status)) {
        return sendError(res, 400, ERROR_CODES.INVALID_ORDER_STATUS, `Invalid status filter`);
    }

    if (orderType !== undefined && !Object.values(ORDER_TYPES).includes(orderType)) {
        return sendError(res, 400, ERROR_CODES.INVALID_ORDER_TYPE, `Invalid orderType filter`);
    }

    if (paymentMethod !== undefined && !Object.values(PAYMENT_METHODS).includes(paymentMethod)) {
        return sendError(res, 400, ERROR_CODES.INVALID_PAYMENT_METHOD, `Invalid paymentMethod filter`);
    }

    if (fulfillmentType !== undefined && !Object.values(FULFILLMENT_TYPES).includes(fulfillmentType)) {
        return sendError(res, 400, ERROR_CODES.INVALID_FULFILLMENT_TYPE, `Invalid fulfillmentType filter`);
    }

    if (channel !== undefined && !Object.values(ORDER_CHANNELS).includes(channel)) {
        return sendError(res, 400, ERROR_CODES.INVALID_CHANNEL, `Invalid channel filter`);
    }

    if (scope !== undefined && !["active", "history", "all"].includes(scope)) {
        return sendError(res, 400, "VALIDATION_ERROR", "Invalid scope. Allowed: active, history, all");
    }

    next();
};

module.exports = {
    validateCreatePublicOrder,
    validateCreateAdminOrder,
    validateUpdateOrderStatus,
    validateUpdateItemStatus,
    validateOrderId,
    validateCreateTableSession,
    validateCreateTableSessionOrder,
    validateCreateServiceRequest,
    validateHandOverDelegate,
    validateCheckoutTable,
    validateCancelOrder,
    validateUpdateServiceRequest,
    validateOrderQuery,
    validateItems,
};
