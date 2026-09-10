const customerService = require("./customer.service");
const { logAudit } = require("../../utils/audit");
const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get all customers
// ============================================================

const getCustomers = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await customerService.getCustomers(
            req.query
        );

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

// ============================================================
// Get customer by ID
// ============================================================

const getCustomerById = async (req, res, next) => {
    try {
        const customer =
            await customerService.getCustomerById(
                req.params.id
            );

        res.status(200).json({
            success: true,
            data: customer,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Create customer
// ============================================================

const createCustomer = async (req, res, next) => {
    try {
        const customer =
            await customerService.createCustomer(req.body);


                // Record in audit log
                await logAudit(req, "customers", "create_customer", "Customer created successfully");        res.status(201).json({
            success: true,
            message: "Customer created successfully",
            data: customer,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Update customer
// ============================================================

const updateCustomer = async (req, res, next) => {
    try {
        const customer =
            await customerService.updateCustomer(
                req.params.id,
                req.body
            );


                // Record in audit log
                await logAudit(req, "customers", "edit_customer", "Customer updated successfully");        res.status(200).json({
            success: true,
            message: "Customer updated successfully",
            data: customer,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Delete customer
// ============================================================

const deleteCustomer = async (req, res, next) => {
    try {
        const customer =
            await customerService.deleteCustomer(
                req.params.id
            );


                // Record in audit log
                await logAudit(req, "customers", "delete_customer", "Customer deleted successfully");        res.status(200).json({
            success: true,
            message: "Customer deleted successfully",
            data: customer,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// Get customer orders
// ============================================================

const getCustomerOrders = async (req, res, next) => {
    try {
        const { page, pageSize } = parsePagination(req.query);
        const { items, total } = await customerService.getCustomerOrders(
            req.params.id,
            req.query
        );

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

// ============================================================
// Lookup customer by phone
// ============================================================

const lookupCustomer = async (req, res, next) => {
    try {
        const customer = await customerService.lookupCustomer(req.query.phone);
        res.status(200).json({ success: true, data: customer });
    } catch (error) { next(error); }
};

// ============================================================
// Merge customers
// ============================================================

const mergeCustomers = async (req, res, next) => {
    try {
        const result = await customerService.mergeCustomers(req.params.id, req.body.duplicateCustomerId);
        await logAudit(req, "customers", "edit_customer", `Merged customer ${req.body.duplicateCustomerId} into ${req.params.id}`);
        res.status(200).json({ success: true, message: "Customers merged successfully", data: result });
    } catch (error) { next(error); }
};

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerOrders,
    lookupCustomer,
    mergeCustomers,
};