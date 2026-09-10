const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const tableSessionController = require("./table-session.controller");

const router = express.Router();

router.use(authMiddleware);

// GET /api/table-sessions/:tableNumber/active-order
router.get(
    "/:tableNumber/active-order",
    tableSessionController.getActiveOrder
);

// POST /api/table-sessions/:tableNumber/service-requests
router.post(
    "/:tableNumber/service-requests",
    tableSessionController.createServiceRequest
);

module.exports = router;
