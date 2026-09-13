import { DateTime } from 'luxon';
import { add, toApiString } from '../../platform/database/decimal.js';
import { Order } from '../orders/order.models.js';
import { Table, TableSession } from '../tables/tables.models.js';
import { TableServiceRequest } from '../table-services/table-services.models.js';
import { DeliveryAssignment } from '../delivery/delivery.models.js';
import { Delegate } from '../delivery/delivery.models.js';
import { CashDrawerShift } from '../drawer/drawer.models.js';
import { DashboardDaily } from './dashboard.models.js';

export function cairoPeriod(date = new Date()) {
  return DateTime.fromJSDate(date).setZone('Africa/Cairo').toFormat('yyyy-MM-dd');
}

export function cairoDayRange(period) {
  const start = DateTime.fromFormat(period, 'yyyy-MM-dd', { zone: 'Africa/Cairo' }).startOf('day');
  return { start: start.toUTC().toJSDate(), end: start.plus({ days: 1 }).toUTC().toJSDate() };
}

export async function rebuildDashboardProjection(period, context = {}) {
  const models = context.dashboardModels ?? {
    Order,
    Table,
    TableSession,
    TableServiceRequest,
    DeliveryAssignment,
    Delegate,
    CashDrawerShift,
    DashboardDaily
  };
  const now = context.now ?? new Date();
  const { start, end } = cairoDayRange(period);
  const failedSources = [];
  const metrics = {};
  const count = async (source, query) => {
    try {
      return await models[source].countDocuments(query);
    } catch {
      failedSources.push(source);
      return null;
    }
  };
  const [confirmed, preparing, ready, outForDelivery, completedToday, completedDocs] =
    await Promise.all([
      count('Order', { status: 'CONFIRMED' }),
      count('Order', { status: 'PREPARING' }),
      count('Order', { status: 'READY' }),
      count('Order', { status: 'OUT_FOR_DELIVERY' }),
      count('Order', { status: 'COMPLETED', createdAt: { $gte: start, $lt: end } }),
      (async () => {
        try {
          return await models.Order.find({
            status: 'COMPLETED',
            createdAt: { $gte: start, $lt: end }
          })
            .select({ total: 1 })
            .lean();
        } catch {
          failedSources.push('Order');
          return null;
        }
      })()
    ]);
  metrics.orders = {
    confirmed,
    preparing,
    ready,
    outForDelivery,
    completedToday,
    netSales: completedDocs
      ? toApiString(completedDocs.reduce((sum, order) => add(sum, order.total), '0'))
      : null
  };
  const [tables, openSessions] = await Promise.all([
    (async () => {
      try {
        return await models.Table.find({}).select({ outOfService: 1 }).lean();
      } catch {
        failedSources.push('Table');
        return null;
      }
    })(),
    count('TableSession', { status: { $in: ['OPEN', 'CLOSING'] } })
  ]);
  metrics.tables = tables
    ? {
        total: tables.length,
        occupied: openSessions,
        outOfService: tables.filter((table) => table.outOfService).length,
        empty: tables.length - (openSessions ?? 0)
      }
    : { total: null, occupied: openSessions, outOfService: null, empty: null };
  const [openServices, highPriority, failedDeliveries, activeDelegates, openShifts] =
    await Promise.all([
      count('TableServiceRequest', { status: 'OPEN' }),
      count('TableServiceRequest', { status: 'OPEN', priority: 'HIGH' }),
      count('DeliveryAssignment', { status: 'FAILED' }),
      count('Delegate', { status: 'ACTIVE' }),
      count('CashDrawerShift', { status: { $in: ['OPEN', 'CLOSING'] } })
    ]);
  metrics.services = { open: openServices, highPriority: highPriority };
  metrics.deliveries = { failed: failedDeliveries };
  metrics.delegates = { active: activeDelegates };
  metrics.drawer = { openShifts };
  metrics.alerts = [
    ...(highPriority > 0
      ? [
          {
            type: 'HIGH_PRIORITY_SERVICES',
            message: 'طلبات خدمة عالية الأولوية',
            count: highPriority
          }
        ]
      : []),
    ...(failedDeliveries > 0
      ? [{ type: 'FAILED_DELIVERIES', message: 'توصيلات متعثرة', count: failedDeliveries }]
      : [])
  ];
  const uniqueFailed = [...new Set(failedSources)];
  const dataQuality = uniqueFailed.length > 0 ? 'ERROR' : 'COMPLETE';
  const sourceVersions = { orders: completedToday, generatedAt: now };
  const update = {
    metrics,
    sourceVersions,
    dataQuality,
    failedSources: uniqueFailed,
    generatedAt: now
  };
  const daily = await models.DashboardDaily.findOneAndUpdate(
    { period },
    { $set: update },
    { upsert: true, new: true }
  );
  return daily;
}
