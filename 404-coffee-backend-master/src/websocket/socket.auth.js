const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { jwtSecret } = require("../config/env");
const logger = require("../lib/logger");

const socketAuth = async (socket, next) => {
  try {
    // Support both JWT (admin) and trackingToken (customer) authentication
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    const trackingToken = socket.handshake.auth?.trackingToken;

    // JWT authentication (admin/staff)
    if (token) {
      const decoded = jwt.verify(token, jwtSecret);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, role: true, status: true },
      });

      if (!user) {
        return next(new Error("Account no longer exists"));
      }

      if (user.status !== "ACTIVE") {
        return next(new Error("User account is suspended"));
      }

      socket.user = {
        userId: user.id,
        role: user.role,
        authType: "jwt",
      };

      return next();
    }

    // Tracking token authentication (customer/table)
    if (trackingToken) {
      // Find order by tracking token
      const order = await prisma.order.findFirst({
        where: { trackingToken },
        select: { id: true, orderNumber: true, table: true },
      });

      if (order) {
        socket.user = {
          authType: "tracking",
          trackingToken,
          orderId: order.id,
          orderNumber: order.orderNumber,
        };
        return next();
      }

      // Find table session by tracking token
      const session = await prisma.tableSession.findFirst({
        where: { trackingToken },
        select: { id: true, tableNumber: true },
      });

      if (session) {
        socket.user = {
          authType: "tracking",
          trackingToken,
          sessionId: session.id,
          tableNumber: session.tableNumber,
        };
        return next();
      }

      return next(new Error("Invalid tracking token"));
    }

    return next(new Error("Authentication required"));
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new Error("Token has expired"));
    }
    if (error.name === "JsonWebTokenError") {
      return next(new Error("Invalid token"));
    }

    logger.error({ err: error }, "Socket auth error");
    return next(new Error("Authentication failed"));
  }
};

module.exports = socketAuth;
