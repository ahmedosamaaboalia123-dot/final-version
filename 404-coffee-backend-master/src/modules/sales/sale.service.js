const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get all sales
// ============================================================

const getSales = async (reqQuery = {}) => {
    const { search, status, paymentMethod } = reqQuery;
    const { skip, take } = parsePagination(reqQuery);

    const where = {};

    // Search by customer name or phone
    // ملاحظة PostgreSQL: الـ contains حساسية ASCII case-insensitive
    if (search && search.trim()) {
        where.customer = {
            OR: [
                {
                    name: {
                        contains: search.trim(),
                    },
                },
                {
                    phone: {
                        contains: search.trim(),
                    },
                },
            ],
        };
    }

    // Filter by sale status
    if (status) {
        where.status = status;
    }

    // Filter by payment method
    if (paymentMethod) {
        where.paymentMethod = paymentMethod;
    }

    const [sales, total] = await Promise.all([
        prisma.sale.findMany({
            where,

            include: {
                customer: true,

                items: {
                    include: {
                        product: true,
                        productSize: true,
                    },
                },
            },

            orderBy: {
                createdAt: "desc",
            },
            skip,
            take,
        }),
        prisma.sale.count({ where }),
    ]);

    return { items: sales, total };
};

// ============================================================
// Get sale by ID
// ============================================================

const getSaleById = async (id) => {
    const saleId = Number(id);

    if (!Number.isInteger(saleId) || saleId <= 0) {
        const error = new Error("Invalid sale ID");
        error.statusCode = 400;
        throw error;
    }

    const sale = await prisma.sale.findUnique({
        where: {
            id: saleId,
        },

        include: {
            customer: true,

            items: {
                include: {
                    product: true,
                    productSize: true,
                },
            },
        },
    });

    if (!sale) {
        const error = new Error("Sale not found");
        error.statusCode = 404;
        throw error;
    }

    return sale;
};

// ============================================================
// Create sale
// ============================================================

const createSale = async ({
    customerId,
    discount = 0,
    paymentMethod = "CASH",
    status = "COMPLETED",
    items,
}) => {
    // --------------------------------------------------------
    // Validate items
    // --------------------------------------------------------

    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("Sale items are required");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate discount
    // --------------------------------------------------------

    const parsedDiscount = Number(discount);

    if (
        !Number.isFinite(parsedDiscount) ||
        parsedDiscount < 0
    ) {
        const error = new Error("Invalid discount");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate payment method
    // --------------------------------------------------------

    const allowedPaymentMethods = [
        "CASH",
        "CARD",
        "WALLET",
    ];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
        const error = new Error("Invalid payment method");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate status
    // --------------------------------------------------------

    const allowedStatuses = [
        "COMPLETED",
        "CANCELLED",
    ];

    if (!allowedStatuses.includes(status)) {
        const error = new Error("Invalid sale status");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate customer
    // --------------------------------------------------------

    let parsedCustomerId = null;

    if (customerId !== undefined && customerId !== null) {
        parsedCustomerId = Number(customerId);

        if (
            !Number.isInteger(parsedCustomerId) ||
            parsedCustomerId <= 0
        ) {
            const error = new Error("Invalid customer ID");
            error.statusCode = 400;
            throw error;
        }

        const customer = await prisma.customer.findUnique({
            where: {
                id: parsedCustomerId,
            },
        });

        if (!customer) {
            const error = new Error("Customer not found");
            error.statusCode = 404;
            throw error;
        }
    }

    return prisma.$transaction(async (tx) => {
        // ----------------------------------------------------
        // Calculate subtotal and prepare sale items
        // ----------------------------------------------------

        let subtotal = 0;

        const saleItems = [];

        for (const item of items) {
            const productId = Number(item.productId);
            const productSizeId = Number(item.productSizeId);
            const quantity = Number(item.quantity);

            if (
                !Number.isInteger(productId) ||
                productId <= 0 ||
                !Number.isInteger(productSizeId) ||
                productSizeId <= 0 ||
                !Number.isFinite(quantity) ||
                quantity <= 0
            ) {
                const error = new Error(
                    "Invalid sale item data"
                );

                error.statusCode = 400;
                throw error;
            }

            // ------------------------------------------------
            // Get product size
            // ------------------------------------------------

            const productSize =
                await tx.productSize.findFirst({
                    where: {
                        id: productSizeId,
                        productId,
                    },

                    include: {
                        ingredients: true,
                    },
                });

            if (!productSize) {
                const error = new Error(
                    "Product size not found"
                );

                error.statusCode = 404;
                throw error;
            }

            // ------------------------------------------------
            // Calculate item total
            // ------------------------------------------------

            const unitPrice = Number(
                productSize.finalPrice
            );

            const itemTotal = unitPrice * quantity;

            subtotal += itemTotal;

            // ------------------------------------------------
            // Deduct raw materials
            // ------------------------------------------------

            for (const ingredient of productSize.ingredients) {
                let requiredQuantity =
                    Number(ingredient.quantity) * quantity;

                const batches =
                    await tx.rawMaterialBatch.findMany({
                        where: {
                            rawMaterialId:
                                ingredient.rawMaterialId,

                            quantity: {
                                gt: 0,
                            },
                        },

                        orderBy: [
                            {
                                expiryDate: {
                                    sort: "asc",
                                    nulls: "last",
                                },
                            },
                            {
                                addedAt: "asc",
                            },
                        ],
                    });

                const availableQuantity =
                    batches.reduce(
                        (total, batch) =>
                            total +
                            Number(batch.quantity),
                        0
                    );

                if (
                    availableQuantity <
                    requiredQuantity
                ) {
                    const error = new Error(
                        `Insufficient stock for raw material ${ingredient.rawMaterialId}`
                    );

                    error.statusCode = 400;
                    throw error;
                }

                for (const batch of batches) {
                    if (requiredQuantity <= 0) {
                        break;
                    }

                    const batchQuantity =
                        Number(batch.quantity);

                    const deducted = Math.min(
                        batchQuantity,
                        requiredQuantity
                    );

                    await tx.rawMaterialBatch.update({
                        where: {
                            id: batch.id,
                        },

                        data: {
                            quantity: {
                                decrement: deducted,
                            },
                        },
                    });

                    requiredQuantity -= deducted;
                }
            }

            saleItems.push({
                productId,
                productSizeId,
                quantity,
                unitPrice,
                totalPrice: itemTotal,
            });
        }

        // ----------------------------------------------------
        // Calculate final total
        // ----------------------------------------------------

        if (parsedDiscount > subtotal) {
            const error = new Error(
                "Discount cannot be greater than subtotal"
            );

            error.statusCode = 400;
            throw error;
        }

        const total = subtotal - parsedDiscount;

        // ----------------------------------------------------
        // Create sale
        // ----------------------------------------------------

        const sale = await tx.sale.create({
            data: {
                customerId: parsedCustomerId,

                subtotal,
                discount: parsedDiscount,
                total,

                paymentMethod,
                status,

                items: {
                    create: saleItems,
                },
            },

            include: {
                customer: true,

                items: {
                    include: {
                        product: true,
                        productSize: true,
                    },
                },
            },
        });

        return sale;
    });
};

// ============================================================
// Update sale
// ============================================================

const updateSale = async (
    id,
    {
        customerId,
        discount = 0,
        paymentMethod = "CASH",
        status = "COMPLETED",
        items,
    }
) => {
    const saleId = Number(id);

    // --------------------------------------------------------
    // Validate sale ID
    // --------------------------------------------------------

    if (!Number.isInteger(saleId) || saleId <= 0) {
        const error = new Error("Invalid sale ID");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate items
    // --------------------------------------------------------

    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("Sale items are required");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate discount
    // --------------------------------------------------------

    const parsedDiscount = Number(discount);

    if (
        !Number.isFinite(parsedDiscount) ||
        parsedDiscount < 0
    ) {
        const error = new Error("Invalid discount");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate payment method
    // --------------------------------------------------------

    const allowedPaymentMethods = [
        "CASH",
        "CARD",
        "WALLET",
    ];

    if (!allowedPaymentMethods.includes(paymentMethod)) {
        const error = new Error("Invalid payment method");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Validate status
    // --------------------------------------------------------

    const allowedStatuses = [
        "COMPLETED",
        "CANCELLED",
    ];

    if (!allowedStatuses.includes(status)) {
        const error = new Error("Invalid sale status");
        error.statusCode = 400;
        throw error;
    }

    // --------------------------------------------------------
    // Parse customer
    // --------------------------------------------------------

    let parsedCustomerId = null;

    if (customerId !== undefined && customerId !== null) {
        parsedCustomerId = Number(customerId);

        if (
            !Number.isInteger(parsedCustomerId) ||
            parsedCustomerId <= 0
        ) {
            const error = new Error("Invalid customer ID");
            error.statusCode = 400;
            throw error;
        }
    }

    return prisma.$transaction(async (tx) => {
        // ----------------------------------------------------
        // 1. Get existing sale
        // ----------------------------------------------------

        const existingSale = await tx.sale.findUnique({
            where: {
                id: saleId,
            },

            include: {
                items: true,
            },
        });

        if (!existingSale) {
            const error = new Error("Sale not found");
            error.statusCode = 404;
            throw error;
        }

        // ----------------------------------------------------
        // 2. Validate customer
        // ----------------------------------------------------

        if (parsedCustomerId !== null) {
            const customer = await tx.customer.findUnique({
                where: {
                    id: parsedCustomerId,
                },
            });

            if (!customer) {
                const error = new Error(
                    "Customer not found"
                );

                error.statusCode = 404;
                throw error;
            }
        }

        // ----------------------------------------------------
        // 3. Return old stock
        // ----------------------------------------------------

        for (const oldItem of existingSale.items) {
            const oldProductSize =
                await tx.productSize.findUnique({
                    where: {
                        id: oldItem.productSizeId,
                    },

                    include: {
                        ingredients: true,
                    },
                });

            if (!oldProductSize) {
                const error = new Error(
                    "Old product size not found"
                );

                error.statusCode = 404;
                throw error;
            }

            const oldQuantity =
                Number(oldItem.quantity);

            for (
                const ingredient
                of oldProductSize.ingredients
            ) {
                const quantityToReturn =
                    Number(ingredient.quantity) *
                    oldQuantity;

                const batch =
                    await tx.rawMaterialBatch.findFirst({
                        where: {
                            rawMaterialId:
                                ingredient.rawMaterialId,
                        },

                        orderBy: [
                            {
                                expiryDate: {
                                    sort: "asc",
                                    nulls: "last",
                                },
                            },
                            {
                                addedAt: "asc",
                            },
                        ],
                    });

                if (batch) {
                    await tx.rawMaterialBatch.update({
                        where: {
                            id: batch.id,
                        },

                        data: {
                            quantity: {
                                increment: quantityToReturn,
                            },
                        },
                    });
                }
            }
        }

        // ----------------------------------------------------
        // 4. Calculate new sale
        // ----------------------------------------------------

        let subtotal = 0;

        const saleItems = [];

        for (const item of items) {
            const productId = Number(item.productId);
            const productSizeId =
                Number(item.productSizeId);
            const quantity = Number(item.quantity);

            if (
                !Number.isInteger(productId) ||
                productId <= 0 ||
                !Number.isInteger(productSizeId) ||
                productSizeId <= 0 ||
                !Number.isFinite(quantity) ||
                quantity <= 0
            ) {
                const error = new Error(
                    "Invalid sale item data"
                );

                error.statusCode = 400;
                throw error;
            }

            const productSize =
                await tx.productSize.findFirst({
                    where: {
                        id: productSizeId,
                        productId,
                    },

                    include: {
                        ingredients: true,
                    },
                });

            if (!productSize) {
                const error = new Error(
                    "Product size not found"
                );

                error.statusCode = 404;
                throw error;
            }

            const unitPrice = Number(
                productSize.finalPrice
            );

            const itemTotal =
                unitPrice * quantity;

            subtotal += itemTotal;

            // ------------------------------------------------
            // Deduct new stock
            // ------------------------------------------------

            for (
                const ingredient
                of productSize.ingredients
            ) {
                let requiredQuantity =
                    Number(ingredient.quantity) *
                    quantity;

                const batches =
                    await tx.rawMaterialBatch.findMany({
                        where: {
                            rawMaterialId:
                                ingredient.rawMaterialId,

                            quantity: {
                                gt: 0,
                            },
                        },

                        orderBy: [
                            {
                                expiryDate: {
                                    sort: "asc",
                                    nulls: "last",
                                },
                            },
                            {
                                addedAt: "asc",
                            },
                        ],
                    });

                const availableQuantity =
                    batches.reduce(
                        (total, batch) =>
                            total +
                            Number(batch.quantity),
                        0
                    );

                if (
                    availableQuantity <
                    requiredQuantity
                ) {
                    const error = new Error(
                        `Insufficient stock for raw material ${ingredient.rawMaterialId}`
                    );

                    error.statusCode = 400;
                    throw error;
                }

                for (const batch of batches) {
                    if (requiredQuantity <= 0) {
                        break;
                    }

                    const batchQuantity =
                        Number(batch.quantity);

                    const deducted = Math.min(
                        batchQuantity,
                        requiredQuantity
                    );

                    await tx.rawMaterialBatch.update({
                        where: {
                            id: batch.id,
                        },

                        data: {
                            quantity: {
                                decrement: deducted,
                            },
                        },
                    });

                    requiredQuantity -= deducted;
                }
            }

            saleItems.push({
                productId,
                productSizeId,
                quantity,
                unitPrice,
                totalPrice: itemTotal,
            });
        }

        // ----------------------------------------------------
        // 5. Validate discount
        // ----------------------------------------------------

        if (parsedDiscount > subtotal) {
            const error = new Error(
                "Discount cannot be greater than subtotal"
            );

            error.statusCode = 400;
            throw error;
        }

        const total = subtotal - parsedDiscount;

        // ----------------------------------------------------
        // 6. Delete old sale items
        // ----------------------------------------------------

        await tx.saleItem.deleteMany({
            where: {
                saleId,
            },
        });

        // ----------------------------------------------------
        // 7. Update sale
        // ----------------------------------------------------

        const updatedSale = await tx.sale.update({
            where: {
                id: saleId,
            },

            data: {
                customerId: parsedCustomerId,

                subtotal,
                discount: parsedDiscount,
                total,

                paymentMethod,
                status,

                items: {
                    create: saleItems,
                },
            },

            include: {
                customer: true,

                items: {
                    include: {
                        product: true,
                        productSize: true,
                    },
                },
            },
        });

        return updatedSale;
    });
};

// ============================================================
// Delete sale
// ============================================================

const deleteSale = async (id) => {
    const saleId = Number(id);

    if (!Number.isInteger(saleId) || saleId <= 0) {
        const error = new Error("Invalid sale ID");
        error.statusCode = 400;
        throw error;
    }

    return prisma.$transaction(async (tx) => {
        // ----------------------------------------------------
        // 1. Get existing sale
        // ----------------------------------------------------

        const existingSale = await tx.sale.findUnique({
            where: {
                id: saleId,
            },

            include: {
                items: true,
            },
        });

        if (!existingSale) {
            const error = new Error("Sale not found");
            error.statusCode = 404;
            throw error;
        }

        // ----------------------------------------------------
        // 2. Return stock
        // ----------------------------------------------------

        for (const item of existingSale.items) {
            const productSize =
                await tx.productSize.findUnique({
                    where: {
                        id: item.productSizeId,
                    },

                    include: {
                        ingredients: true,
                    },
                });

            if (!productSize) {
                const error = new Error(
                    "Product size not found"
                );

                error.statusCode = 404;
                throw error;
            }

            const saleQuantity =
                Number(item.quantity);

            for (
                const ingredient
                of productSize.ingredients
            ) {
                const quantityToReturn =
                    Number(ingredient.quantity) *
                    saleQuantity;

                const batch =
                    await tx.rawMaterialBatch.findFirst({
                        where: {
                            rawMaterialId:
                                ingredient.rawMaterialId,
                        },

                        orderBy: [
                            {
                                expiryDate: {
                                    sort: "asc",
                                    nulls: "last",
                                },
                            },
                            {
                                addedAt: "asc",
                            },
                        ],
                    });

                if (batch) {
                    await tx.rawMaterialBatch.update({
                        where: {
                            id: batch.id,
                        },

                        data: {
                            quantity: {
                                increment: quantityToReturn,
                            },
                        },
                    });
                }
            }
        }

        // ----------------------------------------------------
        // 3. Cancel sale (soft) — احتفاظ بالسجل المالي وتمييزه كمُلغى
        // ----------------------------------------------------

        const deletedSale = await tx.sale.update({
            where: {
                id: saleId,
            },

            data: {
                status: "CANCELLED",
            },

            include: {
                customer: true,

                items: {
                    include: {
                        product: true,
                        productSize: true,
                    },
                },
            },
        });

        return deletedSale;
    });
};

// ============================================================
// Export
// ============================================================

const getSalesSummary = async (filters = {}) => {
    const where = {};

    if (filters.from || filters.to) {
        where.createdAt = {};
        if (filters.from) where.createdAt.gte = new Date(filters.from);
        if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    if (filters.shiftId) {
        const shiftId = Number(filters.shiftId);
        if (Number.isInteger(shiftId) && shiftId > 0) {
            const transactions = await prisma.cashDrawerTransaction.findMany({
                where: { shiftId, type: "SALES" },
                select: { description: true },
            });
            const saleIds = transactions
                .map(t => t.description)
                .filter(Boolean)
                .map(d => {
                    const match = d.match(/sale[:# ]*(\d+)/i);
                    return match ? Number(match[1]) : null;
                })
                .filter(Boolean);
            if (saleIds.length > 0) {
                where.id = { in: saleIds };
            } else {
                where.id = { in: [] };
            }
        }
    }

    const [sales, count] = await Promise.all([
        prisma.sale.findMany({
            where,
            select: {
                subtotal: true,
                discount: true,
                total: true,
                createdAt: true,
                items: {
                    select: {
                        unitPrice: true,
                        totalPrice: true,
                        quantity: true,
                        productSize: {
                            select: {
                                basePrice: true,
                                ingredients: {
                                    select: {
                                        quantity: true,
                                        rawMaterial: {
                                            select: {
                                                batches: {
                                                    select: { pricePerUnit: true },
                                                    orderBy: { addedAt: "desc" },
                                                    take: 1,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }),
        prisma.sale.count({ where }),
    ]);

    const grossSales = sales.reduce((s, sale) => s + Number(sale.subtotal), 0);
    const discounts = sales.reduce((s, sale) => s + Number(sale.discount), 0);
    const netSales = grossSales - discounts;

    let cost = 0;
    for (const sale of sales) {
        for (const item of sale.items) {
            const itemCost = item.productSize.ingredients.reduce(
                (sum, ing) => {
                    const price = ing.rawMaterial.batches[0] ? Number(ing.rawMaterial.batches[0].pricePerUnit) : 0;
                    return sum + Number(ing.quantity) * price;
                },
                0
            );
            cost += itemCost * Number(item.quantity);
        }
    }
    cost = Math.round(cost * 100) / 100;

    const profit = Math.round((netSales - cost) * 100) / 100;
    const margin = netSales > 0 ? Math.round((profit / netSales) * 10000) / 100 : 0;

    if (filters.groupBy && ["day", "week", "month"].includes(filters.groupBy)) {
        const groupMap = {};
        for (const sale of sales) {
            const d = new Date(sale.createdAt);
            let key;
            if (filters.groupBy === "day") {
                key = d.toISOString().slice(0, 10);
            } else if (filters.groupBy === "week") {
                const startOfYear = new Date(d.getFullYear(), 0, 1);
                const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
                key = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
            } else {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            }
            if (!groupMap[key]) groupMap[key] = { gross: 0, disc: 0, count: 0 };
            groupMap[key].gross += Number(sale.subtotal);
            groupMap[key].disc += Number(sale.discount);
            groupMap[key].count += 1;
        }
        const grouped = Object.entries(groupMap).map(([period, v]) => ({
            period,
            grossSales: v.gross,
            discounts: v.disc,
            netSales: v.gross - v.disc,
            ordersCount: v.count,
        }));
        return { grossSales, discounts, netSales, cost, profit, margin, ordersCount: count, grouped };
    }

    return { grossSales, discounts, netSales, cost, profit, margin, ordersCount: count };
};

module.exports = {
    getSales,
    getSaleById,
    getSalesSummary,
    createSale,
    updateSale,
    deleteSale,
};