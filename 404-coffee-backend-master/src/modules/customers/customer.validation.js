const validateCustomer = (req, res, next) => {
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Customer name is required",
        });
    }

    if (!phone || !phone.trim()) {
        return res.status(400).json({
            success: false,
            message: "Customer phone is required",
        });
    }

    next();
};

module.exports = {
    validateCustomer,
};