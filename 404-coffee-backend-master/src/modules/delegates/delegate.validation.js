const validateDelegate = (req, res, next) => {
    const {
        name,
        whatsapp,
        phone,
    } = req.body;

    if (!name || !whatsapp || !phone) {
        return res.status(400).json({
            success: false,
            message: "Name, WhatsApp and phone are required",
        });
    }

    next();
};


const validateDelegateStatus = (req, res, next) => {
    const { status, isActive } = req.body;

    // Accept NEW format: { isActive: boolean }
    if (isActive !== undefined) {
        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean",
            });
        }
        return next();
    }

    // Accept OLD format: { status: "AVAILABLE" | "UNAVAILABLE" }
    if (status !== undefined) {
        if (!["AVAILABLE", "UNAVAILABLE"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid delegate status. Must be AVAILABLE or UNAVAILABLE",
            });
        }
        return next();
    }

    return res.status(400).json({
        success: false,
        message: "Either isActive (boolean) or status (AVAILABLE/UNAVAILABLE) is required",
    });
};


module.exports = {
    validateDelegate,
    validateDelegateStatus,
};