const { Server } = require("socket.io");
const socketAuth = require("./socket.auth");
const logger = require("../lib/logger");

let io = null;

const BRANCH_ROOM = "admin:branch:1";
const ORDERS_ROOM = "orders";
const KITCHEN_ROOM = "kitchen";
const WAITERS_ROOM = "waiters:branch:1";
const PREPARATION_ROOM = "preparation:branch:1";

const initSocket = (httpServer) => {
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"];

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
    },
  });

  io.use(socketAuth);

  io.on("connection", (socket) => {
    const { authType } = socket.user;

    if (authType === "jwt") {
      // Admin/staff connections: join branch-level rooms
      socket.join(BRANCH_ROOM);
      socket.join(ORDERS_ROOM);
      socket.join(KITCHEN_ROOM);
      socket.join(WAITERS_ROOM);
      socket.join(PREPARATION_ROOM);

      logger.info(
        { userId: socket.user.userId, role: socket.user.role, socketId: socket.id },
        "Socket connected (admin)"
      );
    } else if (authType === "tracking") {
      // Customer/table tracking: join specific order or session room
      if (socket.user.orderId) {
        socket.join(`order:${socket.user.orderId}`);
        logger.info(
          { orderId: socket.user.orderId, socketId: socket.id },
          "Socket connected (order tracking)"
        );
      }
      if (socket.user.sessionId) {
        socket.join(`table-session:${socket.user.sessionId}`);
        logger.info(
          { sessionId: socket.user.sessionId, socketId: socket.id },
          "Socket connected (table session tracking)"
        );
      }
    }

    // Dynamic room join (for future use)
    socket.on("join-room", (roomName) => {
      if (typeof roomName === "string" && roomName.length < 200) {
        socket.join(roomName);
        logger.debug({ socketId: socket.id, room: roomName }, "Joined room");
      }
    });

    socket.on("leave-room", (roomName) => {
      if (typeof roomName === "string") {
        socket.leave(roomName);
        logger.debug({ socketId: socket.id, room: roomName }, "Left room");
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info(
        { socketId: socket.id, authType, reason },
        "Socket disconnected"
      );
    });
  });

  logger.info("WebSocket server initialized");

  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO, BRANCH_ROOM, WAITERS_ROOM, PREPARATION_ROOM };
