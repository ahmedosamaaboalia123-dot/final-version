const prisma = require("../lib/prisma");

// ============================================================
// Create audit log entry
// ============================================================

const createAuditLog = async ({
    userId,
    page,
    action,
    description,
    ipAddress,
}) => {
    try {
        await prisma.auditLog.create({
            data: {
                userId: userId || null,
                page,
                action,
                description: description || null,
                ipAddress: ipAddress || null,
            },
        });
    } catch (error) {
        // Audit logging should never break the main flow
        console.error("Failed to create audit log:", error);
    }
};

// ============================================================
// Convenience wrapper that pulls userId + ip from the request
// ============================================================

const logAudit = (req, page, action, description) => {
    const userId = req.user ? req.user.userId : null;

    return createAuditLog({
        userId,
        page,
        action,
        description,
        ipAddress: req.ip,
    });
};

module.exports = {
    createAuditLog,
    logAudit,
};
