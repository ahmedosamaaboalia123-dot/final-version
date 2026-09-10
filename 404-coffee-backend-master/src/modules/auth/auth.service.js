const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const jwt = require("jsonwebtoken");

const prisma = require("../../lib/prisma");
const { checkInToday } = require("../attendance/attendance.service");

const { jwtSecret, jwtRefreshSecret, jwtExpiresIn, jwtRefreshExpiresIn } = require("../../config/env");

// ============================================================
// Phase 2: Token signing + refresh token hashing
// ============================================================

const signAccessToken = (user, { sessionId = null, deviceId = null } = {}) =>
  jwt.sign(
    {
      sub: user.id,
      employeeId: user.id,
      roleId: user.role,
      sessionId,
      deviceId,
      type: "access",
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );

const signRefreshToken = (user, { sessionId = null, deviceId = null } = {}) =>
  jwt.sign(
    {
      sub: user.id,
      sessionId,
      deviceId,
      type: "refresh",
      jti: crypto.randomUUID(),
    },
    jwtRefreshSecret,
    { expiresIn: jwtRefreshExpiresIn }
  );

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const { getExpandedPermissions, PAGES } = require("../../config/roles.config");

const parseExpiresIn = (value) => {
  if (typeof value === "number") return value;
  const match = String(value).match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 3600;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return num * (multipliers[unit] || 3600);
};

// ============================================================
// Page metadata for frontend sidebar
// ============================================================

const PAGE_META = {
  dashboard: {
    page_name: "لوحة التحكم",
    page_key: "dashboard",
    icon: "layout-dashboard",
    path: "/dashboard",
  },
  sales: {
    page_name: "المبيعات",
    page_key: "sales",
    icon: "receipt",
    path: "/sales",
  },
  suppliers: {
    page_name: "الموردون",
    page_key: "suppliers",
    icon: "truck",
    path: "/suppliers",
  },
  products: {
    page_name: "المنتجات",
    page_key: "products",
    icon: "box",
    path: "/products",
  },
  returns: {
    page_name: "المرتجعات",
    page_key: "returns",
    icon: "rotate-ccw",
    path: "/returns",
  },
  inventory: {
    page_name: "المخزون",
    page_key: "inventory",
    icon: "warehouse",
    path: "/inventory",
  },
  purchases: {
    page_name: "المشتريات",
    page_key: "purchases",
    icon: "file-text",
    path: "/purchases",
  },
  customers: {
    page_name: "العملاء",
    page_key: "customers",
    icon: "users",
    path: "/customers",
  },
  delegates: {
    page_name: "المندوبين",
    page_key: "delegates",
    icon: "truck",
    path: "/delegates",
  },
  cash_drawer_shifts: {
    page_name: "الدرج والورديات",
    page_key: "drawer",
    icon: "wallet",
    path: "/drawer",
  },
  users: {
    page_name: "الموظفين",
    page_key: "employees",
    icon: "user",
    path: "/employees",
  },
  warnings: {
    page_name: "التحذيرات",
    page_key: "warnings",
    icon: "alert-triangle",
    path: "/warnings",
  },
  audit_log: {
    page_name: "سجل المراجعة",
    page_key: "audit_log",
    icon: "file-text",
    path: "/audit-log",
  },
  settings: {
    page_name: "الإعدادات",
    page_key: "settings",
    icon: "settings",
    path: "/settings",
  },
  financial_reports: {
    page_name: "التقارير المالية",
    page_key: "financial_reports",
    icon: "bar-chart",
    path: "/financial-reports",
  },
};

// ============================================================
// Action name mapping (RBAC action → frontend action)
// ============================================================

const ACTION_MAP = {
  view_users: "view",
  create_user: "create",
  edit_user: "update",
  change_user_status: "update",
  delete_user: "delete",
  view_sales_history: "view",
  create_invoice: "create",
  edit_invoice: "update",
  cancel_invoice: "update",
  view_purchases: "view",
  create_purchase: "create",
  edit_purchase: "update",
  approve_purchase: "update",
  cancel_purchase: "update",
  delete_purchase: "delete",
  view_customers: "view",
  create_customer: "create",
  edit_customer: "update",
  delete_customer: "delete",
  view_inventory: "view",
  create_material: "create",
  edit_material: "update",
  delete_material: "delete",
  add_batch: "create",
  view_suppliers: "view",
  create_supplier: "create",
  edit_supplier: "update",
  delete_supplier: "delete",
  view_products: "view",
  create_product: "create",
  edit_product: "update",
  delete_product: "delete",
  manage_types: "update",
  manage_sizes: "update",
  manage_addons: "update",
  manage_ingredients: "update",
  view_returns: "view",
  create_return: "create",
  edit_return: "update",
  delete_return: "delete",
  approve_return: "update",
  cancel_return: "update",
  view_delegates: "view",
  create_delegate: "create",
  edit_delegate: "update",
  change_delegate_status: "update",
  delete_delegate: "delete",
  view_orders: "view",
  create_order: "create",
  edit_order: "update",
  delete_order: "delete",
  view_shifts_report: "view",
  open_shift: "create",
  close_shift: "update",
  record_cash_in: "create",
  record_cash_out: "create",
  view_audit_log: "view",
  view_settings: "view",
  update_settings: "update",
  view_warnings: "view",
  view_sales_report: "view",
  view_profit_report: "view",
  view_treasury_report: "view",
  download_backup: "view",
};

// ============================================================
// Build permissions array for frontend
// ============================================================

const buildPermissions = (role) => {
  const expanded = getExpandedPermissions(role);
  const permissions = [];

  // Standalone pages
  const standalonePages = [
    "dashboard",
    "sales",
    "suppliers",
    "products",
    "returns",
    "inventory",
    "purchases",
    "customers",
    "delegates",
    "cash_drawer_shifts",
    "users",
    "warnings",
    "audit_log",
    "settings",
    "financial_reports",
  ];

  for (const pageKey of standalonePages) {
    if (expanded[pageKey] && expanded[pageKey].length > 0) {
      const meta = PAGE_META[pageKey];
      if (!meta) continue;

      const actions = expanded[pageKey].map(
        (a) => ACTION_MAP[a] || a
      );
      const uniqueActions = [...new Set(actions)];

      permissions.push({
        ...meta,
        actions: uniqueActions,
      });
    }
  }

  // Orders section group
  if (expanded.orders && expanded.orders.length > 0) {
    const orderActions = expanded.orders;
    const items = [];

    // Online orders page
    if (orderActions.includes("view_orders") || orderActions.includes("create_order")) {
      items.push({
        page_name: "الأونلاين",
        page_key: "orders_online",
        path: "/orders/online",
        actions: ["view"],
      });
    }

    // Table orders page
    if (orderActions.includes("view_orders") || orderActions.includes("create_order")) {
      items.push({
        page_name: "الطربيزات",
        page_key: "orders_tables",
        path: "/orders/tables",
        actions: ["view"],
      });
    }

    // Table services page
    if (orderActions.includes("view_orders")) {
      items.push({
        page_name: "خدمات الطربيزات",
        page_key: "orders_table_services",
        path: "/orders/table-services",
        actions: ["view"],
      });
    }

    // Orders history page
    if (orderActions.includes("view_orders")) {
      items.push({
        page_name: "سجل الطلبات",
        page_key: "orders_history",
        path: "/orders/history",
        actions: ["view"],
      });
    }

    if (items.length > 0) {
      permissions.push({
        section: "إنشاء الطلبات",
        items,
      });
    }

    // Preparation section
    if (orderActions.includes("view_orders") || orderActions.includes("edit_order")) {
      permissions.push({
        section: "تحضير الطلبات",
        items: [
          {
            page_name: "التحضير",
            page_key: "orders_preparation",
            path: "/orders/preparation",
            actions: orderActions.includes("edit_order")
              ? ["view", "update"]
              : ["view"],
          },
        ],
      });
    }
  }

  return permissions;
};

// ============================================================
// Build employee object from user
// ============================================================

const buildEmployee = (user) => ({
  id: user.id,
  employee_code: `EMP-${String(user.id).padStart(4, "0")}`,
  name: user.name,
  position: user.position,
  email: null,
  phone: null,
  department: null,
  status: user.status === "ACTIVE" ? "active" : "suspended",
  last_login: new Date().toISOString(),
  shift: {
    id: 1,
    name: "الوردية الصباحية",
    start_time: "08:00",
    end_time: "16:00",
    break_start: "12:00",
    break_end: "12:30",
  },
});

// ============================================================
// Build role object
// ============================================================

const ROLE_DISPLAY_NAMES = {
  OWNER: "المالك",
  MANAGER: "المدير",
  CASHIER: "كاشير",
  DELEGATE: "مندوب",
};

const ROLE_NAMES = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  DELEGATE: "Delegate",
};

const buildRole = (role) => ({
  id: role === "OWNER" ? 1 : role === "MANAGER" ? 2 : role === "CASHIER" ? 3 : 4,
  name: ROLE_NAMES[role] || role,
  display_name: ROLE_DISPLAY_NAMES[role] || role,
});

// ============================================================
// Login
// ============================================================

const loginUser = async ({ name, username, password, device }) => {
  const resolvedName = name || username;
  if (!resolvedName || !password) {
    const error = new Error("Name and password are required");
    error.statusCode = 400;
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: { name: resolvedName },
  });

  if (!user) {
    const error = new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== "ACTIVE") {
    const error = new Error("User account is suspended");
    error.statusCode = 403;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    const error = new Error("اسم المستخدم أو كلمة المرور غير صحيحة");
    error.statusCode = 401;
    throw error;
  }

  const isAdminOrManager = user.role === "OWNER" || user.role === "MANAGER";

  if (device && device.fingerprint) {
    const existingDevice = await prisma.employeeDevice.findUnique({
      where: { deviceFingerprint: device.fingerprint },
    });

    if (isAdminOrManager) {
      if (!existingDevice) {
        await prisma.employeeDevice.create({
          data: {
            userId: user.id,
            name: device.name || "Unknown Device",
            deviceFingerprint: device.fingerprint,
            deviceInfo: { userAgent: device.userAgent } || null,
            status: "APPROVED",
            approvedAt: new Date(),
          },
        });
      } else if (existingDevice.userId !== user.id) {
        await prisma.employeeDevice.update({
          where: { deviceFingerprint: device.fingerprint },
          data: { userId: user.id, status: "APPROVED", approvedAt: new Date() },
        });
      } else if (existingDevice.status !== "APPROVED") {
        await prisma.employeeDevice.update({
          where: { deviceFingerprint: device.fingerprint },
          data: { status: "APPROVED", approvedAt: new Date() },
        });
      }
    } else {
      if (!existingDevice) {
        const newDevice = await prisma.employeeDevice.create({
          data: {
            userId: user.id,
            name: device.name || "Unknown Device",
            deviceFingerprint: device.fingerprint,
            deviceInfo: { userAgent: device.userAgent } || null,
            status: "PENDING",
          },
        });

        return {
          pendingDeviceApproval: true,
          device: {
            id: newDevice.id,
            name: newDevice.name,
            status: newDevice.status,
            createdAt: newDevice.createdAt.toISOString(),
          },
        };
      }

      if (existingDevice.status === "PENDING") {
        return {
          pendingDeviceApproval: true,
          device: {
            id: existingDevice.id,
            name: existingDevice.name,
            status: existingDevice.status,
            createdAt: existingDevice.createdAt.toISOString(),
          },
        };
      }

      if (existingDevice.status === "REJECTED" || existingDevice.status === "BLOCKED" || existingDevice.status === "REVOKED") {
        const error = new Error("هذا الجهاز غير مصرح له بتسجيل الدخول");
        error.statusCode = 403;
        error.code = "DEVICE_BLOCKED";
        throw error;
      }
    }
  }

  // ============================================================
  // Phase 2: Session creation + attendance in a single transaction
  // ============================================================

  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + parseExpiresIn(jwtRefreshExpiresIn) * 1000);

  // Resolve deviceId from approved device (if any)
  let resolvedDeviceId = null;
  if (device && device.fingerprint) {
    const approvedDevice = await prisma.employeeDevice.findUnique({
      where: { deviceFingerprint: device.fingerprint },
      select: { id: true },
    });
    if (approvedDevice) resolvedDeviceId = approvedDevice.id;
  }

  // Sign tokens with real sessionId and deviceId
  const token = signAccessToken(user, { sessionId, deviceId: resolvedDeviceId });
  const refreshTokenValue = signRefreshToken(user, { sessionId, deviceId: resolvedDeviceId });
  const refreshTokenHashed = hashToken(refreshTokenValue);

  // Execute session + attendance in a single transaction
  const { attendance } = await prisma.$transaction(async (tx) => {
    // 1. Create AuthSession
    await tx.authSession.create({
      data: {
        id: sessionId,
        employeeId: user.id,
        deviceId: resolvedDeviceId,
        refreshTokenHash: refreshTokenHashed,
        expiresAt,
        revokedAt: null,
      },
    });

    // 2. Auto attendance check-in (idempotent via shared logic)
    const result = await checkInToday(user.id, {
      deviceFingerprint: device?.fingerprint || null,
      tx,
    });

    return result;
  });

  const role = buildRole(user.role);
  const permissions = buildPermissions(user.role);
  const expiresInSeconds = parseExpiresIn(jwtExpiresIn);
  const refreshExpiresInSeconds = parseExpiresIn(jwtRefreshExpiresIn);

  return {
    employee: {
      id: user.id,
      name: user.name,
      username: user.name,
      image: null,
    },
    role,
    permissions,
    notifications: [],
    shift: null,
    auth: {
      access_token: token,
      refresh_token: refreshTokenValue,
      token_type: "Bearer",
      expires_in: expiresInSeconds,
      refresh_expires_in: refreshExpiresInSeconds,
    },
  };
};

const getMe = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true, status: true },
    });
    if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    if (user.status !== "ACTIVE") {
        const error = new Error("User account is suspended");
        error.statusCode = 403;
        throw error;
    }

    const device = await prisma.employeeDevice.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
    });

    const role = buildRole(user.role);
    const permissions = buildPermissions(user.role);

    return {
        employee: {
            id: user.id,
            name: user.name,
            username: user.name,
            image: null,
        },
        role,
        permissions,
        notifications: [],
        shift: null,
        device: device ? { id: device.id, status: device.status } : null,
    };
};

const refreshToken = async (refreshTokenValue) => {
    if (!refreshTokenValue) {
        const error = new Error("Refresh token is required");
        error.statusCode = 400;
        throw error;
    }
    try {
        // Step 1-2: Verify JWT signature, expiry, and type
        const decoded = jwt.verify(refreshTokenValue, jwtRefreshSecret, { algorithms: ["HS256"] });
        if (decoded.type !== "refresh") {
            const error = new Error("Invalid refresh token");
            error.statusCode = 401;
            throw error;
        }

        const employeeId = decoded.sub || decoded.userId;
        const sessionId = decoded.sessionId;

        if (!sessionId) {
            const error = new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
            error.statusCode = 401;
            error.code = "SESSION_EXPIRED";
            throw error;
        }

        // Step 3: Fetch the AuthSession row
        const session = await prisma.authSession.findUnique({ where: { id: sessionId } });

        // Step 4: No session found → reject
        if (!session) {
            const error = new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
            error.statusCode = 401;
            error.code = "SESSION_EXPIRED";
            throw error;
        }

        // Step 5: Hash comparison — detect reuse of stale/rotated token
        const incomingHash = hashToken(refreshTokenValue);
        if (incomingHash !== session.refreshTokenHash) {
            // Token reuse detected — revoke the session FIRST, then reject.
            // Revoking before rejecting ensures that even the legitimately rotated
            // token (whose hash still matches the old DB hash) will fail on the
            // next request because session.revokedAt is now set.
            await prisma.authSession.update({
                where: { id: sessionId },
                data: { revokedAt: new Date() },
            });
            console.error(
                `[SECURITY] Refresh token reuse detected for session ${sessionId} (employee ${employeeId}). ` +
                `Session revoked. Possible token theft.`
            );
            const error = new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
            error.statusCode = 401;
            error.code = "SESSION_EXPIRED";
            throw error;
        }

        // Step 4b: Re-fetch session to check if it was revoked between
        // our initial fetch and the hash comparison (race condition defense).
        const currentSession = await prisma.authSession.findUnique({ where: { id: sessionId } });
        if (currentSession.revokedAt) {
            const error = new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
            error.statusCode = 401;
            error.code = "SESSION_EXPIRED";
            throw error;
        }

        // Step 6: Verify employee is still ACTIVE
        const user = await prisma.user.findUnique({ where: { id: employeeId } });
        if (!user || user.status !== "ACTIVE") {
            const error = new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
            error.statusCode = 401;
            error.code = "SESSION_EXPIRED";
            throw error;
        }

        // Step 7: For non-admin roles, verify linked device is still APPROVED
        const isAdminOrManager = user.role === "OWNER" || user.role === "MANAGER";
        if (!isAdminOrManager && session.deviceId) {
            const device = await prisma.employeeDevice.findUnique({
                where: { id: session.deviceId },
                select: { status: true },
            });
            if (!device || device.status !== "APPROVED") {
                const error = new Error("هذا الجهاز غير مصرح له بتسجيل الدخول");
                error.statusCode = 403;
                error.code = "DEVICE_BLOCKED";
                throw error;
            }
        }

        // Step 8-9: Generate new tokens (same sessionId/deviceId), then atomically
        // update the hash using a conditional WHERE to handle race conditions.
        // Only ONE concurrent request with the same old hash will succeed.
        const newAccessToken = signAccessToken(user, { sessionId, deviceId: session.deviceId });
        const newRefreshToken = signRefreshToken(user, { sessionId, deviceId: session.deviceId });
        const newRefreshHash = hashToken(newRefreshToken);

        // Atomic conditional update: WHERE id = sessionId AND refreshTokenHash = oldHash
        // If two requests race, only the first will match (rows affected = 1).
        const updateResult = await prisma.$executeRaw`
            UPDATE auth_sessions
            SET "refreshTokenHash" = ${newRefreshHash}
            WHERE id = ${sessionId}
              AND "refreshTokenHash" = ${incomingHash}
              AND "revokedAt" IS NULL
        `;

        if (updateResult === 0) {
            // The conditional update matched 0 rows — this means either:
            // (a) Another concurrent request already rotated the hash, or
            // (b) The session was revoked between our check and the update.
            // In both cases, revoke the session as a safety measure.
            await prisma.authSession.update({
                where: { id: sessionId },
                data: { revokedAt: new Date() },
            });
            console.error(
                `[SECURITY] Concurrent refresh race condition for session ${sessionId} (employee ${employeeId}). ` +
                `Session revoked as precaution.`
            );
            const error = new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
            error.statusCode = 401;
            error.code = "SESSION_EXPIRED";
            throw error;
        }

        const expiresInSeconds = parseExpiresIn(jwtExpiresIn);
        const refreshExpiresInSeconds = parseExpiresIn(jwtRefreshExpiresIn);
        return {
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_type: "Bearer",
            expires_in: expiresInSeconds,
            refresh_expires_in: refreshExpiresInSeconds,
        };
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            const e = new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
            e.statusCode = 401;
            e.code = "SESSION_EXPIRED";
            throw e;
        }
        throw error;
    }
};

const logoutUser = async (userId, refreshTokenValue, sessionId) => {
    // Phase 5: Revoke the specific session identified by sessionId.
    if (!sessionId) {
        return { loggedOut: true };
    }

    const session = await prisma.authSession.findUnique({ where: { id: sessionId } });
    if (!session) {
        return { loggedOut: true };
    }

    // If a refresh token was provided, verify it belongs to this session
    if (refreshTokenValue) {
        const incomingHash = hashToken(refreshTokenValue);
        if (session.refreshTokenHash !== incomingHash) {
            // Refresh token doesn't match this session — don't revoke wrong session
            return { loggedOut: true };
        }
    }

    await prisma.authSession.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
    });

    return { loggedOut: true };
};

const logoutAllDevices = async (userId) => {
    // Phase 5: Revoke ALL sessions for this employee across all devices.
    await prisma.authSession.updateMany({
        where: {
            employeeId: userId,
            revokedAt: null,
        },
        data: { revokedAt: new Date() },
    });

    return { loggedOut: true };
};

module.exports = {
  loginUser,
  getMe,
  refreshToken,
  logoutUser,
  logoutAllDevices,
};
