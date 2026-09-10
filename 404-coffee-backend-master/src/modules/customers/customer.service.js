const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get all customers
// ============================================================

const getCustomers = async (reqQuery = {}) => {
    const { search } = reqQuery;
    const { skip, take } = parsePagination(reqQuery);

    const where = { isActive: true };

    if (search && search.trim()) {
        where.OR = [
            {
                name: {
                    contains: search.trim(),
                    mode: "insensitive",
                },
            },
            {
                phone: {
                    contains: search.trim(),
                    mode: "insensitive",
                },
            },
        ];
    }

    const [items, total] = await Promise.all([
        prisma.customer.findMany({
            where,
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take,
        }),
        prisma.customer.count({ where }),
    ]);
    return { items, total };
};

// ============================================================
// Get customer by ID
// ============================================================

const getCustomerById = async (id) => {
    const customerId = Number(id);

    if (!Number.isInteger(customerId) || customerId <= 0) {
        const error = new Error("Invalid customer ID");
        error.statusCode = 400;
        throw error;
    }

    const customer = await prisma.customer.findUnique({
        where: {
            id: customerId,
        },
    });

    if (!customer) {
        const error = new Error("Customer not found");
        error.statusCode = 404;
        throw error;
    }

    const [statsResult, lastOrder] = await Promise.all([
        prisma.order.aggregate({
            where: {
                customerId,
                status: { not: "CANCELLED" },
            },
            _count: { id: true },
            _sum: { total: true },
        }),
        prisma.order.findFirst({
            where: { customerId },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
        }),
    ]);

    return {
        ...customer,
        stats: {
            orders: statsResult._count.id,
            totalSpent: statsResult._sum.total || 0,
            lastOrderAt: lastOrder?.createdAt || null,
        },
    };
};

// ============================================================
// Create customer
// ============================================================

const createCustomer = async (data) => {
    const {
        name,
        phone,
        whatsapp,
        email,
        image,
        city,
        address,
        orderType,
        social,
        feedback,
        loyaltyPoints = 0,
        loyaltyLevel = "REGULAR",
        notes,
    } = data;

    if (!name || !name.trim()) {
        const error = new Error("Customer name is required");
        error.statusCode = 400;
        throw error;
    }

    if (!phone || !phone.trim()) {
        const error = new Error("Customer phone is required");
        error.statusCode = 400;
        throw error;
    }

    const existingCustomer = await prisma.customer.findUnique({
        where: {
            phone: phone.trim(),
        },
    });

    if (existingCustomer) {
        const error = new Error(
            "Customer with this phone number already exists"
        );
        error.statusCode = 409;
        throw error;
    }

    const parsedLoyaltyPoints = Number(loyaltyPoints);

    if (
        !Number.isInteger(parsedLoyaltyPoints) ||
        parsedLoyaltyPoints < 0
    ) {
        const error = new Error("Invalid loyalty points");
        error.statusCode = 400;
        throw error;
    }

    return prisma.customer.create({
        data: {
            name: name.trim(),
            phone: phone.trim(),
            whatsapp: whatsapp?.trim() || null,
            email: email?.trim() || null,
            image: image?.trim() || null,
            city: city?.trim() || null,
            address: address?.trim() || null,
            orderType: orderType?.trim() || null,
            social: social || null,
            feedback: feedback?.trim() || null,
            loyaltyPoints: parsedLoyaltyPoints,
            loyaltyLevel: loyaltyLevel?.trim() || "REGULAR",
            notes: notes?.trim() || null,
        },
    });
};

// ============================================================
// Update customer
// ============================================================

const updateCustomer = async (id, data) => {
    const customerId = Number(id);

    if (!Number.isInteger(customerId) || customerId <= 0) {
        const error = new Error("Invalid customer ID");
        error.statusCode = 400;
        throw error;
    }

    const existingCustomer = await prisma.customer.findUnique({
        where: {
            id: customerId,
        },
    });

    if (!existingCustomer) {
        const error = new Error("Customer not found");
        error.statusCode = 404;
        throw error;
    }

    const {
        name,
        phone,
        whatsapp,
        email,
        image,
        city,
        address,
        orderType,
        social,
        feedback,
        loyaltyPoints,
        loyaltyLevel,
        notes,
    } = data;

    if (name !== undefined && !name.trim()) {
        const error = new Error("Customer name cannot be empty");
        error.statusCode = 400;
        throw error;
    }

    if (phone !== undefined && !phone.trim()) {
        const error = new Error("Customer phone cannot be empty");
        error.statusCode = 400;
        throw error;
    }

    if (
        phone !== undefined &&
        phone.trim() !== existingCustomer.phone
    ) {
        const duplicate = await prisma.customer.findUnique({
            where: {
                phone: phone.trim(),
            },
        });

        if (duplicate && duplicate.id !== customerId) {
            const error = new Error(
                "Customer with this phone number already exists"
            );
            error.statusCode = 409;
            throw error;
        }
    }

    let parsedLoyaltyPoints;

    if (loyaltyPoints !== undefined) {
        parsedLoyaltyPoints = Number(loyaltyPoints);

        if (
            !Number.isInteger(parsedLoyaltyPoints) ||
            parsedLoyaltyPoints < 0
        ) {
            const error = new Error("Invalid loyalty points");
            error.statusCode = 400;
            throw error;
        }
    }

    return prisma.customer.update({
        where: {
            id: customerId,
        },

        data: {
            ...(name !== undefined && {
                name: name.trim(),
            }),

            ...(phone !== undefined && {
                phone: phone.trim(),
            }),

            ...(whatsapp !== undefined && {
                whatsapp: whatsapp?.trim() || null,
            }),

            ...(email !== undefined && {
                email: email?.trim() || null,
            }),

            ...(image !== undefined && {
                image: image?.trim() || null,
            }),

            ...(city !== undefined && {
                city: city?.trim() || null,
            }),

            ...(address !== undefined && {
                address: address?.trim() || null,
            }),

            ...(loyaltyPoints !== undefined && {
                loyaltyPoints: parsedLoyaltyPoints,
            }),

            ...(loyaltyLevel !== undefined && {
                loyaltyLevel: loyaltyLevel?.trim() || "REGULAR",
            }),

            ...(notes !== undefined && {
                notes: notes?.trim() || null,
            }),

            ...(orderType !== undefined && {
                orderType: orderType?.trim() || null,
            }),

            ...(social !== undefined && {
                social: social || null,
            }),

            ...(feedback !== undefined && {
                feedback: feedback?.trim() || null,
            }),
        },
    });
};

// ============================================================
// Delete customer
// ============================================================

const deleteCustomer = async (id) => {
    const customerId = Number(id);

    if (!Number.isInteger(customerId) || customerId <= 0) {
        const error = new Error("Invalid customer ID");
        error.statusCode = 400;
        throw error;
    }

    const existingCustomer = await prisma.customer.findUnique({
        where: {
            id: customerId,
        },
    });

    if (!existingCustomer) {
        const error = new Error("Customer not found");
        error.statusCode = 404;
        throw error;
    }

    if (!existingCustomer.isActive) {
        const error = new Error("Customer already deleted");
        error.statusCode = 404;
        throw error;
    }

    return prisma.customer.update({
        where: {
            id: customerId,
        },
        data: {
            isActive: false,
        },
    });
};

// ============================================================
// Get customer orders
// ============================================================

const getCustomerOrders = async (customerId, filters = {}) => {
    const id = Number(customerId);

    if (!Number.isInteger(id) || id <= 0) {
        const error = new Error("Invalid customer ID");
        error.statusCode = 400;
        throw error;
    }

    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
        const error = new Error("Customer not found");
        error.statusCode = 404;
        throw error;
    }

    const { skip, take } = parsePagination(filters);

    const where = { customerId: id };

    const [orders, total] = await Promise.all([
        prisma.order.findMany({
            where,
            include: {
                items: {
                    include: {
                        product: { select: { id: true, name: true } },
                        productSize: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take,
        }),
        prisma.order.count({ where }),
    ]);

    return { items: orders, total };
};

// ============================================================
// Lookup customer by phone
// ============================================================

const lookupCustomer = async (phone) => {
    if (!phone) {
        const error = new Error("Phone query parameter is required");
        error.statusCode = 400;
        throw error;
    }
    const customer = await prisma.customer.findUnique({ where: { phone: phone.trim() } });
    return customer || null;
};

// ============================================================
// Merge customers
// ============================================================

const mergeCustomers = async (primaryId, duplicateId) => {
    const pid = Number(primaryId);
    const did = Number(duplicateId);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(did) || did <= 0) {
        const error = new Error("Invalid customer IDs");
        error.statusCode = 400;
        throw error;
    }
    if (pid === did) {
        const error = new Error("Cannot merge a customer with itself");
        error.statusCode = 400;
        throw error;
    }
    const primary = await prisma.customer.findUnique({ where: { id: pid } });
    if (!primary) { const error = new Error("Primary customer not found"); error.statusCode = 404; throw error; }
    const duplicate = await prisma.customer.findUnique({ where: { id: did } });
    if (!duplicate) { const error = new Error("Duplicate customer not found"); error.statusCode = 404; throw error; }

    const result = await prisma.$transaction(async (tx) => {
        const movedOrders = await tx.order.updateMany({ where: { customerId: did }, data: { customerId: pid } });
        await tx.customer.delete({ where: { id: did } });
        return { customer: primary, movedOrders: movedOrders.count, deletedDuplicate: did };
    });

    return result;
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