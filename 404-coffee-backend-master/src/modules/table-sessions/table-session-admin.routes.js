const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const tableSessionController = require("./table-session.controller");

const router = express.Router();

router.use(authMiddleware);

router.get(
    "/service-requests",
    requirePermission("orders", "view_orders"),
    tableSessionController.getServiceRequests
);

router.patch(
    "/service-requests/:id/resolve",
    requirePermission("orders", "edit_order"),
    tableSessionController.resolveServiceRequest
);

module.exports = router;
