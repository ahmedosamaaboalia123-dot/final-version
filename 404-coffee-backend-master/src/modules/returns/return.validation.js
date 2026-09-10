const validateReturn = (req, res, next) => {
    const {
        supplierId,
        returnDate,
        generalReason,
        notes,
        items,
    } = req.body;

    if (
        supplierId === undefined ||
        supplierId === null ||
        !Number.isInteger(Number(supplierId)) ||
        Number(supplierId) <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Valid supplierId is required",
        });
    }

    if (
        returnDate !== undefined &&
        returnDate !== null &&
        Number.isNaN(new Date(returnDate).getTime())
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid returnDate",
        });
    }

    if (
        generalReason !== undefined &&
        generalReason !== null &&
        typeof generalReason !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message: "generalReason must be a string",
        });
    }

    if (
        notes !== undefined &&
        notes !== null &&
        typeof notes !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message: "notes must be a string",
        });
    }

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Return must contain at least one item",
        });
    }

    for (const item of items) {
        if (
            !item.rawMaterialId ||
            !Number.isInteger(Number(item.rawMaterialId)) ||
            Number(item.rawMaterialId) <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Each item must have a valid rawMaterialId",
            });
        }

        if (
            item.quantity === undefined ||
            Number(item.quantity) <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Each item must have a valid quantity",
            });
        }

        if (
            item.reason !== undefined &&
            item.reason !== null &&
            typeof item.reason !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Item reason must be a string",
            });
        }
    }

    next();
};

module.exports = {
    validateReturn,
};