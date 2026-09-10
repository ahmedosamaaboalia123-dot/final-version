const validatePurchase = (req, res, next) => {
    const {
        invoiceNo,
        supplierId,
        invoiceDate,
        items,
    } = req.body;

    if (!invoiceNo || !supplierId || !invoiceDate) {
        return res.status(400).json({
            success: false,
            message:
                "invoiceNo, supplierId and invoiceDate are required",
        });
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Purchase items are required",
        });
    }

    next();
};

module.exports = {
    validatePurchase,
};
