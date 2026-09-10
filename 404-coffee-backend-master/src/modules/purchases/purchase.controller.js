const purchaseService = require("./purchase.service");
const { logAudit } = require("../../utils/audit");
const { parsePagination } = require("../../utils/pagination");

// Get all purchases
const getPurchases = async (req, res, next) => {
    try {
        const { items, total } = await purchaseService.getPurchases(req.query);
        const { page, pageSize } = parsePagination(req.query);

        res.status(200).json({
            success: true,
            data: items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        next(error);
    }
};

// Get purchase by ID
const getPurchaseById = async (req, res, next) => {
    try {
        const purchase =
            await purchaseService.getPurchaseById(req.params.id);

        res.status(200).json({
            success: true,
            data: purchase,
        });
    } catch (error) {
        next(error);
    }
};

// Create purchase
const createPurchase = async (req, res, next) => {
    try {
        const purchase =
            await purchaseService.createPurchase(req.body);


                // Record in audit log
                await logAudit(req, "purchases", "create_purchase", "Purchase created successfully");        res.status(201).json({
            success: true,
            message: "Purchase created successfully",
            data: purchase,
        });
    } catch (error) {
        next(error);
    }
};

// Update purchase
const updatePurchase = async (req, res, next) => {
    try {
        const purchase =
            await purchaseService.updatePurchase(
                req.params.id,
                req.body
            );


                // Record in audit log
                await logAudit(req, "purchases", "edit_purchase", "Purchase updated successfully");        res.status(200).json({
            success: true,
            message: "Purchase updated successfully",
            data: purchase,
        });
    } catch (error) {
        next(error);
    }
};

// Approve purchase
const approvePurchase = async (req, res, next) => {
    try {
        const purchase =
            await purchaseService.approvePurchase(
                req.params.id
            );


                // Record in audit log
                await logAudit(req, "purchases", "approve_purchase", "Purchase approved successfully");        res.status(200).json({
            success: true,
            message: "Purchase approved successfully",
            data: purchase,
        });
    } catch (error) {
        next(error);
    }
};

// Cancel purchase
const cancelPurchase = async (req, res, next) => {
    try {
        const purchase =
            await purchaseService.cancelPurchase(
                req.params.id
            );


                // Record in audit log
                await logAudit(req, "purchases", "cancel_purchase", "Purchase cancelled successfully");        res.status(200).json({
            success: true,
            message: "Purchase cancelled successfully",
            data: purchase,
        });
    } catch (error) {
        next(error);
    }
};

// Delete purchase
const deletePurchase = async (req, res, next) => {
    try {
        const purchase =
            await purchaseService.deletePurchase(
                req.params.id
            );


                // Record in audit log
                await logAudit(req, "purchases", "delete_purchase", "Purchase deleted successfully");        res.status(200).json({
            success: true,
            message: "Purchase deleted successfully",
            data: purchase,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPurchases,
    getPurchaseById,
    createPurchase,
    updatePurchase,
    approvePurchase,
    cancelPurchase,
    deletePurchase,
};
