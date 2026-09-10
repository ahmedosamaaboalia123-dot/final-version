const prisma = require("../../lib/prisma");

const toNumber = (value) => Number(value) || 0;

// ============================================================
// Tool definitions sent to OpenAI (function calling)
// ============================================================

const definitions = [
    {
        type: "function",
        function: {
            name: "get_products",
            description:
                "Get the coffee shop menu: products with their types, sizes, base/final prices and addons. Safe for customers.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_low_stock",
            description:
                "Get raw materials currently low on stock (at or below their minimum alert level). Staff only.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_sales_summary",
            description:
                "Get sales summary: today's count and total, plus all-time count and total of completed sales. Staff only.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_order_status_counts",
            description:
                "Get counts of orders grouped by status (PENDING, PREPARING, READY, COMPLETED, CANCELLED). Staff only.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_dashboard_summary",
            description:
                "Get an overall dashboard summary: sales, orders, pending orders, active cash drawer shift, entity counts and inventory alerts. Staff only.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
];

// ============================================================
// Tool executors (against the database)
// ============================================================

const executors = {
    async get_products() {
        const products = await prisma.product.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                types: true,
                sizes: true,
                addons: true,
            },
        });

        return JSON.stringify(products);
    },

    async get_low_stock() {
        const materials = await prisma.rawMaterial.findMany({
            include: {
                batches: true,
            },
        });

        const lowStock = materials
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
            })
            .filter((item) => item.currentStock <= item.minStockAlert);

        return JSON.stringify(lowStock);
    },

    async get_sales_summary() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const [todaySales, allSalesAgg] = await Promise.all([
            prisma.sale.findMany({
                where: {
                    createdAt: { gte: todayStart, lt: todayEnd },
                    status: "COMPLETED",
                },
                select: { total: true },
            }),
            prisma.sale.aggregate({
                where: { status: "COMPLETED" },
                _count: true,
                _sum: { total: true },
            }),
        ]);

        return JSON.stringify({
            today: {
                count: todaySales.length,
                total: todaySales.reduce(
                    (sum, sale) => sum + toNumber(sale.total),
                    0
                ),
            },
            allTime: {
                count: allSalesAgg._count || 0,
                total: toNumber(allSalesAgg._sum?.total),
            },
        });
    },

    async get_order_status_counts() {
        const grouped = await prisma.order.groupBy({
            by: ["status"],
            _count: true,
        });

        return JSON.stringify(
            grouped.map((item) => ({
                status: item.status,
                count: item._count,
            }))
        );
    },

    async get_dashboard_summary() {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const [todaySales, todayOrders, pendingOrders, openShift] =
            await Promise.all([
                prisma.sale.findMany({
                    where: {
                        createdAt: { gte: todayStart, lt: todayEnd },
                        status: "COMPLETED",
                    },
                    select: { total: true },
                }),
                prisma.order.findMany({
                    where: { createdAt: { gte: todayStart, lt: todayEnd } },
                    select: { total: true },
                }),
                prisma.order.count({ where: { status: "PENDING" } }),
                prisma.cashDrawerShift.findFirst({
                    where: { status: "OPEN" },
                    orderBy: { openedAt: "desc" },
                }),
            ]);

        return JSON.stringify({
            todaySalesTotal: todaySales.reduce(
                (sum, sale) => sum + toNumber(sale.total),
                0
            ),
            todaySalesCount: todaySales.length,
            todayOrdersTotal: todayOrders.reduce(
                (sum, order) => sum + toNumber(order.total),
                0
            ),
            todayOrdersCount: todayOrders.length,
            pendingOrders,
            activeShiftOpen: Boolean(openShift),
        });
    },
};

module.exports = {
    definitions,
    executors,
    publicToolNames: ["get_products"],
};