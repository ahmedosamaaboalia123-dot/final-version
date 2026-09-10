const prisma = require("../../lib/prisma");

const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get audit logs
// ============================================================

const getAuditLogs = async (reqQuery = {}) => {
    const { skip, take } = parsePagination(reqQuery);

    const { action, userId, from, to } = reqQuery;

    const where = {};

    if (action) {
        where.action = action;
    }

    if (userId) {
        const parsedUserId = Number(userId);

        if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
            const error = new Error("Invalid user ID");
            error.statusCode = 400;
            throw error;
        }

        where.userId = parsedUserId;
    }

    if (from || to) {
        where.createdAt = {};

        if (from) {
            where.createdAt.gte = new Date(from);
        }

        if (to) {
            where.createdAt.lte = new Date(to);
        }
    }

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        position: true,
                    },
                },
            },
        }),
        prisma.auditLog.count({ where }),
    ]);

    return { items: logs, total };
};

// ============================================================
// Get audit log by ID
// ============================================================

const getAuditLogById = async (id) => {
    const logId = Number(id);

    if (!Number.isInteger(logId) || logId <= 0) {
        const error = new Error("Invalid audit log ID");
        error.statusCode = 400;
        throw error;
    }

    const log = await prisma.auditLog.findUnique({
        where: {
            id: logId,
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    position: true,
                },
            },
        },
    });

    if (!log) {
        const error = new Error("Audit log not found");
        error.statusCode = 404;
        throw error;
    }

    return log;
};

module.exports = {
    getAuditLogs,
    getAuditLogById,
};
