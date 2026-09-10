const jwt = require("jsonwebtoken");

const prisma = require("../lib/prisma");

const { jwtSecret } = require("../config/env");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization required",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token is required",
      });
    }

    // Step 1: Verify JWT signature, expiry, and type
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });

    if (decoded.type && decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    const userId = decoded.sub || decoded.userId;
    const sessionId = decoded.sessionId;

    // Steps 2-5: Single query — fetch session with user + device included.
    // AuthSession.id is the primary key (clustered index) so this is O(1).
    // If sessionId is absent (pre-Phase 2 tokens still within 24h expiry),
    // skip session enforcement — old tokens will expire naturally.
    if (sessionId) {
      const session = await prisma.authSession.findUnique({
        where: { id: sessionId },
        include: {
          user: { select: { id: true, role: true, status: true } },
          device: { select: { id: true, status: true } },
        },
      });

      // Step 3: Session not found or revoked → reject
      if (!session || session.revokedAt) {
        return res.status(401).json({
          success: false,
          message: "انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى",
          code: "SESSION_EXPIRED",
        });
      }

      // Step 4: User must still be ACTIVE
      if (!session.user || session.user.status !== "ACTIVE") {
        return res.status(401).json({
          success: false,
          message: "انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى",
          code: "SESSION_EXPIRED",
        });
      }

      const userRole = session.user.role;

      // Step 5: Non-admin roles — device must be APPROVED
      const isAdminOrManager = userRole === "OWNER" || userRole === "MANAGER";
      if (!isAdminOrManager && session.deviceId) {
        if (!session.device || session.device.status !== "APPROVED") {
          return res.status(403).json({
            success: false,
            message: "هذا الجهاز غير مصرح له بالوصول",
            code: "DEVICE_BLOCKED",
          });
        }
      }

      // Attach authenticated user to request
      req.user = {
        ...decoded,
        userId,
        role: userRole,
      };
    } else {
      // Backward compat: pre-Phase 2 token without sessionId.
      // Only check user exists and is ACTIVE; session enforcement skipped.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, status: true },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Account no longer exists",
        });
      }

      if (user.status !== "ACTIVE") {
        return res.status(403).json({
          success: false,
          message: "User account is suspended",
        });
      }

      req.user = {
        ...decoded,
        userId,
        role: user.role,
      };
    }

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    next(error);
  }
};

module.exports = authMiddleware;
