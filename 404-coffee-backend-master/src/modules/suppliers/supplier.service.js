const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// Get all suppliers
const getSuppliers = async (reqQuery = {}) => {
    const { skip, take } = parsePagination(reqQuery);

    const [items, total] = await Promise.all([
        prisma.supplier.findMany({
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take,
        }),
        prisma.supplier.count(),
    ]);
    return { items, total };
};


// Get supplier by ID
const getSupplierById = async (id) => {
    const supplier = await prisma.supplier.findUnique({
        where: {
            id: Number(id),
        },
        include: {
            rawMaterials: {
                select: { id: true, name: true, unit: true },
                orderBy: { name: "asc" },
            },
            purchases: {
                select: { total: true },
            },
            returns: {
                select: { totalValue: true },
            },
        },
    });

    if (!supplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    const totalOut = supplier.purchases.reduce((s, p) => s + Number(p.total), 0);
    const totalIn = supplier.returns.reduce((s, r) => s + Number(r.totalValue), 0);

    const { purchases, returns, ...rest } = supplier;

    return {
        ...rest,
        accountSummary: {
            debtBalance: totalOut,
            receivableBalance: totalIn,
            netBalance: totalOut - totalIn,
        },
    };
};


// Create supplier
const createSupplier = async ({
    name,
    contactPerson,
    phone,
    email,
    country,
    city,
    address,
    taxRegistrationNumber,
    supplierType,
    supplierCategory,
    paymentTerms,
    creditLimit,
    openingBalance,
    notes,
}) => {

    // Required fields
    if (
        !name ||
        !contactPerson ||
        !phone ||
        !city ||
        !supplierType ||
        !supplierCategory
    ) {
        const error = new Error("Required supplier data is missing");
        error.statusCode = 400;
        throw error;
    }

    // Check duplicate supplier
    const existingSupplier = await prisma.supplier.findFirst({
        where: {
            name,
        },
    });

    if (existingSupplier) {
        const error = new Error("Supplier already exists");
        error.statusCode = 409;
        throw error;
    }

    const supplier = await prisma.supplier.create({
        data: {
            name,
            contactPerson,
            phone,
            email: email || null,
            country: country || null,
            city,
            address: address || null,
            taxRegistrationNumber: taxRegistrationNumber || null,
            supplierType,
            supplierCategory,
            paymentTerms: paymentTerms || null,
            creditLimit: creditLimit ?? 0,
            openingBalance: openingBalance ?? 0,
            notes: notes || null,
        },
    });

    return supplier;
};


// Update supplier
const updateSupplier = async (id, data) => {
    const existingSupplier = await prisma.supplier.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingSupplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    const {
        name,
        contactPerson,
        phone,
        email,
        country,
        city,
        address,
        taxRegistrationNumber,
        supplierType,
        supplierCategory,
        paymentTerms,
        creditLimit,
        openingBalance,
        notes,
    } = data;

    // Prevent duplicate supplier name on rename
    if (name !== undefined) {
        const duplicate = await prisma.supplier.findFirst({
            where: {
                name,
                NOT: {
                    id: Number(id),
                },
            },
        });

        if (duplicate) {
            const error = new Error("Supplier name already exists");
            error.statusCode = 409;
            throw error;
        }
    }

    const updatedSupplier = await prisma.supplier.update({
        where: {
            id: Number(id),
        },
        data: {
            ...(name !== undefined && { name }),
            ...(contactPerson !== undefined && { contactPerson }),
            ...(phone !== undefined && { phone }),
            ...(email !== undefined && { email: email || null }),
            ...(country !== undefined && { country: country || null }),
            ...(city !== undefined && { city }),
            ...(address !== undefined && { address: address || null }),
            ...(taxRegistrationNumber !== undefined && {
                taxRegistrationNumber: taxRegistrationNumber || null,
            }),
            ...(supplierType !== undefined && { supplierType }),
            ...(supplierCategory !== undefined && { supplierCategory }),
            ...(paymentTerms !== undefined && {
                paymentTerms: paymentTerms || null,
            }),
            ...(creditLimit !== undefined && { creditLimit }),
            ...(openingBalance !== undefined && { openingBalance }),
            ...(notes !== undefined && { notes: notes || null }),
        },
    });

    return updatedSupplier;
};


// Delete supplier
const deleteSupplier = async (id) => {
    const existingSupplier = await prisma.supplier.findUnique({
        where: {
            id: Number(id),
        },
    });

    if (!existingSupplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    await prisma.supplier.delete({
        where: {
            id: Number(id),
        },
    });

    return existingSupplier;
};


// Get supplier options
const getSupplierOptions = async (query = {}) => {
    const where = {};
    if (query.search && query.search.trim()) {
        where.OR = [
            { name: { contains: query.search.trim(), mode: "insensitive" } },
            { phone: { contains: query.search.trim(), mode: "insensitive" } },
        ];
    }
    return prisma.supplier.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } });
};

// Get supplier transactions (purchases + returns + SupplierTransaction)
const getSupplierTransactions = async (supplierId, filters = {}) => {
    const id = Number(supplierId);
    if (!Number.isInteger(id) || id <= 0) { const error = new Error("Invalid supplier ID"); error.statusCode = 400; throw error; }
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) { const error = new Error("Supplier not found"); error.statusCode = 404; throw error; }
    const { skip, take } = parsePagination(filters);

    const txWhere = { supplierId: id };
    if (filters.from) {
        txWhere.transactionDate = { ...txWhere.transactionDate, gte: new Date(filters.from) };
    }
    if (filters.to) {
        txWhere.transactionDate = { ...txWhere.transactionDate, lte: new Date(filters.to) };
    }

    let transactions = await prisma.supplierTransaction.findMany({
        where: txWhere,
        orderBy: { transactionDate: "desc" },
    });

    if (filters.type) {
        transactions = transactions.filter((t) => t.type === filters.type);
    }

    const total = transactions.length;
    const pageTx = transactions.slice(skip, skip + take);

    const totalIn = transactions
        .filter((t) => t.category === "RECEIVABLE")
        .reduce((s, t) => s + Number(t.amount), 0);
    const totalOut = transactions
        .filter((t) => t.category === "DEBT")
        .reduce((s, t) => s + Number(t.amount), 0);

    const summary = { totalIn, totalOut, balance: totalOut - totalIn };
    return { items: pageTx, total, summary };
};

// Create supplier transaction
const createTransaction = async (supplierId, { type, category, amount, transactionDate, notes }) => {
    const id = Number(supplierId);
    if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("Invalid supplier ID");
        error.statusCode = 400;
        throw error;
    }

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
        const error = new Error("Supplier not found");
        error.statusCode = 404;
        throw error;
    }

    if (!type || !category || amount === undefined || !transactionDate) {
        const error = new Error("type, category, amount, and transactionDate are required");
        error.statusCode = 400;
        throw error;
    }

    const validTypes = ["DEBT", "RECEIVABLE", "PAYMENT"];
    if (!validTypes.includes(type)) {
        const error = new Error("Invalid type. Must be DEBT, RECEIVABLE, or PAYMENT");
        error.statusCode = 400;
        throw error;
    }

    const validCategories = ["DEBT", "RECEIVABLE"];
    if (!validCategories.includes(category)) {
        const error = new Error("Invalid category. Must be DEBT or RECEIVABLE");
        error.statusCode = 400;
        throw error;
    }

    if (Number(amount) <= 0) {
        const error = new Error("Amount must be positive");
        error.statusCode = 400;
        throw error;
    }

    const transaction = await prisma.supplierTransaction.create({
        data: {
            supplierId: id,
            type,
            category,
            amount: Number(amount),
            transactionDate: new Date(transactionDate),
            notes: notes || null,
        },
    });

    return transaction;
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