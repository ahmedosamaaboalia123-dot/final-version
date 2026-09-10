const validateSale = (req, res, next) => {
    const {
        customerId,
        discount,
        paymentMethod,
        status,
        items,
    } = req.body;

    // ========================================================
    // Validate customerId
    // ========================================================

    if (
        customerId !== undefined &&
        customerId !== null &&
        (!Number.isInteger(Number(customerId)) ||
            Number(customerId) <= 0)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid customerId",
        });
    }

    // ========================================================
    // Validate discount
    // ========================================================

    if (
        discount !== undefined &&
        (!Number.isFinite(Number(discount)) ||
            Number(discount) < 0)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid discount",
        });
    }

    // ========================================================
    // Validate payment method
    // ========================================================

    const allowedPaymentMethods = [
        "CASH",
        "CARD",
        "WALLET",
    ];

    if (
        paymentMethod !== undefined &&
        !allowedPaymentMethods.includes(paymentMethod)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid payment method",
        });
    }

    // ========================================================
    // Validate sale status
    // ========================================================

    const allowedStatuses = [
        "COMPLETED",
        "CANCELLED",
    ];

    if (
        status !== undefined &&
        !allowedStatuses.includes(status)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid sale status",
        });
    }

    // ========================================================
    // Validate items
    // ========================================================

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Sale items are required",
        });
    }

    // ========================================================
    // Validate each item
    // ========================================================

    for (const item of items) {
        const {
            productId,
            productSizeId,
            quantity,
        } = item;

        if (
            !Number.isInteger(Number(productId)) ||
            Number(productId) <= 0 ||
            !Number.isInteger(Number(productSizeId)) ||
            Number(productSizeId) <= 0 ||
            !Number.isFinite(Number(quantity)) ||
            Number(quantity) <= 0
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "productId, productSizeId and valid quantity are required",
            });
        }
    }

    next();
};

module.exports = {
    validateSale,
};