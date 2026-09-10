// ============================================================
// Orders Module — Status Transition Guard
// Validates status transitions per the spec state machine
// ============================================================

const { VALID_ORDER_TRANSITIONS, VALID_ITEM_TRANSITIONS } = require("./order.constants");
const OrderError = require("./order.errors");

// Legacy transitions: PENDING -> PREPARING is currently used by the
// existing startPreparation endpoint. The spec requires CONFIRMED first,
// but we keep backward compatibility until Phase 6 refactors the flow.
const LEGACY_ORDER_TRANSITIONS = {
    PENDING: ["CONFIRMED", "PREPARING", "CANCELLED"],
};

/**
 * Validate and enforce order status transition.
 * @param {string} from — Current status
 * @param {string} to — Target status
 * @returns {{ fromStatus: string, toStatus: string }} — If valid
 * @throws {OrderError} if transition is not allowed
 */
const guardOrderTransition = (from, to) => {
    const specAllowed = VALID_ORDER_TRANSITIONS[from] || [];
    const legacyAllowed = LEGACY_ORDER_TRANSITIONS[from] || [];
    const allowed = [...new Set([...specAllowed, ...legacyAllowed])];

    if (!allowed.includes(to)) {
        throw OrderError.invalidTransition(from, to);
    }
    return { fromStatus: from, toStatus: to };
};

/**
 * Validate and enforce order item status transition.
 * @param {string} from — Current item status
 * @param {string} to — Target item status
 * @returns {{ fromStatus: string, toStatus: string }}
 * @throws {OrderError} if transition is not allowed
 */
const guardItemTransition = (from, to) => {
    const allowed = VALID_ITEM_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
        throw OrderError.invalidItemTransition(from, to);
    }
    return { fromStatus: from, toStatus: to };
};

/**
 * Check if order can accept status change at all.
 * @param {string} currentStatus
 * @returns {boolean}
 */
const canTransition = (currentStatus) => {
    const allowed = VALID_ORDER_TRANSITIONS[currentStatus];
    return allowed && allowed.length > 0;
};

/**
 * Get allowed next statuses for an order.
 * @param {string} currentStatus
 * @returns {string[]}
 */
const getAllowedTransitions = (currentStatus) => {
    return VALID_ORDER_TRANSITIONS[currentStatus] || [];
};

module.exports = {
    guardOrderTransition,
    guardItemTransition,
    canTransition,
    getAllowedTransitions,
    VALID_ORDER_TRANSITIONS,
    VALID_ITEM_TRANSITIONS,
};
