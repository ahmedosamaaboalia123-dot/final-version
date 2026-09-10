/**
 * controllers/raw-material.controller.js  — Controller المواد الخام
 * ================================================================================
 * الهدف: طبقة HTTP رفيعة (thin controller) - بتستقبل الـ request، بتنده الـ service 
 * المناسب، وبترجع الـ response. نفس نمط user.controller.js بالظبط.
 * 
 * getRawMaterials: يرجع كل المواد الخام (من غير pagination لسه - نفس الملاحظة اللي 
 * قلتها قبل كده على الـ service).
 * 
 * createRawMaterial: بياخد بيانات المادة من req.body ويبعتها زي ما هي لـ service، 
 * ويرجع 201 لو نجح.
 */

const rawMaterialService = require("./raw-material.service");
const { logAudit } = require("../../utils/audit");
const { parsePagination } = require("../../utils/pagination");
const { emitInventoryUpdated } = require("../../websocket/socket.events");

// Get all raw materials
const getRawMaterials = async (req, res, next) => {
    try {
        const { items, total, page, pageSize, totalPages } = await rawMaterialService.getRawMaterials(req.query);

        res.status(200).json({
            success: true,
            data: items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages,
            },
        });

    } catch (error) {
        next(error);
    }
};

// Get raw material by ID
const getRawMaterialById = async (req, res, next) => {
    try {
        const material = await rawMaterialService.getRawMaterialById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, message: "Raw material not found" });
        }
        res.status(200).json({ success: true, data: material });
    } catch (error) {
        next(error);
    }
};

// Create raw material
const createRawMaterial = async (req, res, next) => {
    try {
        const rawMaterial = await rawMaterialService.createRawMaterial(req.body);

                // Record in audit log
                await logAudit(req, "inventory", "create_raw_material", "Raw material created successfully");
        emitInventoryUpdated({ type: "create", materialId: rawMaterial.id });
        res.status(201).json({
            success: true,
            message: "تمت إضافة المادة بنجاح",
            data: {},
        });

    } catch (error) {
        next(error);
    }
};

// Update raw material
const updateRawMaterial = async (req, res, next) => {
    try {
        const rawMaterial = await rawMaterialService.updateRawMaterial(
            req.params.id,
            req.body
        );

                // Record in audit log
                await logAudit(req, "inventory", "edit_raw_material", "Raw material updated successfully");
        emitInventoryUpdated({ type: "update", materialId: rawMaterial.id });
        res.status(200).json({
            success: true,
            message: "تم تعديل المادة بنجاح",
            data: rawMaterial,
        });
    } catch (error) {
        next(error);
    }
};

// Delete raw material
const deleteRawMaterial = async (req, res, next) => {
    try {
        const rawMaterial = await rawMaterialService.deleteRawMaterial(
            req.params.id
        );

                // Record in audit log
                await logAudit(req, "inventory", "delete_raw_material", "Raw material deleted successfully");
        emitInventoryUpdated({ type: "delete", materialId: rawMaterial.id });
        res.status(200).json({
            success: true,
            message: "تم حذف المادة بنجاح",
            data: {},
        });
    } catch (error) {
        next(error);
    }
};


const addBatch = async (req, res, next) => {
    try {
        const batch =
            await rawMaterialService.addBatch(
                req.params.id,
                req.body
            );

                // Record in audit log
                await logAudit(req, "inventory", "add_batch", "Batch added successfully");
        emitInventoryUpdated({ type: "add_batch", materialId: Number(req.params.id), batchId: batch.id });
        res.status(201).json({
            success: true,
            message: "تمت إضافة الدفعة بنجاح",
            data: batch,
        });
    } catch (error) {
        next(error);
    }
};

const getMaterialBatches = async (
    req,
    res,
    next
) => {
    try {
        const batches =
            await rawMaterialService.getMaterialBatches(
                req.params.id
            );

        res.status(200).json({
            success: true,
            data: batches,
        });
    } catch (error) {
        next(error);
    }
};

const getRawMaterialsOptions = async (req, res, next) => {
    try {
        const options = await rawMaterialService.getRawMaterialsOptions();
        res.status(200).json({ success: true, data: options });
    } catch (error) {
        next(error);
    }
};

// Edit batch
const updateBatch = async (req, res, next) => {
    try {
        await rawMaterialService.updateBatch(
            req.params.id,
            req.params.batchId,
            req.body
        );
        await logAudit(req, "inventory", "edit_batch", "Batch updated successfully");
        emitInventoryUpdated({ type: "edit_batch", materialId: Number(req.params.id), batchId: Number(req.params.batchId) });
        res.status(200).json({
            success: true,
            message: "تم تعديل الدفعة بنجاح",
            data: {},
        });
    } catch (error) {
        next(error);
    }
};

// Delete batch
const deleteBatch = async (req, res, next) => {
    try {
        await rawMaterialService.deleteBatch(
            req.params.id,
            req.params.batchId
        );
        await logAudit(req, "inventory", "delete_batch", "Batch deleted successfully");
        emitInventoryUpdated({ type: "delete_batch", materialId: Number(req.params.id), batchId: Number(req.params.batchId) });
        res.status(200).json({
            success: true,
            message: "تم حذف الدفعة بنجاح",
        });
    } catch (error) {
        next(error);
    }
};

// Update batch withdrawal priorities
const updateBatchesPriority = async (req, res, next) => {
    try {
        const result = await rawMaterialService.updateBatchesPriority(
            req.params.id,
            req.body.batches
        );
        await logAudit(req, "inventory", "update_priority", "Batch priorities updated");
        emitInventoryUpdated({ type: "update_priority", materialId: Number(req.params.id) });
        res.status(200).json({
            success: true,
            message: "تم تحديث أولويات السحب",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

// Manual withdrawal from batch
const createWithdrawal = async (req, res, next) => {
    try {
        const result = await rawMaterialService.createWithdrawal(
            req.params.id,
            req.body,
            req.user?.id
        );
        await logAudit(req, "inventory", "withdrawal", "Withdrawal processed");
        emitInventoryUpdated({ type: "withdrawal", materialId: Number(req.params.id), batchId: result.batchId });
        res.status(201).json({
            success: true,
            message: "تم تنفيذ السحب بنجاح",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

// Withdrawal history
const getWithdrawals = async (req, res, next) => {
    try {
        const { items, total, page, pageSize, totalPages } = await rawMaterialService.getWithdrawals(req.query);
        res.status(200).json({
            success: true,
            data: items,
            pagination: { page, pageSize, total, totalPages },
        });
    } catch (error) {
        next(error);
    }
};

// Return options
const getReturnOptions = async (req, res, next) => {
    try {
        const data = await rawMaterialService.getReturnOptions();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getRawMaterials,
    getRawMaterialById,
    createRawMaterial,
    updateRawMaterial,
    deleteRawMaterial,
    addBatch,
    getMaterialBatches,
    getRawMaterialsOptions,
    updateBatch,
    deleteBatch,
    updateBatchesPriority,
    createWithdrawal,
    getWithdrawals,
    getReturnOptions,
};