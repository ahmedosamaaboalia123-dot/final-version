const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");


// ============================================================
// Helpers
// ============================================================

const httpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};


// ============================================================
// Generate return number
// ============================================================

const generateReturnNo = async () => {
    const count = await prisma.return.count();

    const number = String(count + 1).padStart(5, "0");

    return `RTN-${number}`;
};


// ============================================================
// Create return
// ============================================================

const createReturn = async (data) => {
    const {
        supplierId,
        returnDate,
        generalReason,
        notes,
        items,
    } = data;

    if (!items || items.length === 0) {
        throw httpError("Return must contain at least one item");
    }

    // --------------------------------------------------------
    // Validate supplier
    // --------------------------------------------------------

    const supplier = await prisma.supplier.findUnique({
        where: {
            id: Number(supplierId),
        },
    });

    if (!supplier) {
        throw httpError("Supplier not found", 404);
    }

    const returnItems = [];

    let totalQuantity = 0;
    let totalValue = 0;

    // --------------------------------------------------------
    // Validate raw materials
    // --------------------------------------------------------

    for (const item of items) {
        const rawMaterial = await prisma.rawMaterial.findUnique({
            where: {
                id: Number(item.rawMaterialId),
            },
            include: {
                batches: {
                    orderBy: {
                        addedAt: "desc",
                    },
                },
            },
        });

        if (!rawMaterial) {
            throw httpError(
                `Raw material with ID ${item.rawMaterialId} not found`,
                404
            );
        }

        const quantity = Number(item.quantity);

        // Current stock
        const currentStock = rawMaterial.batches.reduce(
            (sum, batch) => sum + Number(batch.quantity),
            0
        );

        if (quantity > currentStock) {
            throw httpError(
                `Insufficient stock for raw material "${rawMaterial.name}". Available: ${currentStock}`
            );
        }

        // Last price
        const lastBatch = rawMaterial.batches[0];

        const pricePerUnit = lastBatch
            ? Number(lastBatch.pricePerUnit)
            : 0;

        const totalPrice = quantity * pricePerUnit;

        totalQuantity += quantity;
        totalValue += totalPrice;

        returnItems.push({
            rawMaterialId: rawMaterial.id,
            quantity,
            unit: rawMaterial.unit,
            pricePerUnit,
            totalPrice,
            reason: item.reason || null,
        });
    }

    // --------------------------------------------------------
    // Create draft return
    // --------------------------------------------------------

    const returnNo = await generateReturnNo();

    const result = await prisma.return.create({
        data: {
            returnNo,
            supplierId: Number(supplierId),

            returnDate: returnDate
                ? new Date(returnDate)
                : new Date(),

            generalReason: generalReason || null,
            notes: notes || null,

            totalQuantity,
            totalValue,

            status: "DRAFT",

            items: {
                create: returnItems,
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

    return result;
};


// ============================================================
// Get all returns
// ============================================================

const getReturns = async (filters = {}) => {
    const {
        supplierId,
        status,
    } = filters;

    const where = {};

    if (supplierId) {
        where.supplierId = Number(supplierId);
    }

    if (status) {
        where.status = status;
    }

    const { skip, take } = parsePagination(filters);

    const [returns, total] = await Promise.all([
        prisma.return.findMany({
            where,

            include: {
                supplier: true,

                items: {
                    include: {
                        rawMaterial: true,
                    },
                },
            },

            orderBy: {
                createdAt: "desc",
            },

            skip,
            take,
        }),
        prisma.return.count({ where }),
    ]);

    return { items: returns, total };
};


// ============================================================
// Get return by ID
// ============================================================

const getReturnById = async (id) => {
    const result = await prisma.return.findUnique({
        where: {
            id: Number(id),
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

    if (!result) {
        throw httpError("Return not found", 404);
    }

    return result;
};


// ============================================================
// Update draft return
// ============================================================

const updateReturn = async (id, data) => {
    const existingReturn = await prisma.return.findUnique({
        where: {
            id: Number(id),
        },

        include: {
            items: true,
        },
    });

    if (!existingReturn) {
        throw httpError("Return not found", 404);
    }

    if (existingReturn.status !== "DRAFT") {
        throw httpError(
            "Only draft returns can be updated"
        );
    }

    const {
        supplierId,
        returnDate,
        generalReason,
        notes,
        items,
    } = data;

    // --------------------------------------------------------
    // Validate supplier
    // --------------------------------------------------------

    if (supplierId !== undefined) {
        const supplier = await prisma.supplier.findUnique({
            where: {
                id: Number(supplierId),
            },
        });

        if (!supplier) {
            throw httpError("Supplier not found", 404);
        }
    }

    const updateData = {};

    if (supplierId !== undefined) {
        updateData.supplierId = Number(supplierId);
    }

    if (returnDate !== undefined) {
        updateData.returnDate = new Date(returnDate);
    }

    if (generalReason !== undefined) {
        updateData.generalReason = generalReason;
    }

    if (notes !== undefined) {
        updateData.notes = notes;
    }

    // --------------------------------------------------------
    // Update items
    // --------------------------------------------------------

    if (items !== undefined) {
        if (!Array.isArray(items) || items.length === 0) {
            throw httpError(
                "Return must contain at least one item"
            );
        }

        const returnItems = [];

        let totalQuantity = 0;
        let totalValue = 0;

        for (const item of items) {
            const rawMaterial =
                await prisma.rawMaterial.findUnique({
                    where: {
                        id: Number(item.rawMaterialId),
                    },

                    include: {
                        batches: {
                            orderBy: {
                                addedAt: "desc",
                            },
                        },
                    },
                });

            if (!rawMaterial) {
                throw httpError(
                    `Raw material with ID ${item.rawMaterialId} not found`,
                    404
                );
            }

            const quantity = Number(item.quantity);

            const currentStock =
                rawMaterial.batches.reduce(
                    (sum, batch) =>
                        sum + Number(batch.quantity),
                    0
                );

            if (quantity > currentStock) {
                throw httpError(
                    `Insufficient stock for raw material "${rawMaterial.name}". Available: ${currentStock}`
                );
            }

            const lastBatch = rawMaterial.batches[0];

            const pricePerUnit = lastBatch
                ? Number(lastBatch.pricePerUnit)
                : 0;

            const totalPrice =
                quantity * pricePerUnit;

            totalQuantity += quantity;
            totalValue += totalPrice;

            returnItems.push({
                rawMaterialId: rawMaterial.id,
                quantity,
                unit: rawMaterial.unit,
                pricePerUnit,
                totalPrice,
                reason: item.reason || null,
            });
        }

        await prisma.returnItem.deleteMany({
            where: {
                returnId: Number(id),
            },
        });

        updateData.totalQuantity = totalQuantity;
        updateData.totalValue = totalValue;

        updateData.items = {
            create: returnItems,
        };
    }

    return prisma.return.update({
        where: {
            id: Number(id),
        },

        data: updateData,

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
// Approve return
// ============================================================

const approveReturn = async (id) => {
    return prisma.$transaction(async (tx) => {
        const returnRecord = await tx.return.findUnique({
            where: {
                id: Number(id),
            },

            include: {
                items: true,
            },
        });

        if (!returnRecord) {
            throw httpError("Return not found", 404);
        }

        if (returnRecord.status !== "DRAFT") {
            throw httpError(
                "Only draft returns can be approved"
            );
        }

        // ----------------------------------------------------
        // Deduct stock from batches
        // ----------------------------------------------------

        for (const item of returnRecord.items) {
            let remaining =
                Number(item.quantity);

            const batches =
                await tx.rawMaterialBatch.findMany({
                    where: {
                        rawMaterialId:
                            item.rawMaterialId,
                        quantity: {
                            gt: 0,
                        },
                    },

                    orderBy: {
                        addedAt: "asc",
                    },
                });

            const currentStock = batches.reduce(
                (sum, batch) =>
                    sum + Number(batch.quantity),
                0
            );

            if (remaining > currentStock) {
                throw httpError(
                    `Insufficient stock for raw material ID ${item.rawMaterialId}`
                );
            }

            for (const batch of batches) {
                if (remaining <= 0) {
                    break;
                }

                const batchQuantity =
                    Number(batch.quantity);

                const deduction = Math.min(
                    remaining,
                    batchQuantity
                );

                const newQuantity =
                    batchQuantity - deduction;

                await tx.rawMaterialBatch.update({
                    where: {
                        id: batch.id,
                    },

                    data: {
                        quantity: newQuantity,
                    },
                });

                remaining -= deduction;
            }
        }

        // ----------------------------------------------------
        // Approve return
        // ----------------------------------------------------

        return tx.return.update({
            where: {
                id: Number(id),
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
// Cancel return
// ============================================================

const cancelReturn = async (id) => {
    const existingReturn = await prisma.return.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingReturn) {
        throw httpError("Return not found", 404);
    }

    if (existingReturn.status !== "DRAFT") {
        throw httpError(
            "Only draft returns can be cancelled"
        );
    }

    return prisma.return.update({
        where: {
            id: Number(id),
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
// Delete return
// ============================================================

const deleteReturn = async (id) => {
    const existingReturn = await prisma.return.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingReturn) {
        throw httpError("Return not found", 404);
    }

    if (existingReturn.status !== "DRAFT") {
        throw httpError(
            "Only draft returns can be deleted"
        );
    }

    return prisma.return.delete({
        where: {
            id: Number(id),
        },
    });
};


module.exports = {
    createReturn,
    getReturns,
    getReturnById,
    updateReturn,
    approveReturn,
    cancelReturn,
    deleteReturn,
};