const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

const IN_TYPES = ["SALES", "COLLECTION"];
const OUT_TYPES = ["EXPENSE", "SALARY", "MAINTENANCE", "PURCHASE", "INCENTIVE"];

const buildDateWhere = (field, { from, to }) => {
    if (!from && !to) {
        return {};
    }

    const range = {};

    if (from) {
        range.gte = new Date(from);
    }

    if (to) {
        range.lte = new Date(to);
    }

    return {
        [field]: range,
    };
};

// ============================================================
// Sales report
// ============================================================

const getSalesReport = async (query = {}) => {
    const { skip, take, page, pageSize } = parsePagination(query);
    const dateWhere = buildDateWhere("createdAt", query);

    const [sales, total, summaryAgg] = await Promise.all([
        prisma.sale.findMany({
            where: dateWhere,
            orderBy: { createdAt: "desc" },
            include: {
                customer: {
                    select: { id: true, name: true, phone: true },
                },
                items: true,
            },
            skip,
            take,
        }),
        prisma.sale.count({ where: dateWhere }),
        prisma.sale.aggregate({
            where: dateWhere,
            _sum: { subtotal: true, discount: true, total: true },
        }),
    ]);

    const rounded = (value) => Math.round(value * 100) / 100;

    // Compute byPaymentMethod from all matching sales (not just this page)
    const allSales = await prisma.sale.findMany({
        where: dateWhere,
        select: { paymentMethod: true, total: true },
    });
    const byPaymentMethod = {};
    for (const sale of allSales) {
        byPaymentMethod[sale.paymentMethod] =
            (byPaymentMethod[sale.paymentMethod] || 0) + Number(sale.total);
    }

    return {
        summary: {
            salesCount: total,
            subtotal: rounded(Number(summaryAgg._sum?.subtotal) || 0),
            discount: rounded(Number(summaryAgg._sum?.discount) || 0),
            total: rounded(Number(summaryAgg._sum?.total) || 0),
            byPaymentMethod,
        },
        data: sales,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
        },
    };
};

// ============================================================
// Profit report
// ============================================================

const getProfitReport = async (query = {}) => {
    const dateWhere = buildDateWhere("createdAt", query);

    const [salesAgg, costAgg] = await Promise.all([
        prisma.sale.aggregate({
            where: dateWhere,
            _sum: { total: true },
        }),
        prisma.saleItem.aggregate({
            where: {
                sale: dateWhere.createdAt ? {
                    createdAt: dateWhere.createdAt,
                    status: "COMPLETED",
                } : { status: "COMPLETED" },
            },
            _sum: { totalPrice: true },
        }),
    ]);

    const rounded = (value) => Math.round(value * 100) / 100;

    const revenue = rounded(Number(salesAgg._sum?.total) || 0);
    const estimatedCost = rounded(Number(costAgg._sum?.totalPrice) || 0);
    const profit = rounded(revenue - estimatedCost);
    const profitMargin = revenue > 0 ? rounded((profit / revenue) * 100) : 0;

    return {
        summary: {
            revenue,
            estimatedCost,
            profit,
            profitMargin,
        },
    };
};

// ============================================================
// Treasury report (cash drawer shifts)
// ============================================================

const getTreasuryReport = async (query = {}) => {
    const shifts = await prisma.cashDrawerShift.findMany({
        where: buildDateWhere("openedAt", query),
        orderBy: {
            openedAt: "desc",
        },
        include: {
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
            transactions: true,
        },
    });

    const rounded = (value) => Math.round(value * 100) / 100;

    let openingTotal = 0;
    let totalIn = 0;
    let totalOut = 0;
    let closingTotal = 0;
    let differenceTotal = 0;

    for (const shift of shifts) {
        openingTotal += Number(shift.openingBalance);

        if (shift.closingBalance) {
            closingTotal += Number(shift.closingBalance);
        }

        if (shift.difference) {
            differenceTotal += Number(shift.difference);
        }

        for (const transaction of shift.transactions) {
            if (IN_TYPES.includes(transaction.type)) {
                totalIn += Number(transaction.amount);
            } else if (OUT_TYPES.includes(transaction.type)) {
                totalOut += Number(transaction.amount);
            }
        }
    }

    return {
        summary: {
            shiftsCount: shifts.length,
            openingTotal: rounded(openingTotal),
            totalIn: rounded(totalIn),
            totalOut: rounded(totalOut),
            closingTotal: rounded(closingTotal),
            differenceTotal: rounded(differenceTotal),
        },
        shifts,
    };
};

const getOverviewReport = async (filters = {}) => {
    const where = {};
    if (filters.from || filters.to) { where.createdAt = {}; if (filters.from) where.createdAt.gte = new Date(filters.from); if (filters.to) where.createdAt.lte = new Date(filters.to); }
    const [sales, orders] = await Promise.all([
        prisma.sale.findMany({ where, select: { subtotal: true, discount: true, total: true, paymentMethod: true, createdAt: true } }),
        prisma.order.findMany({ where, select: { id: true, total: true, status: true, orderType: true, paymentMethod: true, createdAt: true } }),
    ]);
    const grossSales = sales.reduce((s, sale) => s + Number(sale.subtotal), 0);
    const discounts = sales.reduce((s, sale) => s + Number(sale.discount), 0);
    const netSales = sales.reduce((s, sale) => s + Number(sale.total), 0);
    const ordersCount = orders.length;
    const byPaymentMethod = {};
    for (const sale of sales) { byPaymentMethod[sale.paymentMethod] = (byPaymentMethod[sale.paymentMethod] || 0) + Number(sale.total); }
    return { totals: { grossSales, discounts, netSales, ordersCount }, byPaymentMethod };
};

const getInventoryReport = async (filters = {}) => {
    const materials = await prisma.rawMaterial.findMany({ include: { batches: true } });
    const rows = materials.map(m => { const totalQty = m.batches.reduce((s, b) => s + Number(b.quantity), 0); const totalValue = m.batches.reduce((s, b) => s + (Number(b.quantity) * Number(b.pricePerUnit)), 0); return { id: m.id, name: m.name, unit: m.unit, totalQuantity: totalQty, totalValue }; });
    const stockValue = rows.reduce((s, r) => s + r.totalValue, 0);
    return { stockValue, materials: rows };
};

const getDailyReport = async (filters = {}) => {
    const date = filters.date ? new Date(filters.date) : new Date();
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const where = { createdAt: { gte: start, lt: end } };
    const [sales, orders] = await Promise.all([prisma.sale.findMany({ where, select: { total: true, createdAt: true } }), prisma.order.findMany({ where, select: { id: true, total: true, status: true, createdAt: true } })]);
    const totalSales = sales.reduce((s, sale) => s + Number(sale.total), 0);
    const ordersCount = orders.length;
    const cancellations = orders.filter(o => o.status === "CANCELLED").length;
    return { date: start.toISOString(), totalSales, ordersCount, cancellations };
};

const getMonthlyReport = async (filters = {}) => {
    const year = Number(filters.year) || new Date().getFullYear();
    const month = Number(filters.month) || (new Date().getMonth() + 1);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const where = { createdAt: { gte: start, lt: end } };
    const [sales, orders] = await Promise.all([prisma.sale.findMany({ where, select: { total: true, createdAt: true } }), prisma.order.findMany({ where, select: { id: true, total: true, status: true, createdAt: true } })]);
    const totalSales = sales.reduce((s, sale) => s + Number(sale.total), 0);
    const ordersCount = orders.length;
    return { year, month, totalSales, ordersCount };
};

const getShiftReports = async (filters = {}) => {
    const { skip, take } = parsePagination(filters);
    const where = {};
    if (filters.userId) where.openedByUserId = Number(filters.userId);
    if (filters.from || filters.to) { where.openedAt = {}; if (filters.from) where.openedAt.gte = new Date(filters.from); if (filters.to) where.openedAt.lte = new Date(filters.to); }
    const [items, total] = await Promise.all([
        prisma.cashDrawerShift.findMany({ where, include: { openedByUser: { select: { id: true, name: true } }, transactions: true }, orderBy: { openedAt: "desc" }, skip, take }),
        prisma.cashDrawerShift.count({ where }),
    ]);
    return { items, total };
};

const getProductReports = async (filters = {}) => {
    const where = {};
    if (filters.from || filters.to) { where.createdAt = {}; if (filters.from) where.createdAt.gte = new Date(filters.from); if (filters.to) where.createdAt.lte = new Date(filters.to); }
    const saleItems = await prisma.saleItem.findMany({ where: { sale: where }, include: { product: { select: { id: true, name: true, category: true } }, sale: { select: { total: true } } } });
    const productMap = {};
    for (const item of saleItems) { const pid = item.productId; if (!productMap[pid]) productMap[pid] = { id: pid, name: item.product.name, category: item.product.category, totalQuantity: 0, totalRevenue: 0 }; productMap[pid].totalQuantity += Number(item.quantity); productMap[pid].totalRevenue += Number(item.totalPrice); }
    const items = Object.values(productMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
    const totalRevenue = items.reduce((s, i) => s + i.totalRevenue, 0);
    return { items, totalRevenue };
};

const getInventoryLossReport = async (filters = {}) => {
    const where = {};
    if (filters.from || filters.to) { where.createdAt = {}; if (filters.from) where.createdAt.gte = new Date(filters.from); if (filters.to) where.createdAt.lte = new Date(filters.to); }
    const withdrawals = await prisma.rawMaterialBatch.findMany({ where: { rawMaterial: { id: filters.materialId ? Number(filters.materialId) : undefined } }, select: { id: true, rawMaterial: { select: { name: true } }, quantity: true, pricePerUnit: true, addedAt: true } });
    return { withdrawals: withdrawals.slice(0, 100), totalCost: 0 };
};

const exportReport = async (filters = {}) => {
    const type = filters.type || "sales";
    const format = filters.format || "csv";
    let data;
    if (type === "sales") data = await getSalesReport(filters);
    else if (type === "profit") data = await getProfitReport(filters);
    else if (type === "treasury") data = await getTreasuryReport(filters);
    else data = await getOverviewReport(filters);
    return { type, format, data, exportedAt: new Date().toISOString() };
};

module.exports = {
    getSalesReport,
    getProfitReport,
    getTreasuryReport,
    getOverviewReport,
    getInventoryReport,
    getDailyReport,
    getMonthlyReport,
    getShiftReports,
    getProductReports,
    getInventoryLossReport,
    exportReport,
};
