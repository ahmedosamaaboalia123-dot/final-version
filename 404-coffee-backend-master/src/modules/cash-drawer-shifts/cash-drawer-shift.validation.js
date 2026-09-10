const IN_TYPES = ["SALES", "COLLECTION"];
const OUT_TYPES = ["EXPENSE", "SALARY", "MAINTENANCE", "PURCHASE", "INCENTIVE"];

const validateShiftOpening = (req, res, next) => {
    const { openingBalance } = req.body;

    if (
        openingBalance === undefined ||
        openingBalance === null ||
        openingBalance === "" ||
        Number(openingBalance) < 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Valid opening balance is required",
        });
    }

    next();
};

const validateShiftClosing = (req, res, next) => {
    const { actualBalance } = req.body;

    if (
        actualBalance === undefined ||
        actualBalance === null ||
        actualBalance === "" ||
        Number(actualBalance) < 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Valid actual balance is required",
        });
    }

    next();
};

const validateCashIn = (req, res, next) => {
    const { type, amount } = req.body;

    if (!IN_TYPES.includes(type)) {
        return res.status(400).json({
            success: false,
            message: `Valid cash-in type is required (${IN_TYPES.join(
                ", "
            )})`,
        });
    }

    if (
        amount === undefined ||
        amount === null ||
        amount === "" ||
        Number(amount) <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Valid amount is required",
        });
    }

    next();
};

const validateCashOut = (req, res, next) => {
    const { type, amount } = req.body;

    if (!OUT_TYPES.includes(type)) {
        return res.status(400).json({
            success: false,
            message: `Valid cash-out type is required (${OUT_TYPES.join(
                ", "
            )})`,
        });
    }

    if (
        amount === undefined ||
        amount === null ||
        amount === "" ||
        Number(amount) <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Valid amount is required",
        });
    }

    next();
};

module.exports = {
    validateShiftOpening,
    validateShiftClosing,
    validateCashIn,
    validateCashOut,
};
