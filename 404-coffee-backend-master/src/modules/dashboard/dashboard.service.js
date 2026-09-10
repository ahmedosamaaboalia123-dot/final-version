const prisma = require("../../lib/prisma");
const warningService = require("../warnings/warning.service");

const getDashboard = async (filters = {}) => {
    const { date, shiftId } = filters;

    // Date filtering — use UTC to match how Prisma stores dates
    let dateStart, dateEnd;
    if (date) {
        dateStart = new Date(date);
        dateStart.setUTCHours(0, 0, 0, 0);
        dateEnd = new Date(dateStart);
        dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
    } else {
        dateStart = new Date();
        dateStart.setUTCHours(0, 0, 0, 0);
        dateEnd = new Date(dateStart);
        dateEnd.setUTCDate(dateEnd.getUTCDate() + 1);
    }

    const [
        todaySales,
        allSalesAgg,
        todayOrders,
        allOrdersAgg,
        pendingOrdersCount,
        openShift,
        productCount,
        customerCount,
        supplierCount,
        delegateCount,
        rawMaterials,
        profitAgg,
        allProducts,
    ] = await Promise.all([
        prisma.sale.aggregate({
            where: {
                createdAt: { gte: dateStart, lt: dateEnd },
                status: "COMPLETED",
            },
            _count: true,
            _sum: { total: true },
        }),
        prisma.sale.aggregate({
            where: { status: "COMPLETED" },
            _count: true,
            _sum: { total: true, subtotal: true, discount: true },
        }),
        prisma.order.aggregate({
            where: {
                createdAt: { gte: dateStart, lt: dateEnd },
            },
            _count: true,
            _sum: { total: true },
        }),
        prisma.order.aggregate({
            _count: true,
            _sum: { total: true },
        }),
        prisma.order.count({
            where: { status: "PENDING" },
        }),
        shiftId
            ? prisma.cashDrawerShift.findUnique({
                  where: { id: Number(shiftId) },
                  include: {
                      openedByUser: { select: { id: true, name: true } },
                      transactions: { select: { type: true, amount: true } },
                  },
              })
            : prisma.cashDrawerShift.findFirst({
                  where: { status: "OPEN" },
                  include: {
                      openedByUser: { select: { id: true, name: true } },
                      transactions: { select: { type: true, amount: true } },
                  },
                  orderBy: { openedAt: "desc" },
              }),
        prisma.product.count(),
        prisma.customer.count(),
        prisma.supplier.count(),
        prisma.delegate.count(),
        prisma.rawMaterial.findMany({
            include: { batches: true },
        }),
        prisma.$queryRaw`
            SELECT COALESCE(SUM(si."unitPrice" * si."quantity"), 0)::float AS "totalCost"
            FROM "sale_items" si
            JOIN "sales" s ON s.id = si."saleId"
            WHERE s."status" = 'COMPLETED'
        `,
        prisma.product.findMany({
            select: { id: true, name: true, category: true },
        }),
    ]);

    const toNumber = (value) => Number(value) || 0;

    const todaySalesTotal = toNumber(todaySales._sum?.total);
    const todaySalesCount = todaySales._count || 0;

    const todayOrdersTotal = toNumber(todayOrders._sum?.total);
    const todayOrdersCount = todayOrders._count || 0;

    const grossSales = toNumber(allSalesAgg._sum?.subtotal);
    const totalDiscounts = toNumber(allSalesAgg._sum?.discount);
    const totalSalesRevenue = toNumber(allSalesAgg._sum?.total);
    const totalCost = profitAgg[0] ? toNumber(profitAgg[0].totalCost) : 0;
    const profit = totalSalesRevenue - totalCost;

    const stock = rawMaterials
        .map((material) => {
            const currentStock = material.batches.reduce(
                (sum, batch) => sum + toNumber(batch.quantity),
                0
            );

            return {
                id: material.id,
                name: material.name,
                unit: material.unit,
                currentStock,
                minStockAlert: toNumber(material.minStockAlert),
            };
        });

    const lowStock = stock.filter((item) => item.currentStock <= item.minStockAlert);

    // Reuse the warnings module for expiring soon (consistent with GET /api/warnings)
    const { expiring: expiringWarnings } = await warningService.getWarnings();
    const expiringSoon = expiringWarnings.map((w) => ({
        id: w.rawMaterialId,
        name: w.name,
        batchId: w.batchId,
        quantity: w.quantity,
        unit: w.unit,
        expiryDate: w.expiryDate,
        daysLeft: w.daysLeft,
        severity: w.severity,
    }));

    let shiftSummary = null;

    if (openShift) {
        const cashIn = openShift.transactions
            .filter((t) => ["SALES", "COLLECTION"].includes(t.type))
            .reduce((sum, t) => sum + toNumber(t.amount), 0);

        const cashOut = openShift.transactions
            .filter((t) =>
                [
                    "EXPENSE",
                    "SALARY",
                    "MAINTENANCE",
                    "PURCHASE",
                    "INCENTIVE",
                ].includes(t.type)
            )
            .reduce((sum, t) => sum + toNumber(t.amount), 0);

        shiftSummary = {
            id: openShift.id,
            status: openShift.status,
            openedAt: openShift.openedAt,
            openingBalance: toNumber(openShift.openingBalance),
            cashIn,
            cashOut,
            expectedBalance:
                toNumber(openShift.openingBalance) + cashIn - cashOut,
            openedBy: openShift.openedByUser,
        };
    }

    return {
        summary: {
            todaySales: {
                count: todaySalesCount,
                total: todaySalesTotal,
            },
            totalSales: {
                count: allSalesAgg._count || 0,
                total: totalSalesRevenue,
            },
            grossSales: Math.round(grossSales * 100) / 100,
            discounts: Math.round(totalDiscounts * 100) / 100,
            profit: Math.round(profit * 100) / 100,
            todayOrders: {
                count: todayOrdersCount,
                total: todayOrdersTotal,
            },
            totalOrders: {
                count: allOrdersAgg._count || 0,
                total: toNumber(allOrdersAgg._sum?.total),
            },
            pendingOrders: pendingOrdersCount,
            activeShift: shiftSummary,
        },
        counts: {
            products: productCount,
            customers: customerCount,
            suppliers: supplierCount,
            delegates: delegateCount,
        },
        products: allProducts,
        inventory: {
            stock,
            lowStock,
            expiringSoon,
            lowStockCount: lowStock.length,
            expiringSoonCount: expiringSoon.length,
        },
        drawer: shiftSummary,
    };
};

module.exports = {
    getDashboard,
};