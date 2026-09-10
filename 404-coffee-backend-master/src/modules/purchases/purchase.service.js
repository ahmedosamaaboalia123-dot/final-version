const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get all purchases
// ============================================================

const getPurchases = async (reqQuery = {}) => {
    const { skip, take } = parsePagination(reqQuery);

    const [purchases, total] = await Promise.all([
        prisma.purchase.findMany({
            orderBy: {
                createdAt: "desc",
            },
            include: {
                supplier: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },
            skip,
            take,
        }),
        prisma.purchase.count(),
    ]);

    return { items: purchases, total };
};

// ============================================================
// Get purchase by ID
// ============================================================

const getPurchaseById = async (id) => {
    const purchaseId = Number(id);

    if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        const error = new Error("Invalid purchase ID");
        error.statusCode = 400;
        throw error;
    }

    const purchase = await prisma.purchase.findUnique({
        where: {
            id: purchaseId,
        },
        include: {
            supplier: true,
            items: {
                include: {
                    rawMaterial: true,
                },
            },
        },
    });

    if (!purchase) {
        const error = new Error("Purchase not found");
        error.statusCode = 404;
        throw error;
    }

    return purchase;
};

// ============================================================
// Create purchase
// ============================================================

const createPurchase = async ({
    invoiceNo,
    supplierId,
    invoiceDate,
    discount = 0,
    items,
}) => {
    if (!invoiceNo || !supplierId || !invoiceDate) {
        const error = new Error(
            "invoiceNo, supplierId and invoiceDate are required"
        );
        error.statusCode = 400;
        throw error;
    }

    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("Purchase items are required");
        error.statusCode = 400;
        throw error;
    }

    const parsedSupplierId = Number(supplierId);
    const parsedDiscount = Number(discount);

    if (
        !Number.isInteger(parsedSupplierId) ||
        parsedSupplierId <= 0
    ) {
        const error = new Error("Invalid supplier ID");
        error.statusCode = 400;
        throw error;
    }

    if (Number.isNaN(parsedDiscount) || parsedDiscount < 0) {
        const error = new Error("Invalid discount");
        error.statusCode = 400;
        throw error;
    }

    const existingPurchase = await prisma.purchase.findUnique({
        where: {
            invoiceNo,
        },
    });

    if (existingPurchase) {
        const error = new Error("Invoice number already exists");
        error.statusCode = 409;
        throw error;
    }

    const supplier = await prisma.supplier.findUnique({
        where: {
            id: parsedSupplierId,
        },
    });

    if (!supplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    let total = 0;

    const purchaseItems = [];

    for (const item of items) {
        const rawMaterialId = Number(item.rawMaterialId);
        const quantity = Number(item.quantity);
        const pricePerUnit = Number(item.pricePerUnit);
        const unit = item.unit;

        if (
            !Number.isInteger(rawMaterialId) ||
            rawMaterialId <= 0 ||
            !quantity ||
            quantity <= 0 ||
            Number.isNaN(pricePerUnit) ||
            pricePerUnit < 0 ||
            !unit
        ) {
            const error = new Error(
                "Invalid purchase item data"
            );
            error.statusCode = 400;
            throw error;
        }

        const rawMaterial = await prisma.rawMaterial.findUnique({
            where: {
                id: rawMaterialId,
            },
        });

        if (!rawMaterial) {
            const error = new Error(
                `Raw material ${rawMaterialId} not found`
            );
            error.statusCode = 404;
            throw error;
        }

        const totalPrice = quantity * pricePerUnit;

        total += totalPrice;

        purchaseItems.push({
            rawMaterialId,
            quantity,
            unit,
            pricePerUnit,
            totalPrice,
        });
    }

    const finalTotal = Math.max(total - parsedDiscount, 0);

    return prisma.purchase.create({
        data: {
            invoiceNo,
            supplierId: parsedSupplierId,
            invoiceDate: new Date(invoiceDate),
            discount: parsedDiscount,
            total,
            finalTotal,
            status: "DRAFT",

            items: {
                create: purchaseItems,
            },
        },

        include: {
            supplier: true,
            items: {
                include: {
                    rawMaterial: true,
                },
            },
        },
    });
};

// ============================================================
// Update purchase
// ============================================================

const updatePurchase = async (id, data) => {
    const purchaseId = Number(id);

    if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        const error = new Error("Invalid purchase ID");
        error.statusCode = 400;
        throw error;
    }

    const existingPurchase = await prisma.purchase.findUnique({
        where: {
            id: purchaseId,
        },
        include: {
            items: true,
        },
    });

    if (!existingPurchase) {
        const error = new Error("Purchase not found");
        error.statusCode = 404;
        throw error;
    }

    if (existingPurchase.status !== "DRAFT") {
        const error = new Error(
            "Only draft purchases can be updated"
        );
        error.statusCode = 400;
        throw error;
    }

    const {
        invoiceNo,
        supplierId,
        invoiceDate,
        discount,
        items,
    } = data;

    if (invoiceNo !== undefined && !invoiceNo) {
        const error = new Error("Invoice number is required");
        error.statusCode = 400;
        throw error;
    }

    if (invoiceNo !== undefined && invoiceNo !== existingPurchase.invoiceNo) {
        const duplicate = await prisma.purchase.findUnique({
            where: {
                invoiceNo,
            },
        });

        if (duplicate) {
            const error = new Error(
                "Invoice number already exists"
            );
            error.statusCode = 409;
            throw error;
        }
    }

    let parsedSupplierId = existingPurchase.supplierId;

    if (supplierId !== undefined) {
        parsedSupplierId = Number(supplierId);

        const supplier = await prisma.supplier.findUnique({
            where: {
                id: parsedSupplierId,
            },
        });

        if (!supplier) {
            const error = new Error("Supplier not found");
            error.statusCode = 404;
            throw error;
        }
    }

    let parsedDiscount =
        discount !== undefined
            ? Number(discount)
            : Number(existingPurchase.discount);

    if (Number.isNaN(parsedDiscount) || parsedDiscount < 0) {
        const error = new Error("Invalid discount");
        error.statusCode = 400;
        throw error;
    }

    let total = Number(existingPurchase.total);
    let purchaseItems;

    if (items !== undefined) {
        if (!Array.isArray(items) || items.length === 0) {
            const error = new Error("Purchase items are required");
            error.statusCode = 400;
            throw error;
        }

        total = 0;
        purchaseItems = [];

        for (const item of items) {
            const rawMaterialId = Number(item.rawMaterialId);
            const quantity = Number(item.quantity);
            const pricePerUnit = Number(item.pricePerUnit);
            const unit = item.unit;

            if (
                !Number.isInteger(rawMaterialId) ||
                rawMaterialId <= 0 ||
                !quantity ||
                quantity <= 0 ||
                Number.isNaN(pricePerUnit) ||
                pricePerUnit < 0 ||
                !unit
            ) {
                const error = new Error(
                    "Invalid purchase item data"
                );
                error.statusCode = 400;
                throw error;
            }

            const rawMaterial =
                await prisma.rawMaterial.findUnique({
                    where: {
                        id: rawMaterialId,
                    },
                });

            if (!rawMaterial) {
                const error = new Error(
                    `Raw material ${rawMaterialId} not found`
                );
                error.statusCode = 404;
                throw error;
            }

            const totalPrice = quantity * pricePerUnit;

            total += totalPrice;

            purchaseItems.push({
                rawMaterialId,
                quantity,
                unit,
                pricePerUnit,
                totalPrice,
            });
        }
    }

    const finalTotal = Math.max(total - parsedDiscount, 0);

    return prisma.$transaction(async (tx) => {
        if (items !== undefined) {
            await tx.purchaseItem.deleteMany({
                where: {
                    purchaseId,
                },
            });
        }

        return tx.purchase.update({
            where: {
                id: purchaseId,
            },

            data: {
                ...(invoiceNo !== undefined && {
                    invoiceNo,
                }),

                ...(supplierId !== undefined && {
                    supplierId: parsedSupplierId,
                }),

                ...(invoiceDate !== undefined && {
                    invoiceDate: new Date(invoiceDate),
                }),

                discount: parsedDiscount,
                total,
                finalTotal,

                ...(items !== undefined && {
                    items: {
                        create: purchaseItems,
                    },
                }),
            },

            include: {
                supplier: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },
        });
    });
};

// ============================================================
// Approve purchase
// ============================================================

const approvePurchase = async (id) => {
    const purchaseId = Number(id);

    if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        const error = new Error("Invalid purchase ID");
        error.statusCode = 400;
        throw error;
    }

    return prisma.$transaction(async (tx) => {
        const purchase = await tx.purchase.findUnique({
            where: {
                id: purchaseId,
            },
            include: {
                items: true,
            },
        });

        if (!purchase) {
            const error = new Error("Purchase not found");
            error.statusCode = 404;
            throw error;
        }

        if (purchase.status !== "DRAFT") {
            const error = new Error(
                "Only draft purchases can be approved"
            );
            error.statusCode = 400;
            throw error;
        }

        if (!purchase.items.length) {
            const error = new Error(
                "Purchase must contain at least one item"
            );
            error.statusCode = 400;
            throw error;
        }

        for (const item of purchase.items) {
            const rawMaterial = await tx.rawMaterial.findUnique({
                where: {
                    id: item.rawMaterialId,
                },
            });

            if (!rawMaterial) {
                const error = new Error(
                    `Raw material ${item.rawMaterialId} not found`
                );
                error.statusCode = 404;
                throw error;
            }

            await tx.rawMaterialBatch.create({
                data: {
                    rawMaterialId: item.rawMaterialId,
                    quantity: item.quantity,
                    pricePerUnit: item.pricePerUnit,
                    addedAt: new Date(),
                },
            });
        }

        return tx.purchase.update({
            where: {
                id: purchaseId,
            },

            data: {
                status: "APPROVED",
            },

            include: {
                supplier: true,
                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },
        });
    });
};

// ============================================================
// Cancel purchase
// ============================================================

const cancelPurchase = async (id) => {
    const purchaseId = Number(id);

    if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        const error = new Error("Invalid purchase ID");
        error.statusCode = 400;
        throw error;
    }

    const purchase = await prisma.purchase.findUnique({
        where: {
            id: purchaseId,
        },
    });

    if (!purchase) {
        const error = new Error("Purchase not found");
        error.statusCode = 404;
        throw error;
    }

    if (purchase.status === "APPROVED") {
        const error = new Error(
            "Approved purchase cannot be cancelled"
        );
        error.statusCode = 400;
        throw error;
    }

    return prisma.purchase.update({
        where: {
            id: purchaseId,
        },

        data: {
            status: "CANCELLED",
        },

        include: {
            supplier: true,
            items: {
                include: {
                    rawMaterial: true,
                },
            },
        },
    });
};

// ============================================================
// Delete purchase
// ============================================================

const deletePurchase = async (id) => {
    const purchaseId = Number(id);

    const purchase = await prisma.purchase.findUnique({
        where: {
            id: purchaseId,
        },
    });

    if (!purchase) {
        const error = new Error("Purchase not found");
        error.statusCode = 404;
        throw error;
    }

    if (purchase.status !== "DRAFT" && purchase.status !== "CANCELLED") {
        const error = new Error(
            "Only draft or cancelled purchases can be deleted"
        );
        error.statusCode = 400;
        throw error;
    }

    await prisma.purchase.delete({
        where: {
            id: purchaseId,
        },
    });

    return purchase;
};

module.exports = {
    getPurchases,
    getPurchaseById,
    createPurchase,
    updatePurchase,
    approvePurchase,
    cancelPurchase,
    deletePurchase,
};
