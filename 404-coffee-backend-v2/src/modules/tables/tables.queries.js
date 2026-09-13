import { toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Order, OrderItem } from '../orders/order.models.js';
import { Table, TableSession } from './tables.models.js';
import { sessionDto, tableDto } from './tables.mapper.js';
import { ensureDefaultTables } from './tables.service.js';

export async function getTablesBoard(context = {}) {
  const models = context.tablesModels ?? { Table, TableSession };
  const orderModels = context.tablesOrderModels ?? { Order, OrderItem };
  await ensureDefaultTables({ ...context, tablesModels: models });
  const tables = await models.Table.find({}).sort({ tableNumber: 1, _id: 1 }).lean();
  const activeTableIds = tables.filter((table) => !table.outOfService).map((table) => table._id);
  const sessions = await models.TableSession.find({
    tableId: { $in: activeTableIds },
    status: { $in: ['OPEN', 'CLOSING'] }
  }).lean();
  const sessionsByTable = new Map(sessions.map((session) => [String(session.tableId), session]));
  const orderIds = sessions.map((session) => session.activeOrderId).filter(Boolean);
  const [orders, items] = await Promise.all([
    orderIds.length ? orderModels.Order.find({ _id: { $in: orderIds } }).lean() : [],
    orderIds.length ? orderModels.OrderItem.find({ orderId: { $in: orderIds } }).lean() : []
  ]);
  const ordersById = new Map(orders.map((order) => [String(order._id), order]));
  const itemsByOrder = new Map();
  for (const item of items) {
    const key = String(item.orderId);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push(item);
  }
  const cards = tables.map((table) => {
    if (table.outOfService)
      return { ...tableDto(table), occupancy: 'OUT_OF_SERVICE', session: null, order: null };
    const session = sessionsByTable.get(String(table._id));
    if (!session) return { ...tableDto(table), occupancy: 'EMPTY', session: null, order: null };
    let order = null;
    if (session.activeOrderId) {
      const full = ordersById.get(String(session.activeOrderId));
      if (full) {
        const active = (itemsByOrder.get(String(full._id)) ?? []).filter(
          (item) => item.status !== 'CANCELLED'
        );
        order = {
          id: String(full._id),
          orderNumber: full.orderNumber,
          status: full.status,
          total: toApiString(full.total),
          progress: {
            ready: active.filter((item) => item.status === 'READY').length,
            total: active.length
          }
        };
      }
    }
    return { ...tableDto(table), occupancy: 'OCCUPIED', session: sessionDto(session), order };
  });
  const summary = {
    total: cards.length,
    empty: cards.filter((card) => card.occupancy === 'EMPTY').length,
    occupied: cards.filter((card) => card.occupancy === 'OCCUPIED').length,
    outOfService: cards.filter((card) => card.occupancy === 'OUT_OF_SERVICE').length
  };
  return { tables: cards, summary };
}

export async function getTableDetails(id, context = {}) {
  const models = context.tablesModels ?? { Table, TableSession };
  const orderModels = context.tablesOrderModels ?? { Order, OrderItem };
  const table = await models.Table.findById(id).lean();
  if (!table)
    throw new ApiError({ code: 'TABLE_NOT_FOUND', status: 404, messageAr: 'الطاولة غير موجودة' });
  const session = await models.TableSession.findOne({
    tableId: table._id,
    status: { $in: ['OPEN', 'CLOSING'] }
  }).lean();
  let order = null;
  if (session?.activeOrderId) {
    const full = await orderModels.Order.findById(session.activeOrderId).lean();
    if (full)
      order = {
        id: String(full._id),
        orderNumber: full.orderNumber,
        status: full.status,
        total: toApiString(full.total),
        balanceDue: toApiString(full.balanceDue)
      };
  }
  return {
    table: tableDto(table),
    occupancy: table.outOfService ? 'OUT_OF_SERVICE' : session ? 'OCCUPIED' : 'EMPTY',
    session: session ? sessionDto(session) : null,
    order
  };
}

export async function getSessionDetails(id, context = {}) {
  const models = context.tablesModels ?? { TableSession };
  const orderModels = context.tablesOrderModels ?? { Order, OrderItem };
  const session = await models.TableSession.findById(id).lean();
  if (!session)
    throw new ApiError({ code: 'SESSION_NOT_FOUND', status: 404, messageAr: 'الجلسة غير موجودة' });
  let order = null;
  let items = [];
  if (session.activeOrderId) {
    const full = await orderModels.Order.findById(session.activeOrderId).lean();
    if (full) {
      order = {
        id: String(full._id),
        orderNumber: full.orderNumber,
        status: full.status,
        total: toApiString(full.total),
        balanceDue: toApiString(full.balanceDue)
      };
      const rows = await orderModels.OrderItem.find({ orderId: full._id })
        .sort({ lineNo: 1, _id: 1 })
        .lean();
      items = rows
        .filter((item) => item.status !== 'CANCELLED')
        .map((item) => ({
          productName: item.productName,
          sizeName: item.sizeName,
          quantity: item.quantity,
          status: item.status
        }));
    }
  }
  return { session: sessionDto(session), order, items };
}

export async function getSessionPrintData(id, context = {}) {
  const details = await getSessionDetails(id, context);
  return {
    ...details,
    printedAt: context.now ?? new Date()
  };
}
