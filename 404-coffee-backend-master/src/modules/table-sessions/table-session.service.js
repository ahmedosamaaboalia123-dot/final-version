const prisma = require("../../lib/prisma");

// ============================================================
// Create service request
// ============================================================

const createServiceRequest = async ({ tableNumber, type = "WAITER", reason }) => {
    const tn = Number(tableNumber);
    if (!Number.isInteger(tn) || tn <= 0) {
        const error = new Error("Invalid table number");
        error.statusCode = 400;
        throw error;
    }

    const validTypes = ["WAITER", "BILL", "HELP"];
    if (!validTypes.includes(type)) {
        const error = new Error("Invalid service request type");
        error.statusCode = 400;
        throw error;
    }

    const request = await prisma.serviceRequest.create({
        data: {
            tableNumber: tn,
            type,
            reason: reason?.trim() || null,
        },
    });

    return request;
};

// ============================================================
// Get all service requests (admin)
// ============================================================

const getServiceRequests = async (filters = {}) => {
    const where = {};

    if (filters.status) {
        where.status = filters.status;
    }

    if (filters.tableNumber) {
        where.tableNumber = Number(filters.tableNumber);
    }

    const items = await prisma.serviceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
    });

    return { items, total: items.length };
};

// ============================================================
// Resolve service request
// ============================================================

const resolveServiceRequest = async (id, userId) => {
    const requestId = Number(id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
        const error = new Error("Invalid service request ID");
        error.statusCode = 400;
        throw error;
    }

    const existing = await prisma.serviceRequest.findUnique({
        where: { id: requestId },
    });

    if (!existing) {
        const error = new Error("Service request not found");
        error.statusCode = 404;
        throw error;
    }

    if (existing.status !== "PENDING") {
        const error = new Error("Service request already resolved");
        error.statusCode = 400;
        throw error;
    }

    const updated = await prisma.serviceRequest.update({
        where: { id: requestId },
        data: {
            status: "RESOLVED",
            resolvedByUserId: userId || null,
            resolvedAt: new Date(),
        },
    });

    return updated;
};

module.exports = {
    createServiceRequest,
    getServiceRequests,
    resolveServiceRequest,
};
