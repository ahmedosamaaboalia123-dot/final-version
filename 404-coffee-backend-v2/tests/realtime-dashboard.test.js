import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { syncQuery } from '../src/modules/realtime/realtime.validation.js';
import { isRoomAllowed, resolveEventRooms } from '../src/modules/realtime/realtime.rooms.js';
import { mapRealtimePayload } from '../src/modules/realtime/realtime.mapper.js';
import {
  clearRealtimeSubscribers,
  publishRealtimeEvent,
  subscribeRealtime
} from '../src/modules/realtime/realtime.publisher.js';
import { resolveSyncIdentity, syncAggregates } from '../src/modules/realtime/realtime.sync.js';
import {
  cairoPeriod,
  rebuildDashboardProjection
} from '../src/modules/dashboard/dashboard.service.js';
import { getDashboardScreen } from '../src/modules/dashboard/dashboard.queries.js';
import { hashToken } from '../src/shared/utils/hash-token.js';
import { toDecimal128 } from '../src/platform/database/decimal.js';

const id = () => new mongoose.Types.ObjectId();
const money = (value) => toDecimal128(value);
const outboxDoc = (overrides = {}) => ({
  _id: id(),
  aggregateType: 'Order',
  aggregateId: String(id()),
  eventType: 'order.updated',
  sequence: 18,
  createdAt: new Date('2026-09-11T10:00:00Z'),
  payloadSafe: {},
  ...overrides
});

describe('realtime rooms and sync', () => {
  it('validates sync cursors at the boundary', () => {
    expect(syncQuery.safeParse({ rooms: 'order:abc', afterSequence: 17 }).success).toBe(true);
    expect(syncQuery.safeParse({ rooms: '' }).success).toBe(false);
    expect(syncQuery.safeParse({ rooms: 'order:abc', afterSequence: -1 }).success).toBe(false);
  });
  it('maps commerce events to order and admin rooms', () => {
    const orderId = String(id());
    const rooms = resolveEventRooms(
      outboxDoc({
        aggregateType: 'OrderPayment',
        aggregateId: String(id()),
        payloadSafe: { orderId }
      })
    );
    expect(rooms).toContain(`order:${orderId}`);
    expect(rooms).toContain('admin:orders');
  });
  it('maps table events with their table number', () => {
    const rooms = resolveEventRooms(
      outboxDoc({
        aggregateType: 'TableServiceRequest',
        payloadSafe: { serviceRequestId: String(id()), type: 'WATER_REQUEST', tableNumber: 5 }
      })
    );
    expect(rooms).toContain('table:5');
    expect(rooms).toContain('admin:table-services');
  });
  it('falls back to aggregate rooms for backoffice aggregates', () => {
    const aggregateId = String(id());
    expect(resolveEventRooms(outboxDoc({ aggregateType: 'Supplier', aggregateId }))).toContain(
      `aggregate:Supplier:${aggregateId}`
    );
  });
  it('gates rooms by identity and permission', () => {
    const employee = { kind: 'employee', actorId: 'emp1', permissions: ['orders.read'] };
    expect(isRoomAllowed('admin:orders', employee)).toBe(true);
    expect(isRoomAllowed('admin:preparation', employee)).toBe(false);
    expect(isRoomAllowed('order:anything', employee)).toBe(true);
    expect(isRoomAllowed('employee:emp1', employee)).toBe(true);
    expect(isRoomAllowed('employee:other', employee)).toBe(false);
    expect(isRoomAllowed('aggregate:Supplier:x', employee)).toBe(false);
    const stocked = { ...employee, permissions: ['orders.read', 'suppliers.read'] };
    expect(isRoomAllowed('aggregate:Supplier:x', stocked)).toBe(true);
    const pub = { kind: 'public', rooms: ['order:abc'] };
    expect(isRoomAllowed('order:abc', pub)).toBe(true);
    expect(isRoomAllowed('order:other', pub)).toBe(false);
    expect(isRoomAllowed('admin:orders', pub)).toBe(false);
  });
  it('builds envelopes without leaking secrets', () => {
    const envelope = mapRealtimePayload(
      outboxDoc({ payloadSafe: { orderId: 'o1', password: 'x' } })
    );
    expect(envelope).toMatchObject({ type: 'order.updated', sequence: 18, requestId: null });
    expect(envelope.data.password).toBe('x');
    expect(envelope).not.toHaveProperty('payloadSafe');
  });
  it('fans published events out to subscribers', async () => {
    clearRealtimeSubscribers();
    const seen = [];
    const off = subscribeRealtime(async ({ rooms, envelope }) => {
      seen.push({ rooms, type: envelope.type });
    });
    const result = await publishRealtimeEvent(outboxDoc({ payloadSafe: { orderId: 'o1' } }));
    expect(result.rooms).toContain('admin:orders');
    expect(result.delivered).toBe(1);
    expect(seen).toHaveLength(1);
    off();
    await publishRealtimeEvent(outboxDoc({ payloadSafe: { orderId: 'o1' } }));
    expect(seen).toHaveLength(1);
    clearRealtimeSubscribers();
  });
  it('returns only requested and allowed rooms after the cursor', async () => {
    const wanted = String(id());
    const other = String(id());
    const rows = [
      outboxDoc({ aggregateId: wanted, sequence: 18, payloadSafe: { orderId: wanted } }),
      outboxDoc({ aggregateId: wanted, sequence: 16, payloadSafe: { orderId: wanted } }),
      outboxDoc({ aggregateId: other, sequence: 30, payloadSafe: { orderId: other } })
    ];
    const models = {
      OutboxEvent: {
        find: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) })
      },
      Order: { findById: () => ({ lean: async () => null }) }
    };
    const identity = { kind: 'employee', actorId: 'e1', permissions: ['orders.read'] };
    const result = await syncAggregates({ rooms: `order:${wanted}`, afterSequence: 17 }, identity, {
      syncModels: models
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].sequence).toBe(18);
    expect(result.hasMore).toBe(false);
  });
  it('hides admin rooms from under-permissioned staff', async () => {
    const rows = [outboxDoc({ payloadSafe: {} })];
    const models = {
      OutboxEvent: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }) }
    };
    const identity = { kind: 'employee', actorId: 'e1', permissions: [] };
    const result = await syncAggregates({ rooms: 'admin:orders', afterSequence: 0 }, identity, {
      syncModels: models
    });
    expect(result.events).toHaveLength(0);
    expect(result.snapshots).toHaveLength(0);
  });
  it('scopes public order tokens to their own room', async () => {
    const orderId = id();
    const raw = 'public-read-token-value-0123456789ab';
    const req = { get: (name) => (name === 'x-tracking-read-token' ? raw : undefined) };
    const identity = await resolveSyncIdentity(
      req,
      {},
      {
        syncModels: {
          CustomerOrderCredential: {
            findOne: async () => ({ orderId, status: 'ACTIVE' })
          }
        }
      }
    );
    expect(identity).toMatchObject({ kind: 'public', rooms: [`order:${orderId}`] });
    await expect(resolveSyncIdentity({ get: () => undefined }, {}, {})).rejects.toMatchObject({
      code: 'PUBLIC_SYNC_UNAUTHORIZED'
    });
    expect(hashToken(raw)).toBeDefined();
  });
  it('attaches order snapshots with their live sequence', async () => {
    const orderId = String(id());
    const order = { _id: orderId, status: 'READY', paymentStatus: 'PENDING', eventSequence: 9 };
    const models = {
      OutboxEvent: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) },
      Order: { findById: () => ({ lean: async () => order }) }
    };
    const identity = { kind: 'employee', actorId: 'e1', permissions: ['orders.read'] };
    const result = await syncAggregates({ rooms: `order:${orderId}`, afterSequence: 0 }, identity, {
      syncModels: models
    });
    expect(result.snapshots).toMatchObject([
      { aggregateType: 'Order', currentSequence: 9, state: { status: 'READY' } }
    ]);
  });
});

describe('dashboard screen', () => {
  const dashboardModels = (overrides = {}) => ({
    Order: {
      countDocuments: async () => 0,
      find: () => ({ select: () => ({ lean: async () => [] }) })
    },
    Table: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    TableSession: { countDocuments: async () => 0 },
    TableServiceRequest: { countDocuments: async () => 0 },
    DeliveryAssignment: { countDocuments: async () => 0 },
    Delegate: { countDocuments: async () => 0 },
    CashDrawerShift: { countDocuments: async () => 0 },
    DashboardDaily: {
      findOneAndUpdate: async (query, update) => ({ period: query.period, ...update.$set })
    },
    ...overrides
  });
  it('uses cairo business days for projection periods', () => {
    expect(cairoPeriod(new Date('2026-09-11T01:30:00+02:00'))).toBe('2026-09-11');
    expect(cairoPeriod(new Date('2026-09-10T23:30:00Z'))).toBe('2026-09-11');
  });
  it('rebuilds metrics from live read models', async () => {
    const daily = await rebuildDashboardProjection('2026-09-11', {
      now: new Date('2026-09-11T10:00:00Z'),
      dashboardModels: dashboardModels({
        Order: {
          countDocuments: async (query) => (query.status === 'READY' ? 2 : 0),
          find: () => ({
            select: () => ({
              lean: async () => [{ total: money('100') }, { total: money('50') }]
            })
          })
        },
        Table: {
          find: () => ({
            select: () => ({ lean: async () => [{ outOfService: false }, { outOfService: true }] })
          })
        },
        TableSession: { countDocuments: async () => 1 },
        TableServiceRequest: { countDocuments: async (query) => (query.priority ? 1 : 3) }
      })
    });
    expect(daily.metrics.orders).toMatchObject({ ready: 2, completedToday: 0, netSales: '150' });
    expect(daily.metrics.tables).toMatchObject({ total: 2, occupied: 1, outOfService: 1 });
    expect(daily.metrics.alerts).toHaveLength(1);
    expect(daily.dataQuality).toBe('COMPLETE');
  });
  it('flags partial sources instead of faking zeroes', async () => {
    const daily = await rebuildDashboardProjection('2026-09-11', {
      now: new Date('2026-09-11T10:00:00Z'),
      dashboardModels: dashboardModels({
        Order: {
          countDocuments: async () => {
            throw new Error('down');
          },
          find: () => {
            throw new Error('down');
          }
        }
      })
    });
    expect(daily.dataQuality).toBe('ERROR');
    expect(daily.failedSources).toContain('Order');
    expect(daily.metrics.orders.netSales).toBeNull();
  });
  it('serves fresh projections with comparison and a realtime cursor', async () => {
    const generatedAt = new Date('2026-09-11T10:00:30Z');
    const daily = {
      period: '2026-09-11',
      metrics: { orders: { netSales: '150', completedToday: 3 }, alerts: [] },
      sourceVersions: {},
      dataQuality: 'COMPLETE',
      failedSources: [],
      generatedAt
    };
    const models = {
      DashboardDaily: {
        findOne: (query) => ({
          lean: async () =>
            query.period === '2026-09-11'
              ? daily
              : { metrics: { orders: { netSales: '100', completedToday: 2 } } }
        })
      },
      OutboxEvent: {
        findOne: () => ({
          sort: () => ({ select: () => ({ lean: async () => ({ createdAt: generatedAt }) }) })
        })
      }
    };
    const screen = await getDashboardScreen(
      {},
      { now: new Date('2026-09-11T10:00:45Z'), dashboardModels: models }
    );
    expect(screen.comparison).toMatchObject({ netSales: '100' });
    expect(screen.realtime).toMatchObject({ lastEventAt: generatedAt });
    expect(screen.period).toBe('2026-09-11');
  });
});
