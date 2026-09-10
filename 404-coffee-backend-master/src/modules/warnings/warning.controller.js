const warningService = require("./warning.service");

// ============================================================
// Get inventory warnings
// ============================================================

const getWarnings = async (req, res, next) => {
    try {
        const warnings = await warningService.getWarnings(req.query);

        res.status(200).json({
            success: true,
            data: warnings,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getWarnings,
};
