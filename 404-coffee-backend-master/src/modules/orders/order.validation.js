const validateOrder = (req, res, next) => {
    const {
        customerId,
        orderType,
        table,
        customerName,
        customerPhone,
        phone,
        discount,
        paymentMethod,
        notes,
        items,
    } = req.body;

    if (
        orderType &&
        !["tables", "online"].includes(orderType)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid order type",
        });
    }

    if (
        paymentMethod &&
        !["CASH", "CARD", "WALLET"].includes(paymentMethod)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid payment method",
        });
    }

    if (
        items !== undefined &&
        (!Array.isArray(items) || items.length === 0)
    ) {
        return res.status(400).json({
            success: false,
            message: "Items must be a non-empty array",
        });
    }

    if (items) {
        for (const item of items) {
            if (
                !item.productId ||
                !item.productSizeId ||
                !item.quantity ||
                Number(item.quantity) <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Each item must have productId, productSizeId and a valid quantity",
                });
            }
        }
    }

    if (discount !== undefined && Number(discount) < 0) {
        return res.status(400).json({
            success: false,
            message: "Discount cannot be negative",
        });
    }

    if (customerId !== undefined && customerId !== null) {
        if (!Number.isInteger(Number(customerId)) || Number(customerId) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid customerId",
            });
        }
    }

    if (table !== undefined && table !== null && typeof table !== "string") {
        return res.status(400).json({
            success: false,
            message: "table must be a string",
        });
    }

    if (customerName !== undefined && customerName !== null && typeof customerName !== "string") {
        return res.status(400).json({
            success: false,
            message: "customerName must be a string",
        });
    }

    if (customerPhone !== undefined && customerPhone !== null && typeof customerPhone !== "string") {
        return res.status(400).json({
            success: false,
            message: "customerPhone must be a string",
        });
    }

    if (phone !== undefined && phone !== null && typeof phone !== "string") {
        return res.status(400).json({
            success: false,
            message: "Phone must be a string",
        });
    }

    if (notes !== undefined && notes !== null && typeof notes !== "string") {
        return res.status(400).json({
            success: false,
            message: "Notes must be a string",
        });
    }

    next();
};

module.exports = {
    validateOrder,
};