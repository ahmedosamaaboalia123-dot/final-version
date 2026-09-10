/**
 * services/raw-material.service.js
 * ============================================================
 * Raw Material Service
 *
 * RawMaterial = تعريف المادة الخام نفسها.
 * RawMaterialBatch = كل دفعة من المادة بكمية وسعر وتاريخ صلاحية مختلف.
 */

const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get all raw materials
// ============================================================

const getRawMaterials = async (reqQuery = {}) => {
    const { page, pageSize, skip, take } = parsePagination(reqQuery);

    const [rawMaterials, total] = await Promise.all([
        prisma.rawMaterial.findMany({
            orderBy: {
                createdAt: "desc",
            },
            include: {
                supplierRel: { select: { id: true, name: true } },
                batches: {
                    orderBy: [
                        { expiryDate: "asc" },
                        { createdAt: "asc" },
                    ],
                },
            },
            skip,
            take,
        }),
        prisma.rawMaterial.count(),
    ]);

    return {
        items: rawMaterials.map((m) => ({
            ...m,
            supplierId: m.supplierId,
            supplier: m.supplierRel || (m.supplier ? { id: null, name: m.supplier } : null),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
};

// ============================================================
// Create raw material
// ============================================================

const createRawMaterial = async ({
    name,
    unit,
    quantity,
    pricePerUnit,
    supplier,
    supplierId,
    addedAt,
    expiryDate,
    minStockAlert,
    expiryAlertDays,
}) => {
    // Check required fields
    if (
        !name ||
        !unit ||
        quantity === undefined ||
        pricePerUnit === undefined ||
        minStockAlert === undefined
    ) {
        const error = new Error(
            "Required raw material data is missing"
        );

        error.statusCode = 400;
        throw error;
    }

    // Check if raw material already exists
    const existingMaterial = await prisma.rawMaterial.findUnique({
        where: {
            name,
        },
    });

    const batchData = {
        quantity,
        pricePerUnit,
        addedAt: addedAt ? new Date(addedAt) : new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        initialQuantity: quantity,
    };

    let rawMaterial;

    // ========================================================
    // If material already exists:
    // Create a new batch
    // ========================================================

    if (existingMaterial) {
        rawMaterial = await prisma.rawMaterial.update({
            where: {
                id: existingMaterial.id,
            },

            data: {
                batches: {
                    create: batchData,
                },
            },

            include: {
                supplierRel: { select: { id: true, name: true } },
                batches: {
                    orderBy: [
                        { expiryDate: "asc" },
                        { createdAt: "asc" },
                    ],
                },
            },
        });

        return rawMaterial;
    }

    // ========================================================
    // If material doesn't exist:
    // Create material + first batch
    // ========================================================

    const createData = {
        name,
        unit,
        minStockAlert,
        expiryAlertDays:
            expiryAlertDays !== undefined
                ? expiryAlertDays
                : null,
        addedAt: addedAt ? new Date(addedAt) : new Date(),
        batches: {
            create: batchData,
        },
    };

    if (supplierId) {
        createData.supplierId = Number(supplierId);
    } else if (supplier) {
        createData.supplier = supplier;
    }

    rawMaterial = await prisma.rawMaterial.create({
        data: createData,

        include: {
            supplierRel: { select: { id: true, name: true } },
            batches: true,
        },
    });

    return rawMaterial;
};

// ============================================================
// Update raw material
// ============================================================

const updateRawMaterial = async (id, data) => {
    const rawMaterialId = Number(id);

    // Check material exists
    const existingMaterial = await prisma.rawMaterial.findUnique({
        where: {
            id: rawMaterialId,
        },
    });

    if (!existingMaterial) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const {
        name,
        unit,
        supplier,
        supplierId,
        addedAt,
        minStockAlert,
        expiryAlertDays,

        // Batch fields
        quantity,
        pricePerUnit,
        expiryDate,
    } = data;

    // Update main RawMaterial data
    const updateData = {
        ...(name !== undefined && { name }),
        ...(unit !== undefined && { unit }),
        ...(addedAt !== undefined && {
            addedAt: new Date(addedAt),
        }),
        ...(minStockAlert !== undefined && {
            minStockAlert,
        }),
        ...(expiryAlertDays !== undefined && {
            expiryAlertDays,
        }),
    };

    if (supplierId !== undefined) {
        updateData.supplierId = supplierId ? Number(supplierId) : null;
    } else if (supplier !== undefined) {
        updateData.supplier = supplier || null;
    }

    // If batch data was sent, create a new batch
    const hasBatchData =
        quantity !== undefined ||
        pricePerUnit !== undefined ||
        expiryDate !== undefined;

    if (hasBatchData) {
        // All batch fields are required when creating
        // a new batch through update
        if (
            quantity === undefined ||
            pricePerUnit === undefined
        ) {
            const error = new Error(
                "quantity and pricePerUnit are required when creating a batch"
            );

            error.statusCode = 400;
            throw error;
        }

        updateData.batches = {
            create: {
                quantity,
                pricePerUnit,
                initialQuantity: quantity,
                expiryDate: expiryDate
                    ? new Date(expiryDate)
                    : null,
            },
        };
    }

    const updatedMaterial = await prisma.rawMaterial.update({
        where: {
            id: rawMaterialId,
        },

        data: updateData,

        include: {
            supplierRel: { select: { id: true, name: true } },
            batches: {
                orderBy: [
                    { expiryDate: "asc" },
                    { createdAt: "asc" },
                ],
            },
        },
    });

    return updatedMaterial;
};

// ============================================================
// Delete raw material
// ============================================================

const deleteRawMaterial = async (id) => {
    const rawMaterialId = Number(id);

    const existingMaterial = await prisma.rawMaterial.findUnique({
        where: {
            id: rawMaterialId,
        },

        include: {
            batches: true,
        },
    });

    if (!existingMaterial) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const purchaseCount = await prisma.purchaseItem.count({
        where: { rawMaterialId: rawMaterialId },
    });
    const returnCount = await prisma.returnItem.count({
        where: { rawMaterialId: rawMaterialId },
    });
    if (purchaseCount > 0 || returnCount > 0) {
        const error = new Error("لا يمكن حذف المادة لوجود سجلات مرتبطة");
        error.statusCode = 409;
        throw error;
    }

    await prisma.rawMaterial.delete({
        where: {
            id: rawMaterialId,
        },
    });

    return existingMaterial;
};


// Add new batch
const addBatch = async (rawMaterialId, batchData) => {
    const material = await prisma.rawMaterial.findUnique({
        where: {
            id: Number(rawMaterialId),
        },
    });

    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const { quantity, pricePerUnit, expiryDate, addedAt } =
        batchData;

    if (
        quantity === undefined ||
        pricePerUnit === undefined
    ) {
        const error = new Error(
            "quantity and pricePerUnit are required"
        );
        error.statusCode = 400;
        throw error;
    }

    // Get next batch number
    const lastBatch = await prisma.rawMaterialBatch.findFirst({
        where: { rawMaterialId: Number(rawMaterialId) },
        orderBy: { id: "desc" },
    });
    const nextBatchNum = lastBatch
        ? (parseInt(lastBatch.batchNumber?.replace(/\D/g, "") || "0") + 1)
        : 1;
    const batchNumber = `B-${String(nextBatchNum).padStart(2, "0")}`;

    // Get next withdrawal priority
    const maxPriority = await prisma.rawMaterialBatch.aggregate({
        where: { rawMaterialId: Number(rawMaterialId) },
        _max: { withdrawalPriority: true },
    });
    const nextPriority = (maxPriority._max.withdrawalPriority || 0) + 1;

    const batch = await prisma.rawMaterialBatch.create({
        data: {
            rawMaterialId: Number(rawMaterialId),
            quantity,
            pricePerUnit,
            initialQuantity: quantity,
            batchNumber,
            withdrawalPriority: nextPriority,
            expiryDate: expiryDate
                ? new Date(expiryDate)
                : null,
            addedAt: addedAt ? new Date(addedAt) : new Date(),
        },
    });

    return batch;
};


// Get material batches
const getMaterialBatches = async (rawMaterialId) => {
    const material = await prisma.rawMaterial.findUnique({
        where: {
            id: Number(rawMaterialId),
        },
    });

    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const batches = await prisma.rawMaterialBatch.findMany({
        where: {
            rawMaterialId: Number(rawMaterialId),
        },
        orderBy: [
            {
                expiryDate: "asc",
            },
            {
                createdAt: "asc",
            },
        ],
    });

    return batches;
};

// ============================================================
// Get raw materials options (for dropdowns)
// ============================================================

const getRawMaterialsOptions = async () => {
    const materials = await prisma.rawMaterial.findMany({
        select: {
            id: true,
            name: true,
            unit: true,
        },
        orderBy: { name: "asc" },
    });
    return materials;
};

// ============================================================
// Edit batch
// ============================================================

const updateBatch = async (rawMaterialId, batchId, data) => {
    const material = await prisma.rawMaterial.findUnique({
        where: { id: Number(rawMaterialId) },
    });
    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const batch = await prisma.rawMaterialBatch.findUnique({
        where: { id: Number(batchId) },
    });
    if (!batch || batch.rawMaterialId !== Number(rawMaterialId)) {
        const error = new Error("Batch not found");
        error.statusCode = 404;
        throw error;
    }

    const { quantity, pricePerUnit, addedAt, expiryDate, adjustmentReason } = data;

    // If quantity is changing, adjustmentReason is required
    if (quantity !== undefined && quantity !== Number(batch.quantity) && !adjustmentReason) {
        const error = new Error("adjustmentReason is required when changing quantity");
        error.statusCode = 400;
        throw error;
    }

    const updateData = {
        ...(quantity !== undefined && { quantity, initialQuantity: quantity }),
        ...(pricePerUnit !== undefined && { pricePerUnit }),
        ...(addedAt !== undefined && { addedAt: new Date(addedAt) }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
    };

    return prisma.rawMaterialBatch.update({
        where: { id: Number(batchId) },
        data: updateData,
    });
};

// ============================================================
// Delete batch
// ============================================================

const deleteBatch = async (rawMaterialId, batchId) => {
    const material = await prisma.rawMaterial.findUnique({
        where: { id: Number(rawMaterialId) },
    });
    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    const batch = await prisma.rawMaterialBatch.findUnique({
        where: { id: Number(batchId) },
    });
    if (!batch || batch.rawMaterialId !== Number(rawMaterialId)) {
        const error = new Error("Batch not found");
        error.statusCode = 404;
        throw error;
    }

    // Check for linked withdrawals
    const withdrawalCount = await prisma.rawMaterialWithdrawal.count({
        where: { batchId: Number(batchId) },
    });
    if (withdrawalCount > 0) {
        const error = new Error("لا يمكن حذف الدفعة لوجود حركات مرتبطة");
        error.statusCode = 409;
        throw error;
    }

    await prisma.rawMaterialBatch.delete({
        where: { id: Number(batchId) },
    });

    // Reorder remaining batch priorities (no gaps)
    const remaining = await prisma.rawMaterialBatch.findMany({
        where: { rawMaterialId: Number(rawMaterialId) },
        orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    });

    for (let i = 0; i < remaining.length; i++) {
        await prisma.rawMaterialBatch.update({
            where: { id: remaining[i].id },
            data: { withdrawalPriority: i + 1 },
        });
    }

    return batch;
};

// ============================================================
// Update batch withdrawal priorities
// ============================================================

const updateBatchesPriority = async (rawMaterialId, batches) => {
    const material = await prisma.rawMaterial.findUnique({
        where: { id: Number(rawMaterialId) },
    });
    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    if (!Array.isArray(batches) || batches.length === 0) {
        const error = new Error("batches array is required");
        error.statusCode = 400;
        throw error;
    }

    // Validate no duplicate priorities
    const priorities = batches.map((b) => b.withdrawalPriority);
    const uniquePriorities = new Set(priorities);
    if (uniquePriorities.size !== priorities.length) {
        const error = new Error("Duplicate withdrawal priorities are not allowed");
        error.statusCode = 400;
        throw error;
    }

    // Validate all batch IDs belong to this material
    const batchIds = batches.map((b) => b.batchId);
    const existingBatches = await prisma.rawMaterialBatch.findMany({
        where: { id: { in: batchIds }, rawMaterialId: Number(rawMaterialId) },
    });
    if (existingBatches.length !== batchIds.length) {
        const error = new Error("One or more batch IDs are invalid");
        error.statusCode = 400;
        throw error;
    }

    // Update priorities in a transaction
    await prisma.$transaction(
        batches.map((b) =>
            prisma.rawMaterialBatch.update({
                where: { id: b.batchId },
                data: { withdrawalPriority: b.withdrawalPriority },
            })
        )
    );

    return batches.map((b) => ({
        id: b.batchId,
        withdrawalPriority: b.withdrawalPriority,
    }));
};

// ============================================================
// Manual withdrawal from batch
// ============================================================

const createWithdrawal = async (rawMaterialId, { batchId, quantity, reason }, userId) => {
    const material = await prisma.rawMaterial.findUnique({
        where: { id: Number(rawMaterialId) },
    });
    if (!material) {
        const error = new Error("Raw material not found");
        error.statusCode = 404;
        throw error;
    }

    if (!batchId || quantity === undefined || quantity <= 0) {
        const error = new Error("batchId and a positive quantity are required");
        error.statusCode = 400;
        throw error;
    }

    const batch = await prisma.rawMaterialBatch.findUnique({
        where: { id: Number(batchId) },
    });
    if (!batch || batch.rawMaterialId !== Number(rawMaterialId)) {
        const error = new Error("Batch not found");
        error.statusCode = 404;
        throw error;
    }

    if (Number(quantity) > Number(batch.quantity)) {
        const error = new Error("الكمية المطلوبة أكبر من الكمية المتاحة");
        error.statusCode = 422;
        throw error;
    }

    const unitCost = Number(batch.pricePerUnit);
    const totalCost = unitCost * Number(quantity);

    const withdrawal = await prisma.rawMaterialWithdrawal.create({
        data: {
            rawMaterialId: Number(rawMaterialId),
            batchId: Number(batchId),
            quantity: Number(quantity),
            unitCost,
            totalCost,
            reason: reason || null,
            processedByUserId: userId || null,
        },
    });

    // Decrease batch quantity
    await prisma.rawMaterialBatch.update({
        where: { id: Number(batchId) },
        data: { quantity: { decrement: Number(quantity) } },
    });

    return {
        ...withdrawal,
        processedAt: withdrawal.processedAt,
    };
};

// ============================================================
// Withdrawal history
// ============================================================

const getWithdrawals = async (reqQuery = {}) => {
    const { page, pageSize, skip, take } = parsePagination(reqQuery);

    const [items, total] = await Promise.all([
        prisma.rawMaterialWithdrawal.findMany({
            orderBy: { processedAt: "desc" },
            include: {
                rawMaterial: {
                    select: {
                        id: true,
                        name: true,
                        unit: true,
                        supplierRel: { select: { id: true, name: true } },
                    },
                },
                batch: {
                    select: { id: true, batchNumber: true },
                },
                processedByUser: {
                    select: { id: true, name: true },
                },
            },
            skip,
            take,
        }),
        prisma.rawMaterialWithdrawal.count(),
    ]);

    return {
        items: items.map((w) => ({
            ...w,
            processedBy: w.processedByUser,
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
};

// ============================================================
// Return options (materials with batches for returns)
// ============================================================

const getReturnOptions = async () => {
    const materials = await prisma.rawMaterial.findMany({
        include: {
            supplierRel: { select: { id: true, name: true } },
            batches: {
                where: { quantity: { gt: 0 } },
                select: {
                    id: true,
                    batchNumber: true,
                    quantity: true,
                    pricePerUnit: true,
                },
                orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
            },
        },
        orderBy: { name: "asc" },
    });

    return materials.map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        supplier: m.supplierRel || (m.supplier ? { id: null, name: m.supplier } : null),
        batches: m.batches,
    }));
};

// ============================================================
// Get raw material by ID
// ============================================================

const getRawMaterialById = async (id) => {
    const material = await prisma.rawMaterial.findUnique({
        where: { id: Number(id) },
        include: {
            supplierRel: { select: { id: true, name: true } },
            batches: {
                orderBy: [
                    { withdrawalPriority: "asc" },
                    { expiryDate: "asc" },
                    { createdAt: "asc" },
                ],
            },
        },
    });
    return material;
};

module.exports = {
    getRawMaterials,
    getRawMaterialById,
    createRawMaterial,
    updateRawMaterial,
    deleteRawMaterial,
    addBatch,
    getMaterialBatches,
    getRawMaterialsOptions,
    updateBatch,
    deleteBatch,
    updateBatchesPriority,
    createWithdrawal,
    getWithdrawals,
    getReturnOptions,
};