const logger = require("../lib/logger");

const ORDER_CREATED = "order:created";
const ORDER_UPDATED = "order:updated";
const ORDER_ITEM_UPDATED = "order:item:updated";
const SERVICE_REQUEST_CREATED = "table-service:created";
const SERVICE_REQUEST_UPDATED = "table-service:updated";
const TABLE_SESSION_UPDATED = "table-session:updated";

const emitOrderCreated = (order) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    const payload = {
      event: ORDER_CREATED,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        channel: order.channel,
        fulfillmentType: order.fulfillmentType,
        status: order.status,
        itemCount: order.items ? order.items.length : 0,
        total: Number(order.total),
        createdAt: order.createdAt,
      },
    };

    // Emit to admin rooms
    io.to("orders").to("kitchen").to("preparation:branch:1").emit(ORDER_CREATED, payload);

    // Emit to specific order room (for customer tracking)
    if (order.id) {
      io.to(`order:${order.id}`).emit(ORDER_CREATED, payload);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to emit order:created");
  }
};

const emitOrderUpdated = (order) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    const payload = {
      event: ORDER_UPDATED,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        items: order.items || [],
        updatedAt: order.updatedAt,
      },
    };

    // Emit to admin rooms
    io.to("orders").to("kitchen").to("preparation:branch:1").emit(ORDER_UPDATED, payload);

    // Emit to specific order room
    if (order.id) {
      io.to(`order:${order.id}`).emit(ORDER_UPDATED, payload);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to emit order:updated");
  }
};

const emitOrderItemUpdated = ({ orderId, itemId, status, orderStatus, readyCount, totalItems }) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    const payload = {
      event: ORDER_ITEM_UPDATED,
      orderId,
      itemId,
      status,
      orderStatus,
      readyCount: readyCount || 0,
      totalItems: totalItems || 0,
      updatedAt: new Date().toISOString(),
    };

    // Emit to admin rooms
    io.to("orders").to("kitchen").emit(ORDER_ITEM_UPDATED, payload);

    // Emit to specific order room
    if (orderId) {
      io.to(`order:${orderId}`).emit(ORDER_ITEM_UPDATED, payload);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to emit order:item:updated");
  }
};

const emitServiceRequestCreated = (request) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    const payload = { event: SERVICE_REQUEST_CREATED, request };

    // Emit to admin and waiters rooms
    io.to("orders").to("waiters:branch:1").emit(SERVICE_REQUEST_CREATED, payload);
  } catch (error) {
    logger.error({ err: error }, "Failed to emit table-service:created");
  }
};

const emitServiceRequestUpdated = (request) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    const payload = { event: SERVICE_REQUEST_UPDATED, request };

    // Emit to admin and waiters rooms
    io.to("orders").to("waiters:branch:1").emit(SERVICE_REQUEST_UPDATED, payload);
  } catch (error) {
    logger.error({ err: error }, "Failed to emit table-service:updated");
  }
};

const emitTableSessionUpdated = (session) => {
  try {
    const io = require("./socket.server").getIO();
    if (!io) return;

    const payload = { event: TABLE_SESSION_UPDATED, session };

    // Emit to admin room
    io.to("orders").emit(TABLE_SESSION_UPDATED, payload);

    // Emit to specific table session room
    if (session.id) {
      io.to(`table-session:${session.id}`).emit(TABLE_SESSION_UPDATED, payload);
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to emit table-session:updated");
  }
};

const DASHBOARD_UPDATED = "dashboard:updated";
const INVENTORY_UPDATED = "inventory:updated";

const emitDashboardUpdated = (data) => {
    try {
        const io = require("./socket.server").getIO();
        if (!io) return;
        io.emit(DASHBOARD_UPDATED, { event: DASHBOARD_UPDATED, ...data, at: new Date().toISOString() });
    } catch (error) { logger.error({ err: error }, "Failed to emit dashboard:updated"); }
};

const emitInventoryUpdated = (data) => {
    try {
        const io = require("./socket.server").getIO();
        if (!io) return;
        io.emit(INVENTORY_UPDATED, { event: INVENTORY_UPDATED, ...data, at: new Date().toISOString() });
    } catch (error) { logger.error({ err: error }, "Failed to emit inventory:updated"); }
};

module.exports = {
  ORDER_CREATED,
  ORDER_UPDATED,
  ORDER_ITEM_UPDATED,
  SERVICE_REQUEST_CREATED,
  SERVICE_REQUEST_UPDATED,
  TABLE_SESSION_UPDATED,
  emitOrderCreated,
  emitOrderUpdated,
  emitOrderItemUpdated,
  emitServiceRequestCreated,
  emitServiceRequestUpdated,
  emitTableSessionUpdated,
  emitDashboardUpdated,
  emitInventoryUpdated,
};
