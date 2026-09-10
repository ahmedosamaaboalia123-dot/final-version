// ============================================================
// Orders Module — Idempotency Utility
// Prevents duplicate processing of create/status-change requests
// Uses the `order_idempotency` table from Phase 1 schema
// ============================================================

const prisma = require("../../lib/prisma");
const logger = require("../../lib/logger");

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if an idempotency key has already been processed.
 * Returns cached response if found, null otherwise.
 *
 * @param {string} key — The Idempotency-Key header value
 * @returns {{ statusCode: number, body: object } | null}
 */
const checkIdempotency = async (key) => {
    if (!key) return null;

    try {
        const record = await prisma.orderIdempotency.findUnique({
            where: { key },
        });

        if (!record) return null;

        // If expired, ignore the cached response
        if (record.expiresAt < new Date()) {
            return null;
        }

        return {
            statusCode: record.statusCode,
            body: record.responseBody,
        };
    } catch (error) {
        // If the table doesn't exist yet or query fails, don't block the request
        logger.warn({ err: error, key }, "Idempotency check failed, proceeding without cache");
        return null;
    }
};

/**
 * Store an idempotency key with its response.
 *
 * @param {string} key — The Idempotency-Key header value
 * @param {string} endpoint — Route identifier (e.g. "POST /api/orders")
 * @param {number} statusCode — HTTP status code of the response
 * @param {object} body — The response body to cache
 */
const storeIdempotency = async (key, endpoint, statusCode, body) => {
    if (!key) return;

    try {
        const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);

        await prisma.orderIdempotency.upsert({
            where: { key },
            create: {
                key,
                endpoint,
                statusCode,
                responseBody: body,
                expiresAt,
            },
            update: {
                // If key already exists but is expired, allow overwrite
                endpoint,
                statusCode,
                responseBody: body,
                expiresAt,
            },
        });
    } catch (error) {
        // Don't fail the request if we can't store the idempotency key
        logger.warn({ err: error, key }, "Failed to store idempotency key");
    }
};

/**
 * Clean up expired idempotency records.
 * Should be called periodically (e.g. via a cron job or at startup).
 *
 * @returns {number} Number of deleted records
 */
const cleanupExpiredIdempotency = async () => {
    try {
        const result = await prisma.orderIdempotency.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });
        if (result.count > 0) {
            logger.info({ count: result.count }, "Cleaned up expired idempotency records");
        }
        return result.count;
    } catch (error) {
        logger.warn({ err: error }, "Failed to cleanup idempotency records");
        return 0;
    }
};

module.exports = {
    checkIdempotency,
    storeIdempotency,
    cleanupExpiredIdempotency,
    IDEMPOTENCY_TTL_MS,
};
