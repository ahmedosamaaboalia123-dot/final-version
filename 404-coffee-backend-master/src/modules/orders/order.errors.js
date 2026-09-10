// ============================================================
// Orders Module — Custom Error Class
// Adds `code` and `statusCode` to errors for structured responses
// ============================================================

const { ERROR_CODES } = require("./order.constants");

class OrderError extends Error {
    /**
     * @param {string} code — Error code from ERROR_CODES
     * @param {string} message — Human-readable message
     * @param {number} [statusCode=400] — HTTP status
     */
    constructor(code, message, statusCode = 400) {
        super(message);
        this.name = "OrderError";
        this.code = code;
        this.statusCode = statusCode;
    }

    static notFound(entity = "Order", id) {
        const msg = id ? `${entity} with ID ${id} not found` : `${entity} not found`;
        return new OrderError(ERROR_CODES.ORDER_NOT_FOUND, msg, 404);
    }

    static invalidTransition(from, to) {
        return new OrderError(
            ERROR_CODES.INVALID_STATUS_TRANSITION,
            `Cannot transition from ${from} to ${to}`,
            409
        );
    }

    static invalidItemTransition(from, to) {
        return new OrderError(
            ERROR_CODES.INVALID_ITEM_STATUS,
            `Cannot transition item from ${from} to ${to}`,
            409
        );
    }

    static isCompleted() {
        return new OrderError(
            ERROR_CODES.ORDER_IS_COMPLETED,
            "Order is already completed",
            409
        );
    }

    static isCancelled() {
        return new OrderError(
            ERROR_CODES.ORDER_IS_CANCELLED,
            "Order is already cancelled",
            409
        );
    }

    static emptyOrder() {
        return new OrderError(ERROR_CODES.EMPTY_ORDER, "Order must contain at least one item", 400);
    }

    static insufficientInventory(materialName, needed, available) {
        return new OrderError(
            ERROR_CODES.INSUFFICIENT_INVENTORY,
            `Insufficient inventory for "${materialName}": need ${needed} but only ${available} available`,
            422
        );
    }

    static deliveryAddressRequired() {
        return new OrderError(ERROR_CODES.DELIVERY_ADDRESS_REQUIRED, "Delivery address is required for DELIVERY orders", 400);
    }

    static tableRequired() {
        return new OrderError(ERROR_CODES.TABLE_REQUIRED, "Table number is required for DINE_IN orders", 400);
    }

    static customerNameOrIdRequired() {
        return new OrderError(ERROR_CODES.CUSTOMER_NAME_OR_ID_REQUIRED, "customerName or customerId is required", 400);
    }

    static delegateNotFound(id) {
        return new OrderError(ERROR_CODES.DELEGATE_NOT_FOUND, `Delegate with ID ${id} not found`, 404);
    }

    static delegateNotAvailable() {
        return new OrderError(ERROR_CODES.DELEGATE_NOT_AVAILABLE, "Delegate is not available", 409);
    }

    static orderMustBeReady() {
        return new OrderError(ERROR_CODES.ORDER_MUST_BE_READY, "Order must be READY before this action", 409);
    }

    static orderNotDelivery() {
        return new OrderError(ERROR_CODES.ORDER_NOT_DELIVERY, "Order must be a DELIVERY order", 409);
    }

    static cannotDeleteCompleted() {
        return new OrderError(ERROR_CODES.CANNOT_DELETE_COMPLETED, "Cannot delete a completed order", 409);
    }

    static cannotDeleteActive() {
        return new OrderError(ERROR_CODES.CANNOT_DELETE_ACTIVE, "Cannot delete an active order. Cancel it first.", 409);
    }

    static cannotCancelCompleted() {
        return new OrderError(ERROR_CODES.CANNOT_CANCEL_COMPLETED, "Cannot cancel a completed order", 409);
    }

    static cannotCancelAlreadyCancelled() {
        return new OrderError(ERROR_CODES.CANNOT_CANCEL_ALREADY_CANCELLED, "Order is already cancelled", 409);
    }

    static discountExceedsSubtotal() {
        return new OrderError(ERROR_CODES.DISCOUNT_EXCEEDS_SUBTOTAL, "Discount cannot be greater than subtotal", 400);
    }

    static discountCannotBeNegative() {
        return new OrderError(ERROR_CODES.DISCOUNT_CANNOT_BE_NEGATIVE, "Discount cannot be negative", 400);
    }

    static idempotencyKeyReused(expectedStatus, cachedBody) {
        const err = new OrderError(ERROR_CODES.IDEMPOTENCY_KEY_REUSED, "Idempotency key already processed", 409);
        err.cachedResponse = { statusCode: expectedStatus, body: cachedBody };
        return err;
    }

    static tableHasPendingOrders() {
        return new OrderError(ERROR_CODES.TABLE_HAS_PENDING_ORDERS, "Cannot close table with pending/preparing orders", 409);
    }

    static notFound404(message = "Not found") {
        return new OrderError(ERROR_CODES.ORDER_NOT_FOUND, message, 404);
    }
}

module.exports = OrderError;
