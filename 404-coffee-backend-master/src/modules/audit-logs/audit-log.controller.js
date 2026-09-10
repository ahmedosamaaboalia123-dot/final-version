const auditLogService = require("./audit-log.service");

const { parsePagination } = require("../../utils/pagination");

// ============================================================
// Get audit logs
// ============================================================

const getAuditLogs = async (req, res, next) => {
    try {
        const { items, total } = await auditLogService.getAuditLogs(req.query);

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

// ============================================================
// Get audit log by ID
// ============================================================

const getAuditLogById = async (req, res, next) => {
    try {
        const log = await auditLogService.getAuditLogById(
            req.params.id
        );

        res.status(200).json({
            success: true,
            data: log,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAuditLogs,
    getAuditLogById,
};
