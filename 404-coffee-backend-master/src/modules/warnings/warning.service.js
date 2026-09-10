const prisma = require("../../lib/prisma");

// ============================================================
// Get inventory warnings (low stock + expiring materials)
// ============================================================

const getWarnings = async ({ type, days } = {}) => {
    const defaultAlertDays = Number(days) > 0 ? Number(days) : 7;

    const batches = await prisma.rawMaterialBatch.groupBy({
        by: ["rawMaterialId"],
        _sum: {
            quantity: true,
        },
    });

    const stockMap = new Map();

    for (const batch of batches) {
        stockMap.set(batch.rawMaterialId, Number(batch._sum.quantity));
    }

    const rawMaterials = await prisma.rawMaterial.findMany({
        include: {
            batches: true,
        },
    });

    const now = new Date();

    const lowStockWarnings = [];
    const expiringWarnings = [];

    for (const material of rawMaterials) {
        const currentStock = stockMap.get(material.id) || 0;

        if (currentStock < Number(material.minStockAlert)) {
            lowStockWarnings.push({
                type: "low_stock",
                rawMaterialId: material.id,
                name: material.name,
                unit: material.unit,
                currentStock,
                minStockAlert: Number(material.minStockAlert),
                severity: currentStock === 0 ? "critical" : "warning",
            });
        }

        const alertDays = material.expiryAlertDays ?? defaultAlertDays;

        for (const batch of material.batches) {
            if (!batch.expiryDate) {
                continue;
            }

            const expiry = new Date(batch.expiryDate);
            const diffMs = expiry.getTime() - now.getTime();
            const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            if (daysLeft <= alertDays) {
                expiringWarnings.push({
                    type: "expiring",
                    rawMaterialId: material.id,
                    batchId: batch.id,
                    name: material.name,
                    unit: material.unit,
                    quantity: Number(batch.quantity),
                    expiryDate: batch.expiryDate,
                    daysLeft,
                    severity: daysLeft < 0 ? "critical" : "warning",
                });
            }
        }
    }

    expiringWarnings.sort((a, b) => a.daysLeft - b.daysLeft);

    if (type === "low_stock") {
        return {
            lowStock: lowStockWarnings,
            summary: {
                lowStockCount: lowStockWarnings.length,
            },
        };
    }

    if (type === "expiring") {
        return {
            expiring: expiringWarnings,
            summary: {
                expiringCount: expiringWarnings.length,
            },
        };
    }

    return {
        lowStock: lowStockWarnings,
        expiring: expiringWarnings,
        summary: {
            lowStockCount: lowStockWarnings.length,
            expiringCount: expiringWarnings.length,
        },
    };
};

module.exports = {
    getWarnings,
};
