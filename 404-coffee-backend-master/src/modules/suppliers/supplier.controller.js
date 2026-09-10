const supplierService = require("./supplier.service");
const { logAudit } = require("../../utils/audit");
const { parsePagination } = require("../../utils/pagination");

// Get all suppliers

const getSuppliers = async (req, res, next) => {

    try {

        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await supplierService.getSuppliers(req.query);

        res.status(200).json({
            success: true,
            data: items,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        })

    } catch (error) {
        next(error);
    }
}


// Get supplier by ID 

const getSupplierById = async (req, res, next) => {
    try {

        const supplier = await supplierService.getSupplierById(
            req.params.id
        );

        res.status(200).json({
            success: true,
            data: supplier,
        })

    } catch (error) {
        next(error);
    }
}


// Create supplier

const createSupplier = async (req, res, next) => {
    try {
        const supplier = await supplierService.createSupplier(
            req.body
        );


                // Record in audit log
                await logAudit(req, "suppliers", "create_supplier", "Supplier created successfully");        res.status(201).json({
            success: true,
            message: "Supplier created successfully",
            data: supplier,
        });

    } catch(error) {
        next(error);
    }
}


// Update supplier

const updateSupplier = async (req, res, next) => {
    try {

        const supplier = await supplierService.updateSupplier(
            req.params.id,
            req.body,
        );


                // Record in audit log
                await logAudit(req, "suppliers", "edit_supplier", "Supplier updated successfully");        res.status(200).json({
            success: true,
            message: "Supplier updated successfully",
            data: supplier,
        })

    } catch(error) {
        next(error);
    }
}

// Delete supplier
const deleteSupplier = async (req, res, next) => {
    try {
        const supplier = await supplierService.deleteSupplier(
            req.params.id
        );


                // Record in audit log
                await logAudit(req, "suppliers", "delete_supplier", "Supplier deleted successfully");        res.status(200).json({
            success: true,
            message: "Supplier deleted successfully",
            data: supplier,
        });
    } catch (error) {
        next(error);
    }
};


// Get supplier options
const getSupplierOptions = async (req, res, next) => {
    try {
        const options = await supplierService.getSupplierOptions(req.query);
        res.status(200).json({ success: true, data: options });
    } catch (error) { next(error); }
};

// Get supplier transactions
const getSupplierTransactions = async (req, res, next) => {
    try {
        const { items, summary } = await supplierService.getSupplierTransactions(req.params.id, req.query);
        res.status(200).json({ success: true, data: items, summary });
    } catch (error) { next(error); }
};

// Create supplier transaction
const createTransaction = async (req, res, next) => {
    try {
        await supplierService.createTransaction(req.params.id, req.body);
        await logAudit(req, "suppliers", "create_transaction", "Transaction recorded");
        res.status(201).json({
            success: true,
            message: "تم تسجيل المعاملة بنجاح",
            data: {},
        });
    } catch (error) { next(error); }
};


module.exports = {
    getSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    getSupplierOptions,
    getSupplierTransactions,
    createTransaction,
};