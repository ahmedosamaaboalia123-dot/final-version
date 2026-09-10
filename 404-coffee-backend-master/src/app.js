/**
 * app.js — تجميع الـ Express app
 * الطلب: security → logging → parsing → routes → error handler
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { pinoHttp } = require("pino-http");
const path = require("path");

const logger = require("./lib/logger");
const { nodeEnv } = require("./config/env");

const errorHandler = require("./middlewares/error.middleware");

const authRoutes = require("./modules/auth/auth.routes");
const auditLogRoutes = require("./modules/audit-logs/audit-log.routes");
const deviceRoutes = require("./modules/devices/device.routes");
const { employeeDeviceRouter } = require("./modules/devices/device.routes");
const attendanceRoutes = require("./modules/attendance/attendance.routes");

const cashDrawerShiftRoutes = require("./modules/cash-drawer-shifts/cash-drawer-shift.routes");
const chatRoutes = require("./modules/chat/chat.routes");
const customerRoutes = require("./modules/customers/customer.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const delegateRoutes = require("./modules/delegates/delegate.routes");
const financialReportRoutes = require("./modules/financial-reports/financial-report.routes");
const orderRoutes = require("./modules/orders/order.routes");
const productRoutes = require("./modules/products/product.routes");
const purchaseRoutes = require("./modules/purchases/purchase.routes");
const rawMaterialRoutes = require("./modules/raw-materials/raw-material.routes");
const returnRoutes = require("./modules/returns/return.routes");
const reviewRoutes = require("./modules/reviews/review.routes");
const saleRoutes = require("./modules/sales/sale.routes");
const settingRoutes = require("./modules/settings/setting.routes");
const supplierRoutes = require("./modules/suppliers/supplier.routes");
const tableSessionRoutes = require("./modules/table-sessions/table-session.routes");
const tableSessionAdminRoutes = require("./modules/table-sessions/table-session-admin.routes");
const userRoutes = require("./modules/users/user.routes");
const warningRoutes = require("./modules/warnings/warning.routes");

const { swaggerUi, swaggerSpec } = require("./docs/swagger");

const app = express();

// ============================================================
// Security
// ============================================================
app.use(helmet());
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

// Rate limiting عام — حدود سخية (النظام شبه مغلق)، بيتعطل في الـ tests
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => nodeEnv === "test",
  })
);

// ============================================================
// Logging
// ============================================================
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/api/health",
    },
  })
);

// ============================================================
// Parsing
// ============================================================
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ============================================================
// Health
// ============================================================
app.get("/api/health/ready", async (req, res) => {
    try {
        const prisma = require("./lib/prisma");
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ success: true, data: { status: "ok", database: "connected", version: "1.0.0", uptime: process.uptime() } });
    } catch {
        res.status(503).json({ success: true, data: { status: "degraded", database: "disconnected" } });
    }
});

app.get("/api/health/live", (req, res) => {
    res.status(200).json({ success: true, data: { status: "ok", uptime: process.uptime() } });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "404 Coffee API is running",
  });
});

// ============================================================
// Static files (uploads)
// ============================================================
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ============================================================
// API Docs (Swagger)
// ============================================================
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/docs.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ============================================================
// Routes
// ============================================================
app.use("/api/auth", authRoutes);
app.use("/api/auth/devices", deviceRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/audit-logs", auditLogRoutes);

app.use("/api/cash-drawer-shifts", cashDrawerShiftRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/delegates", delegateRoutes);
app.use("/api/financial-reports", financialReportRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/raw-materials", rawMaterialRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/table-sessions", tableSessionRoutes);
app.use("/api/admin", tableSessionAdminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/employees/:id/devices", employeeDeviceRouter);
app.use("/api/warnings", warningRoutes);

// ============================================================
// Error handler (must be last)
// ============================================================
app.use(errorHandler);

module.exports = app;