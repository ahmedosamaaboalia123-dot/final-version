const prisma = require("../../lib/prisma");

const { createAuditLog } = require("../../utils/audit");

const { parsePagination } = require("../../utils/pagination");

const IN_TYPES = ["SALES", "COLLECTION"];
const OUT_TYPES = ["EXPENSE", "SALARY", "MAINTENANCE", "PURCHASE", "INCENTIVE"];

const shiftInclude = {
    openedByUser: {
        select: {
            id: true,
            name: true,
        },
    },
    closedByUser: {
        select: {
            id: true,
            name: true,
        },
    },
    transactions: {
        orderBy: {
            createdAt: "asc",
        },
        include: {
            recordedByUser: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    },
};

// ============================================================
// Get all shifts
// ============================================================

const getShifts = async (reqQuery = {}) => {
    const { skip, take } = parsePagination(reqQuery);

    const [shifts, total] = await Promise.all([
        prisma.cashDrawerShift.findMany({
            orderBy: {
                createdAt: "desc",
            },
            include: shiftInclude,
            skip,
            take,
        }),
        prisma.cashDrawerShift.count(),
    ]);

    return { items: shifts, total };
};

// ============================================================
// Get shift by ID
// ============================================================

const getShiftById = async (id) => {
    const shiftId = Number(id);

    if (!Number.isInteger(shiftId) || shiftId <= 0) {
        const error = new Error("Invalid shift ID");
        error.statusCode = 400;
        throw error;
    }

    const shift = await prisma.cashDrawerShift.findUnique({
        where: {
            id: shiftId,
        },
        include: shiftInclude,
    });

    if (!shift) {
        const error = new Error("Cash drawer shift not found");
        error.statusCode = 404;
        throw error;
    }

    return shift;
};

// ============================================================
// Get currently open shift
// ============================================================

const getCurrentShift = async () => {
    return prisma.cashDrawerShift.findFirst({
        where: {
            status: "OPEN",
        },
        orderBy: {
            openedAt: "desc",
        },
        include: shiftInclude,
    });
};

// ============================================================
// Open shift
// ============================================================

const openShift = async (data, userId, ipAddress) => {
    const openingBalance = Number(data.openingBalance);

    if (Number.isNaN(openingBalance) || openingBalance < 0) {
        const error = new Error("Valid opening balance is required");
        error.statusCode = 400;
        throw error;
    }

    const shift = await prisma.$transaction(async (tx) => {
        const existingOpenShift = await tx.cashDrawerShift.findFirst({
            where: { status: "OPEN" },
        });

        if (existingOpenShift) {
            const error = new Error("A shift is already open");
            error.statusCode = 400;
            throw error;
        }

        return tx.cashDrawerShift.create({
            data: {
                openedByUserId: userId,
                openingBalance,
                notes: data.notes || null,
            },
            include: shiftInclude,
        });
    });

    await createAuditLog({
        userId,
        page: "cash_drawer_shifts",
        action: "open_shift",
        description: `Opened shift #${shift.id} with opening balance ${openingBalance}`,
        ipAddress,
    });

    return shift;
};

// ============================================================
// Close shift
// ============================================================

const closeShift = async (id, data, userId, ipAddress) => {
    const shiftId = Number(id);

    if (!Number.isInteger(shiftId) || shiftId <= 0) {
        const error = new Error("Invalid shift ID");
        error.statusCode = 400;
        throw error;
    }

    const actualBalance = Number(data.actualBalance);

    if (Number.isNaN(actualBalance) || actualBalance < 0) {
        const error = new Error("Valid actual balance is required");
        error.statusCode = 400;
        throw error;
    }

    const updatedShift = await prisma.$transaction(async (tx) => {
        const shift = await tx.cashDrawerShift.findUnique({
            where: { id: shiftId },
            include: { transactions: true },
        });

        if (!shift) {
            const error = new Error("Cash drawer shift not found");
            error.statusCode = 404;
            throw error;
        }

        if (shift.status !== "OPEN") {
            const error = new Error("Only open shifts can be closed");
            error.statusCode = 400;
            throw error;
        }

        let totalIn = 0;
        let totalOut = 0;

        for (const transaction of shift.transactions) {
            if (IN_TYPES.includes(transaction.type)) {
                totalIn += Number(transaction.amount);
            } else if (OUT_TYPES.includes(transaction.type)) {
                totalOut += Number(transaction.amount);
            }
        }

        const closingBalance =
            Math.round(
                (Number(shift.openingBalance) + totalIn - totalOut) * 100
            ) / 100;

        const difference =
            Math.round((actualBalance - closingBalance) * 100) / 100;

        return tx.cashDrawerShift.update({
            where: { id: shiftId },
            data: {
                status: "CLOSED",
                closedAt: new Date(),
                closedByUserId: userId,
                closingBalance,
                actualBalance,
                difference,
                ...(data.notes !== undefined && { notes: data.notes || null }),
            },
            include: shiftInclude,
        });
    });

    await createAuditLog({
        userId,
        page: "cash_drawer_shifts",
        action: "close_shift",
        description: `Closed shift #${shiftId}`,
        ipAddress,
    });

    return updatedShift;
};

// ============================================================
// Record cash in transaction
// ============================================================

const recordCashIn = async (id, data, userId, ipAddress) => {
    const shiftId = Number(id);

    if (!Number.isInteger(shiftId) || shiftId <= 0) {
        const error = new Error("Invalid shift ID");
        error.statusCode = 400;
        throw error;
    }

    if (!IN_TYPES.includes(data.type)) {
        const error = new Error("Invalid cash-in type");
        error.statusCode = 400;
        throw error;
    }

    const amount = Number(data.amount);

    if (Number.isNaN(amount) || amount <= 0) {
        const error = new Error("Valid amount is required");
        error.statusCode = 400;
        throw error;
    }

    const shift = await prisma.cashDrawerShift.findUnique({
        where: {
            id: shiftId,
        },
    });

    if (!shift) {
        const error = new Error("Cash drawer shift not found");
        error.statusCode = 404;
        throw error;
    }

    if (shift.status !== "OPEN") {
        const error = new Error("Only open shifts accept transactions");
        error.statusCode = 400;
        throw error;
    }

    const transaction = await prisma.cashDrawerTransaction.create({
        data: {
            shiftId,
            type: data.type,
            amount,
            description: data.description || null,
            recordedByUserId: userId,
        },
        include: {
            recordedByUser: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    await createAuditLog({
        userId,
        page: "cash_drawer_shifts",
        action: "record_cash_in",
        description: `Cash in of ${amount} (${data.type}) on shift #${shiftId}`,
        ipAddress,
    });

    return transaction;
};

// ============================================================
// Record cash out transaction
// ============================================================

const recordCashOut = async (id, data, userId, ipAddress) => {
    const shiftId = Number(id);

    if (!Number.isInteger(shiftId) || shiftId <= 0) {
        const error = new Error("Invalid shift ID");
        error.statusCode = 400;
        throw error;
    }

    if (!OUT_TYPES.includes(data.type)) {
        const error = new Error("Invalid cash-out type");
        error.statusCode = 400;
        throw error;
    }

    const amount = Number(data.amount);

    if (Number.isNaN(amount) || amount <= 0) {
        const error = new Error("Valid amount is required");
        error.statusCode = 400;
        throw error;
    }

    const shift = await prisma.cashDrawerShift.findUnique({
        where: {
            id: shiftId,
        },
        include: {
            transactions: true,
        },
    });

    if (!shift) {
        const error = new Error("Cash drawer shift not found");
        error.statusCode = 404;
        throw error;
    }

    if (shift.status !== "OPEN") {
        const error = new Error("Only open shifts accept transactions");
        error.statusCode = 400;
        throw error;
    }

    let totalIn = 0;
    let totalOut = 0;

    for (const transaction of shift.transactions) {
        if (IN_TYPES.includes(transaction.type)) {
            totalIn += Number(transaction.amount);
        } else if (OUT_TYPES.includes(transaction.type)) {
            totalOut += Number(transaction.amount);
        }
    }

    const currentBalance =
        Number(shift.openingBalance) + totalIn - totalOut;

    if (amount > currentBalance) {
        const error = new Error("Insufficient drawer balance");
        error.statusCode = 400;
        throw error;
    }

    const transaction = await prisma.cashDrawerTransaction.create({
        data: {
            shiftId,
            type: data.type,
            amount,
            description: data.description || null,
            recordedByUserId: userId,
        },
        include: {
            recordedByUser: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    await createAuditLog({
        userId,
        page: "cash_drawer_shifts",
        action: "record_cash_out",
        description: `Cash out of ${amount} (${data.type}) on shift #${shiftId}`,
        ipAddress,
    });

    return transaction;
};

const getShiftTransactions = async (shiftId, filters = {}) => {
    const id = Number(shiftId);
    if (!Number.isInteger(id) || id <= 0) { const error = new Error("Invalid shift ID"); error.statusCode = 400; throw error; }
    const shift = await prisma.cashDrawerShift.findUnique({ where: { id } });
    if (!shift) { const error = new Error("Shift not found"); error.statusCode = 404; throw error; }
    const { skip, take } = parsePagination(filters);
    const where = { shiftId: id };
    if (filters.type) where.type = filters.type;
    if (filters.source) where.description = { contains: filters.source, mode: "insensitive" };
    if (filters.from || filters.to) {
        where.createdAt = {};
        if (filters.from) where.createdAt.gte = new Date(filters.from);
        if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    const [items, total] = await Promise.all([
        prisma.cashDrawerTransaction.findMany({ where, include: { recordedByUser: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.cashDrawerTransaction.count({ where }),
    ]);
    const totals = items.reduce(
        (acc, t) => {
            if (IN_TYPES.includes(t.type)) {
                acc.cashIn += Number(t.amount);
            } else if (OUT_TYPES.includes(t.type)) {
                acc.cashOut += Number(t.amount);
            }
            return acc;
        },
        { cashIn: 0, cashOut: 0 }
    );
    totals.net = Math.round((totals.cashIn - totals.cashOut) * 100) / 100;
    return { items, total, totals };
};

const getShiftReconciliation = async (shiftId) => {
    const id = Number(shiftId);
    if (!Number.isInteger(id) || id <= 0) { const error = new Error("Invalid shift ID"); error.statusCode = 400; throw error; }
    const shift = await prisma.cashDrawerShift.findUnique({ where: { id }, include: { transactions: true } });
    if (!shift) { const error = new Error("Shift not found"); error.statusCode = 404; throw error; }

    const salesTransactions = shift.transactions.filter(t => t.type === "SALES");
    const salesTotal = salesTransactions.reduce((s, t) => s + Number(t.amount), 0);
    const manualIn = shift.transactions.filter(t => t.type === "COLLECTION").reduce((s, t) => s + Number(t.amount), 0);
    const manualOut = shift.transactions.filter(t => ["EXPENSE", "SALARY", "MAINTENANCE", "INCENTIVE"].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);

    const shiftStart = shift.openedAt;
    const shiftEnd = shift.closedAt || new Date();

    const cancelledSales = await prisma.sale.findMany({
        where: {
            status: "CANCELLED",
            createdAt: { gte: shiftStart, lte: shiftEnd },
        },
        select: { subtotal: true, discount: true, total: true },
    });
    const refunds = cancelledSales.reduce((s, sale) => s + Number(sale.total), 0);

    const completedSalesInRange = await prisma.sale.findMany({
        where: {
            status: "COMPLETED",
            paymentMethod: "CASH",
            createdAt: { gte: shiftStart, lte: shiftEnd },
        },
        select: { id: true, total: true },
    });
    const saleIds = completedSalesInRange.map(s => s.id);
    const matchedSaleIds = new Set(
        salesTransactions
            .map(t => t.description)
            .filter(Boolean)
            .map(d => {
                const match = d.match(/sale[:# ]*(\d+)/i);
                return match ? Number(match[1]) : null;
            })
            .filter(Boolean)
    );
    const unmatchedOrders = completedSalesInRange.filter(s => !matchedSaleIds.has(s.id)).length;

    const expected = Math.round((Number(shift.openingBalance) + salesTotal + manualIn - manualOut - refunds) * 100) / 100;
    const actual = Number(shift.actualBalance || 0);
    const difference = Math.round((actual - expected) * 100) / 100;

    return { opening: Number(shift.openingBalance), cashSales: salesTotal, manualIn, manualOut, refunds, expected, actual, difference, unmatchedOrders };
};

module.exports = {
    getShifts,
    getShiftById,
    getCurrentShift,
    getShiftTransactions,
    getShiftReconciliation,
    openShift,
    closeShift,
    recordCashIn,
    recordCashOut,
};
