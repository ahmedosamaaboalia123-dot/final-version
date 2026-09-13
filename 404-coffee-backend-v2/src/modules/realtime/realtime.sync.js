import { ApiError } from '../../platform/http/api-error.js';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { OutboxEvent } from '../../platform/events/outbox-event.model.js';
import { hashToken } from '../../shared/utils/hash-token.js';
import { Order } from '../orders/order.models.js';
import { TableSession } from '../tables/tables.models.js';
import { TableOrderProposal } from '../table-experience/table-experience.models.js';
import { CustomerOrderCredential } from '../customer-experience/customer-experience.models.js';
import { resolveGuestSession } from '../table-experience/table-experience.middleware.js';
import { resolveAccessSession } from '../customer-experience/customer-experience.middleware.js';
import { isRoomAllowed, resolveEventRooms } from './realtime.rooms.js';
import { mapRealtimePayload } from './realtime.mapper.js';

const SYNC_FETCH_LIMIT = 101;
const SYNC_PAGE_SIZE = 100;
const MAX_ROOMS = 20;

function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => (error ? reject(error) : resolve()));
  });
}

export async function resolveSyncIdentity(req, d = {}, context = {}) {
  const models = context.syncModels ?? {};
  const header = req.get?.('authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      await runMiddleware(employeeAuth(d.config, d.authDependencies), req);
      if (req.auth?.actorType === 'EMPLOYEE')
        return {
          kind: 'employee',
          actorId: String(req.auth.actorId),
          permissions: [...(req.auth.permissions ?? [])]
        };
    } catch {
      // Fall through to public credentials below.
    }
  }
  const rooms = new Set();
  const orderToken = req.get?.('x-order-action-token') ?? req.get?.('x-tracking-read-token');
  if (orderToken) {
    const credentialModel = models.CustomerOrderCredential ?? CustomerOrderCredential;
    const credential = await credentialModel.findOne({
      $or: [
        { trackingReadTokenHash: hashToken(orderToken) },
        { orderActionTokenHash: hashToken(orderToken) }
      ]
    });
    if (credential && credential.status === 'ACTIVE') rooms.add(`order:${credential.orderId}`);
  }
  const tableToken = req.get?.('x-table-token');
  if (tableToken) {
    try {
      const guestResolver = context.guestResolver ?? resolveGuestSession;
      const session = await guestResolver(tableToken, context);
      rooms.add(`guest-session:${session._id}`);
      rooms.add(`table:${session.tableNumber}`);
    } catch {
      // Invalid guest tokens simply grant no rooms.
    }
  }
  const customerToken = req.get?.('x-customer-session');
  if (customerToken) {
    try {
      const accessResolver = context.accessResolver ?? resolveAccessSession;
      const session = await accessResolver(customerToken, context);
      rooms.add(`customer-session:${session._id}`);
      const orderModel = models.Order ?? Order;
      const orders = await orderModel
        .find({ customerId: session.customerId })
        .select({ _id: 1 })
        .limit(50)
        .lean();
      for (const order of orders) rooms.add(`order:${order._id}`);
    } catch {
      // Invalid customer sessions simply grant no rooms.
    }
  }
  if (rooms.size === 0)
    throw new ApiError({
      code: 'PUBLIC_SYNC_UNAUTHORIZED',
      status: 401,
      messageAr: 'بيانات المزامنة غير صالحة'
    });
  return { kind: 'public', rooms: [...rooms] };
}

function parseRooms(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  return [...new Set(list.map((room) => room.trim()).filter(Boolean))].slice(0, MAX_ROOMS);
}

async function snapshotForRoom(room, context, models) {
  if (room.startsWith('order:')) {
    const orderId = room.slice('order:'.length);
    const orderModel = models.Order ?? Order;
    const order = await orderModel.findById(orderId).lean();
    if (!order) return null;
    return {
      aggregateType: 'Order',
      aggregateId: String(order._id),
      currentSequence: order.eventSequence ?? 0,
      state: { status: order.status, paymentStatus: order.paymentStatus }
    };
  }
  if (room.startsWith('table:')) {
    const tableNumber = Number(room.slice('table:'.length));
    if (!Number.isInteger(tableNumber)) return null;
    const sessionModel = models.TableSession ?? TableSession;
    const session = await sessionModel
      .findOne({ tableNumber, status: { $in: ['OPEN', 'CLOSING'] } })
      .lean();
    if (!session) return null;
    return {
      aggregateType: 'TableSession',
      aggregateId: String(session._id),
      currentSequence: 0,
      state: { status: session.status, tableNumber }
    };
  }
  if (room.startsWith('guest-session:')) {
    const proposalModel = models.TableOrderProposal ?? TableOrderProposal;
    const proposals = await proposalModel
      .find({ guestSessionId: room.slice('guest-session:'.length) })
      .select({ _id: 1, status: 1 })
      .lean();
    if (proposals.length === 0) return null;
    return {
      aggregateType: 'TableOrderProposal',
      aggregateId: String(proposals[0]._id),
      currentSequence: 0,
      state: { openProposals: proposals.length }
    };
  }
  return null;
}

export async function syncAggregates(input = {}, identity, context = {}) {
  const models = context.syncModels ?? {};
  const rooms = parseRooms(input.rooms).filter((room) => isRoomAllowed(room, identity));
  const afterSequence = Number(input.afterSequence ?? 0);
  if (rooms.length === 0) return { snapshots: [], events: [], hasMore: false };
  const outboxModel = models.OutboxEvent ?? OutboxEvent;
  const candidates = await outboxModel
    .find({ status: { $ne: 'DEAD' } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(SYNC_FETCH_LIMIT)
    .lean();
  const requested = new Set(rooms);
  const events = [];
  for (const candidate of candidates) {
    const eventRooms = resolveEventRooms(candidate);
    if (!eventRooms.some((room) => requested.has(room))) continue;
    if (typeof candidate.sequence === 'number' && candidate.sequence <= afterSequence) continue;
    events.push(mapRealtimePayload(candidate));
    if (events.length >= SYNC_PAGE_SIZE) break;
  }
  const hasMore = candidates.length >= SYNC_FETCH_LIMIT && events.length >= SYNC_PAGE_SIZE;
  const snapshots = [];
  for (const room of rooms) {
    if (
      !room.startsWith('order:') &&
      !room.startsWith('table:') &&
      !room.startsWith('guest-session:')
    )
      continue;
    const snapshot = await snapshotForRoom(room, context, models);
    if (snapshot) snapshots.push(snapshot);
  }
  return { snapshots, events, hasMore };
}

export { SYNC_PAGE_SIZE, MAX_ROOMS };
