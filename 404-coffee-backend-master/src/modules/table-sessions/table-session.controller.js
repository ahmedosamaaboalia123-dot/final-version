const tableSessionService = require("./table-session.service");
const orderService = require("../orders/order.service");
const { logAudit } = require("../../utils/audit");
const { emitServiceRequestCreated, emitServiceRequestUpdated } = require("../../websocket/socket.events");

// ============================================================
// GET /api/table-sessions/:tableNumber/active-order
// ============================================================

const getActiveOrder = async (req, res, next) => {
    try {
        const order = await orderService.getActiveTableOrder(req.params.tableNumber);
        return res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// POST /api/table-sessions/:tableNumber/service-requests
// ============================================================

const createServiceRequest = async (req, res, next) => {
    try {
        const { tableNumber } = req.params;
        const { type, reason } = req.body;

        const request = await tableSessionService.createServiceRequest({
            tableNumber,
            type,
            reason,
        });

        await logAudit(req, "orders", "create_service_request", `Service request created for table ${tableNumber}`);

        emitServiceRequestCreated(request);

        return res.status(201).json({
            success: true,
            message: "Service request submitted",
            data: request,
        });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// GET /api/admin/service-requests
// ============================================================

const getServiceRequests = async (req, res, next) => {
    try {
        const { items, total } = await tableSessionService.getServiceRequests(req.query);
        return res.status(200).json({ success: true, data: items, total });
    } catch (error) {
        next(error);
    }
};

// ============================================================
// PATCH /api/admin/service-requests/:id/resolve
// ============================================================

const resolveServiceRequest = async (req, res, next) => {
    try {
        const updated = await tableSessionService.resolveServiceRequest(
            req.params.id,
            req.user?.userId
        );

        await logAudit(req, "orders", "resolve_service_request", `Service request ${req.params.id} resolved`);

        emitServiceRequestUpdated(updated);

        return res.status(200).json({
            success: true,
            message: "Service request resolved",
            data: updated,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getActiveOrder,
    createServiceRequest,
    getServiceRequests,
    resolveServiceRequest,
};
