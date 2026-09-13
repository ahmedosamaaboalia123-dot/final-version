import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { add, compare, subtract, toApiString } from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { AuditEvent } from '../../platform/audit/audit-event.model.js';
import { Order } from '../orders/order.models.js';
import { OrderItem } from '../orders/order.models.js';
import { CashRefund, OrderPayment } from '../payments/payment.models.js';
import { CashDrawerShift, CashDrawerTransaction } from '../drawer/drawer.models.js';
import { InventoryMovement, RawMaterial, RawMaterialBatch } from '../inventory/inventory.models.js';
import { Supplier, SupplierAccount, SupplierAccountEntry } from '../suppliers/supplier.models.js';
import { Delegate, DeliveryAssignment } from '../delivery/delivery.models.js';
import { FinancialReportCache, ReportExport } from './reports.models.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const EXPORT_ROW_CAP = 500;
const EXPORT_TTL_DAYS = 7;

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
};

export function cairoToday(now = new Date()) {
  return DateTime.fromJSDate(now).setZone('Africa/Cairo').toFormat('yyyy-MM-dd');
}

export function resolveRange(filters = {}, now = new Date()) {
  const to = filters.to ?? cairoToday(now);
  const defaultFrom = DateTime.fromFormat(to, 'yyyy-MM-dd', { zone: 'Africa/Cairo' })
    .minus({ days: 29 })
    .toFormat('yyyy-MM-dd');
  const from = filters.from ?? defaultFrom;
  const start = DateTime.fromFormat(from, 'yyyy-MM-dd', { zone: 'Africa/Cairo' })
    .startOf('day')
    .toUTC()
    .toJSDate();
  const endExclusive = DateTime.fromFormat(to, 'yyyy-MM-dd', { zone: 'Africa/Cairo' })
    .plus({ days: 1 })
    .startOf('day')
    .toUTC()
    .toJSDate();
  const lengthDays =
    Math.round(
      (DateTime.fromFormat(to, 'yyyy-MM-dd').toMillis() -
        DateTime.fromFormat(from, 'yyyy-MM-dd').toMillis()) /
        86400000
    ) + 1;
  const prevTo = DateTime.fromFormat(from, 'yyyy-MM-dd', { zone: 'Africa/Cairo' })
    .minus({ days: 1 })
    .toFormat('yyyy-MM-dd');
  const prevFrom = DateTime.fromFormat(prevTo, 'yyyy-MM-dd', { zone: 'Africa/Cairo' })
    .minus({ days: lengthDays - 1 })
    .toFormat('yyyy-MM-dd');
  return { from, to, start, endExclusive, prevFrom, prevTo };
}

const sumMoney = (rows, pick) =>
  toApiString(rows.reduce((sum, row) => add(sum, pick(row) ?? '0'), '0'));

async function cachedReport(reportType, filters, build, context = {}) {
  const models = context.reportsModels ?? { FinancialReportCache };
  const now = context.now ?? new Date();
  const cacheKey = createHash('sha256')
    .update(`${reportType}:${stableStringify(filters)}`)
    .digest('hex');
  const hit = await models.FinancialReportCache.findOne({
    cacheKey,
    expiresAt: { $gt: now }
  }).lean();
  if (hit) return hit.payload;
  const payload = await build();
  await models.FinancialReportCache.findOneAndUpdate(
    { cacheKey },
    {
      $set: {
        reportType,
        payload,
        sourceVersions: payload.sourceVersions ?? {},
        generatedAt: payload.generatedAt,
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS)
      }
    },
    { upsert: true }
  );
  return payload;
}

function quality(failedSources) {
  const unique = [...new Set(failedSources)];
  return { dataQuality: unique.length > 0 ? 'ERROR' : 'COMPLETE', failedSources: unique };
}

export async function getFinancialReportScreen(filters = {}, context = {}) {
  const range = resolveRange(filters, context.now);
  return cachedReport(
    'financial-screen',
    { from: range.from, to: range.to, compare: filters.compare ?? 'previous_period' },
    async () => {
      const failedSources = [];
      const now = context.now ?? new Date();
      const safe = async (source, work, fallback = null) => {
        try {
          return await work();
        } catch {
          failedSources.push(source);
          return fallback;
        }
      };
      const sales = await safe('Order', () => buildSales(range, {}, context));
      const inventory = await safe('Inventory', () => buildInventory(range, {}, context));
      const drawer = await safe('Drawer', () => buildDrawer(range, {}, context));
      const suppliers = await safe('Supplier', () => buildSuppliers(range, {}, context));
      const delegates = await safe('Delegate', () => buildDelegates(range, {}, context));
      const refunds = await safe('Refund', () => buildRefunds(range, context), {
        pending: null,
        refunded: '0'
      });
      const payload = {
        period: { from: range.from, to: range.to },
        comparisonPeriod:
          (filters.compare ?? 'previous_period') === 'none'
            ? null
            : { from: range.prevFrom, to: range.prevTo },
        ...quality(failedSources),
        cards: {
          netSales: sales?.summary.netSales ?? null,
          cogs: sales?.summary.cogs ?? null,
          grossProfit: sales?.summary.grossProfit ?? null,
          cashIn: drawer?.summary.cashIn ?? null,
          cashOut: drawer?.summary.cashOut ?? null,
          inventoryValue: inventory?.summary.stockValue ?? null,
          supplierDebt: suppliers?.summary.debt ?? null,
          supplierReceivable: suppliers?.summary.receivable ?? null,
          delegateOutstanding: delegates?.summary.outstanding ?? null
        },
        charts: {
          salesTrend: sales?.trend ?? [],
          channelMix: sales?.breakdowns?.channelMix ?? []
        },
        topProducts: sales?.breakdowns?.topProducts ?? [],
        alerts: [
          ...(refunds?.pending > 0
            ? [{ type: 'PENDING_REFUNDS', message: 'مرتجعات نقدية معلقة', count: refunds.pending }]
            : []),
          ...(delegates?.summary.failedDeliveries > 0
            ? [
                {
                  type: 'FAILED_DELIVERIES',
                  message: 'توصيلات متعثرة',
                  count: delegates.summary.failedDeliveries
                }
              ]
            : [])
        ],
        sourceVersions: {
          orders: sales?.summary.orders ?? null,
          generatedAt: now
        },
        generatedAt: now
      };
      return payload;
    },
    context
  );
}

async function buildSales(range, extra, context) {
  const models = context.reportsModels ?? { Order, OrderItem, OrderPayment };
  const match = { status: 'COMPLETED', createdAt: { $gte: range.start, $lt: range.endExclusive } };
  if (extra.channel) match.channel = extra.channel;
  const orders = await models.Order.find(match)
    .select({ total: 1, actualInventoryCost: 1, channel: 1, createdAt: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const netSales = sumMoney(orders, (order) => order.total);
  const cogs = sumMoney(orders, (order) => order.actualInventoryCost);
  const grossProfit = toApiString(subtract(netSales, cogs));
  const refunded = sumMoney(
    await models.OrderPayment.find({
      status: { $in: ['PARTIALLY_REFUNDED', 'REFUNDED'] },
      createdAt: { $gte: range.start, $lt: range.endExclusive }
    })
      .select({ refundedAmount: 1 })
      .lean(),
    (payment) => payment.refundedAmount
  );
  const byDay = new Map();
  for (const order of orders) {
    const day = DateTime.fromJSDate(order.createdAt).setZone('Africa/Cairo').toFormat('yyyy-MM-dd');
    const row = byDay.get(day) ?? { date: day, orders: 0, total: '0' };
    row.orders += 1;
    row.total = toApiString(add(row.total, order.total));
    byDay.set(day, row);
  }
  const byChannel = new Map();
  for (const order of orders) {
    const row = byChannel.get(order.channel) ?? { channel: order.channel, orders: 0, total: '0' };
    row.orders += 1;
    row.total = toApiString(add(row.total, order.total));
    byChannel.set(order.channel, row);
  }
  const orderIds = orders.map((order) => order._id);
  const items =
    orderIds.length > 0
      ? await models.OrderItem.find({ orderId: { $in: orderIds } })
          .select({ productName: 1, sizeName: 1, quantity: 1, lineSubtotal: 1 })
          .lean()
      : [];
  const byProduct = new Map();
  for (const item of items) {
    const key = `${item.productName} ${item.sizeName}`;
    const row = byProduct.get(key) ?? {
      product: item.productName,
      size: item.sizeName,
      quantity: 0,
      total: '0'
    };
    row.quantity += item.quantity;
    row.total = toApiString(add(row.total, item.lineSubtotal));
    byProduct.set(key, row);
  }
  const topProducts = [...byProduct.values()].sort((a, b) => compare(b.total, a.total)).slice(0, 5);
  return {
    summary: { netSales, cogs, grossProfit, refunded, orders: orders.length },
    trend: [...byDay.values()],
    breakdowns: { channelMix: [...byChannel.values()], topProducts }
  };
}

async function buildInventory(range, extra, context) {
  const models = context.reportsModels ?? { RawMaterial, RawMaterialBatch, InventoryMovement };
  const [batches, materials, movements] = await Promise.all([
    models.RawMaterialBatch.find({})
      .select({ materialId: 1, remainingInventoryValue: 1, remainingQuantitySmall: 1, expiryOn: 1 })
      .lean(),
    models.RawMaterial.find({}).select({ name: 1, expiryAlertDays: 1 }).lean(),
    models.InventoryMovement.find({ occurredOn: { $gte: range.from, $lte: range.to } })
      .select({ kind: 1, inventoryValue: 1, materialId: 1, occurredOn: 1 })
      .sort({ recordedAt: -1, _id: -1 })
      .lean()
  ]);
  const materialById = new Map(materials.map((material) => [String(material._id), material]));
  const today = cairoToday(context.now);
  let expiring = 0;
  let expired = 0;
  const expiringRows = [];
  const valueByMaterial = new Map();
  for (const batch of batches) {
    const material = materialById.get(String(batch.materialId));
    const value = toApiString(batch.remainingInventoryValue ?? '0');
    const row = valueByMaterial.get(String(batch.materialId)) ?? {
      materialId: String(batch.materialId),
      materialName: material?.name ?? null,
      value: '0'
    };
    row.value = toApiString(add(row.value, value));
    valueByMaterial.set(String(batch.materialId), row);
    if (!batch.expiryOn || compare(batch.remainingQuantitySmall ?? '0', '0') <= 0) continue;
    const alertDays = material?.expiryAlertDays ?? 0;
    if (batch.expiryOn < today) {
      expired += 1;
    } else if (
      batch.expiryOn <=
      DateTime.fromFormat(today, 'yyyy-MM-dd').plus({ days: alertDays }).toFormat('yyyy-MM-dd')
    ) {
      expiring += 1;
      if (expiringRows.length < 10)
        expiringRows.push({
          materialId: String(batch.materialId),
          expiryOn: batch.expiryOn,
          value
        });
    }
  }
  const withdrawalValue = sumMoney(
    movements.filter((movement) => movement.kind === 'WITHDRAWAL'),
    (movement) => movement.inventoryValue
  );
  return {
    summary: {
      stockValue: sumMoney(batches, (batch) => batch.remainingInventoryValue),
      batchCount: batches.length,
      expiringBatches: expiring,
      expiredBatches: expired,
      withdrawalValue
    },
    movements,
    breakdowns: {
      valueByMaterial: [...valueByMaterial.values()]
        .sort((a, b) => compare(b.value, a.value))
        .slice(0, 5),
      expiring: expiringRows
    }
  };
}

async function buildDrawer(range, extra, context) {
  const models = context.reportsModels ?? { CashDrawerTransaction, CashDrawerShift };
  const [transactions, openShifts] = await Promise.all([
    models.CashDrawerTransaction.find({
      recordedAt: { $gte: range.start, $lt: range.endExclusive }
    })
      .select({ direction: 1, amount: 1, accountingClass: 1, recordedAt: 1, shiftId: 1 })
      .sort({ recordedAt: -1, _id: -1 })
      .lean(),
    models.CashDrawerShift.countDocuments({ status: { $in: ['OPEN', 'CLOSING'] } })
  ]);
  const inbound = transactions.filter((row) => row.direction === 'IN');
  const outbound = transactions.filter((row) => row.direction === 'OUT');
  const byClass = new Map();
  for (const row of transactions) {
    const entry = byClass.get(row.accountingClass) ?? {
      accountingClass: row.accountingClass,
      in: '0',
      out: '0'
    };
    if (row.direction === 'IN') entry.in = toApiString(add(entry.in, row.amount));
    else entry.out = toApiString(add(entry.out, row.amount));
    byClass.set(row.accountingClass, entry);
  }
  return {
    summary: {
      cashIn: sumMoney(inbound, (row) => row.amount),
      cashOut: sumMoney(outbound, (row) => row.amount),
      net: toApiString(
        subtract(
          sumMoney(inbound, (row) => row.amount),
          sumMoney(outbound, (row) => row.amount)
        )
      ),
      openShifts,
      transactions: transactions.length
    },
    transactions,
    breakdowns: { byAccountingClass: [...byClass.values()] }
  };
}

async function buildSuppliers(range, extra, context) {
  const models = context.reportsModels ?? { Supplier, SupplierAccount, SupplierAccountEntry };
  const supplierQuery = extra.supplierId ? { _id: extra.supplierId } : {};
  const [suppliers, accounts, entries] = await Promise.all([
    models.Supplier.find(supplierQuery).select({ name: 1, status: 1 }).lean(),
    models.SupplierAccount.find(extra.supplierId ? { supplierId: extra.supplierId } : {})
      .select({ supplierId: 1, debtBalance: 1, receivableBalance: 1 })
      .lean(),
    models.SupplierAccountEntry.find({ occurredOn: { $gte: range.from, $lte: range.to } })
      .select({ supplierId: 1, kind: 1, amount: 1, occurredOn: 1 })
      .sort({ occurredOn: -1, _id: -1 })
      .limit(50)
      .lean()
  ]);
  const nameById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier.name]));
  const rows = accounts.map((account) => ({
    supplierId: String(account.supplierId),
    supplierName: nameById.get(String(account.supplierId)) ?? null,
    debtBalance: toApiString(account.debtBalance ?? '0'),
    receivableBalance: toApiString(account.receivableBalance ?? '0')
  }));
  return {
    summary: {
      debt: sumMoney(accounts, (account) => account.debtBalance),
      receivable: sumMoney(accounts, (account) => account.receivableBalance),
      suppliers: suppliers.length
    },
    accounts: rows,
    breakdowns: {
      topDebtors: [...rows]
        .sort((a, b) => Number(b.debtBalance) - Number(a.debtBalance))
        .slice(0, 5),
      recentEntries: entries.map((entry) => ({
        supplierId: String(entry.supplierId),
        kind: entry.kind,
        amount: toApiString(entry.amount),
        occurredOn: entry.occurredOn
      }))
    }
  };
}

async function buildDelegates(range, extra, context) {
  const models = context.reportsModels ?? { Delegate, DeliveryAssignment };
  const assignmentQuery = extra.delegateId ? { delegateId: extra.delegateId } : {};
  const [assignments, delegates] = await Promise.all([
    models.DeliveryAssignment.find(assignmentQuery)
      .select({ delegateId: 1, status: 1, cashExpected: 1, cashSettledTotal: 1, updatedAt: 1 })
      .sort({ updatedAt: -1, _id: -1 })
      .lean(),
    models.Delegate.find(extra.delegateId ? { _id: extra.delegateId } : {})
      .select({ name: 1, status: 1 })
      .lean()
  ]);
  const active = assignments.filter((row) => ['ASSIGNED', 'IN_PROGRESS'].includes(row.status));
  const outstanding = toApiString(
    active.reduce(
      (sum, row) =>
        add(
          sum,
          subtract(toApiString(row.cashExpected ?? '0'), toApiString(row.cashSettledTotal ?? '0'))
        ),
      '0'
    )
  );
  const settled = toApiString(
    assignments
      .filter(
        (row) =>
          row.status === 'DELIVERED' &&
          row.updatedAt >= range.start &&
          row.updatedAt < range.endExclusive
      )
      .reduce((sum, row) => add(sum, row.cashSettledTotal ?? '0'), '0')
  );
  const nameById = new Map(delegates.map((delegate) => [String(delegate._id), delegate.name]));
  const perDelegate = new Map();
  for (const row of assignments) {
    const entry = perDelegate.get(String(row.delegateId)) ?? {
      delegateId: String(row.delegateId),
      delegateName: nameById.get(String(row.delegateId)) ?? null,
      outstanding: '0',
      settled: '0'
    };
    if (['ASSIGNED', 'IN_PROGRESS'].includes(row.status))
      entry.outstanding = toApiString(
        add(
          entry.outstanding,
          subtract(toApiString(row.cashExpected ?? '0'), toApiString(row.cashSettledTotal ?? '0'))
        )
      );
    if (row.status === 'DELIVERED')
      entry.settled = toApiString(add(entry.settled, row.cashSettledTotal ?? '0'));
    perDelegate.set(String(row.delegateId), entry);
  }
  return {
    summary: {
      outstanding,
      settled,
      activeDelegates: delegates.filter((delegate) => delegate.status === 'ACTIVE').length,
      failedDeliveries: assignments.filter((row) => row.status === 'FAILED').length,
      assignments: assignments.length
    },
    assignments: assignments.slice(0, 200).map((row) => ({
      id: String(row._id),
      delegateId: String(row.delegateId),
      status: row.status,
      cashExpected: toApiString(row.cashExpected ?? '0'),
      cashSettledTotal: toApiString(row.cashSettledTotal ?? '0')
    })),
    breakdowns: { perDelegate: [...perDelegate.values()] }
  };
}

async function buildRefunds(range, context) {
  const models = context.reportsModels ?? { CashRefund };
  const pending = await models.CashRefund.countDocuments({ status: 'PENDING_CASH_REFUND' });
  const completed = await models.CashRefund.find({
    status: 'COMPLETED',
    completedAt: { $gte: range.start, $lt: range.endExclusive }
  })
    .select({ amount: 1 })
    .lean();
  return { pending, refunded: sumMoney(completed, (row) => row.amount) };
}

function paginate(items, filters, sort = {}) {
  if (filters.exportAll) {
    return {
      items: items.slice(0, EXPORT_ROW_CAP),
      pageMeta: buildPageMeta({ page: 1, limit: EXPORT_ROW_CAP, totalItems: items.length, sort })
    };
  }
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  return {
    items: items.slice(skip, skip + limit),
    pageMeta: buildPageMeta({ page, limit, totalItems: items.length, sort })
  };
}

export async function getSalesReport(filters = {}, context = {}) {
  const range = resolveRange(filters, context.now);
  return cachedReport(
    'sales',
    { from: range.from, to: range.to, channel: filters.channel ?? null },
    async () => {
      const failedSources = [];
      let built = null;
      try {
        built = await buildSales(range, { channel: filters.channel }, context);
      } catch {
        failedSources.push('Order');
      }
      const now = context.now ?? new Date();
      return {
        summary: built
          ? {
              netSales: built.summary.netSales,
              cogs: built.summary.cogs,
              grossProfit: built.summary.grossProfit,
              refunded: built.summary.refunded,
              orders: built.summary.orders
            }
          : { netSales: null, cogs: null, grossProfit: null, refunded: null, orders: null },
        ...paginate(built?.trend ?? [], filters),
        breakdowns: built?.breakdowns ?? { channelMix: [], topProducts: [] },
        ...quality(failedSources),
        sourceVersions: { orders: built?.summary.orders ?? null },
        generatedAt: now
      };
    },
    context
  );
}

export async function getInventoryReport(filters = {}, context = {}) {
  const range = resolveRange(filters, context.now);
  return cachedReport(
    'inventory',
    { from: range.from, to: range.to },
    async () => {
      const failedSources = [];
      let built = null;
      try {
        built = await buildInventory(range, {}, context);
      } catch {
        failedSources.push('Inventory');
      }
      const now = context.now ?? new Date();
      return {
        summary: built?.summary ?? {
          stockValue: null,
          batchCount: null,
          expiringBatches: null,
          expiredBatches: null,
          withdrawalValue: null
        },
        ...(filters.exportAll
          ? { items: (built?.movements ?? []).slice(0, EXPORT_ROW_CAP) }
          : paginate(
              (built?.movements ?? []).map((movement) => ({
                materialId: String(movement.materialId),
                kind: movement.kind,
                inventoryValue: toApiString(movement.inventoryValue),
                occurredOn: movement.occurredOn
              })),
              filters
            )),
        breakdowns: built?.breakdowns ?? { valueByMaterial: [], expiring: [] },
        ...quality(failedSources),
        sourceVersions: { batches: built?.summary.batchCount ?? null },
        generatedAt: now
      };
    },
    context
  );
}

export async function getDrawerReport(filters = {}, context = {}) {
  const range = resolveRange(filters, context.now);
  return cachedReport(
    'drawer',
    { from: range.from, to: range.to },
    async () => {
      const failedSources = [];
      let built = null;
      try {
        built = await buildDrawer(range, {}, context);
      } catch {
        failedSources.push('Drawer');
      }
      const now = context.now ?? new Date();
      return {
        summary: built?.summary ?? {
          cashIn: null,
          cashOut: null,
          net: null,
          openShifts: null,
          transactions: null
        },
        ...(filters.exportAll
          ? { items: (built?.transactions ?? []).slice(0, EXPORT_ROW_CAP) }
          : paginate(
              (built?.transactions ?? []).map((row) => ({
                shiftId: String(row.shiftId),
                direction: row.direction,
                amount: toApiString(row.amount),
                accountingClass: row.accountingClass,
                recordedAt: row.recordedAt
              })),
              filters
            )),
        breakdowns: built?.breakdowns ?? { byAccountingClass: [] },
        ...quality(failedSources),
        sourceVersions: { transactions: built?.summary.transactions ?? null },
        generatedAt: now
      };
    },
    context
  );
}

export async function getSupplierReport(filters = {}, context = {}) {
  const range = resolveRange(filters, context.now);
  return cachedReport(
    'suppliers',
    { from: range.from, to: range.to, supplierId: filters.supplierId ?? null },
    async () => {
      const failedSources = [];
      let built = null;
      try {
        built = await buildSuppliers(range, { supplierId: filters.supplierId }, context);
      } catch {
        failedSources.push('Supplier');
      }
      const now = context.now ?? new Date();
      return {
        summary: built?.summary ?? { debt: null, receivable: null, suppliers: null },
        ...(filters.exportAll
          ? { items: (built?.accounts ?? []).slice(0, EXPORT_ROW_CAP) }
          : paginate(built?.accounts ?? [], filters)),
        breakdowns: built?.breakdowns ?? { topDebtors: [], recentEntries: [] },
        ...quality(failedSources),
        sourceVersions: { suppliers: built?.summary.suppliers ?? null },
        generatedAt: now
      };
    },
    context
  );
}

export async function getDelegateReport(filters = {}, context = {}) {
  const range = resolveRange(filters, context.now);
  return cachedReport(
    'delegates',
    { from: range.from, to: range.to, delegateId: filters.delegateId ?? null },
    async () => {
      const failedSources = [];
      let built = null;
      try {
        built = await buildDelegates(range, { delegateId: filters.delegateId }, context);
      } catch {
        failedSources.push('Delegate');
      }
      const now = context.now ?? new Date();
      return {
        summary: built?.summary ?? {
          outstanding: null,
          settled: null,
          activeDelegates: null,
          failedDeliveries: null,
          assignments: null
        },
        ...(filters.exportAll
          ? { items: (built?.assignments ?? []).slice(0, EXPORT_ROW_CAP) }
          : paginate(built?.assignments ?? [], filters)),
        breakdowns: built?.breakdowns ?? { perDelegate: [] },
        ...quality(failedSources),
        sourceVersions: { assignments: built?.summary.assignments ?? null },
        generatedAt: now
      };
    },
    context
  );
}

const EXPORTERS = {
  sales: (filters, context) => getSalesReport({ ...filters, exportAll: true }, context),
  inventory: (filters, context) => getInventoryReport({ ...filters, exportAll: true }, context),
  drawer: (filters, context) => getDrawerReport({ ...filters, exportAll: true }, context),
  suppliers: (filters, context) => getSupplierReport({ ...filters, exportAll: true }, context),
  delegates: (filters, context) => getDelegateReport({ ...filters, exportAll: true }, context),
  'audit:events': (filters, context) => exportAuditRows(filters, context)
};

async function exportAuditRows(filters = {}, context = {}) {
  const models = context.reportsModels ?? { AuditEvent };
  const query = {};
  if (filters.module) query.module = filters.module;
  if (filters.eventType) query.eventType = filters.eventType;
  if (filters.from || filters.to)
    query.occurredAt = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {})
    };
  const rows = await models.AuditEvent.find(query)
    .sort({ occurredAt: -1, _id: -1 })
    .limit(EXPORT_ROW_CAP)
    .lean();
  return {
    summary: { rows: rows.length },
    items: rows.map((row) => ({
      eventNo: row.eventNo,
      eventType: row.eventType,
      module: row.module,
      action: row.action,
      result: row.result,
      severity: row.severity,
      occurredAt: row.occurredAt
    })),
    breakdowns: {},
    dataQuality: 'COMPLETE',
    failedSources: [],
    generatedAt: context.now ?? new Date()
  };
}

export async function requestReportExport(input, context = {}) {
  const models = context.reportsModels ?? { ReportExport };
  const build = EXPORTERS[input.reportType];
  if (!build)
    throw new ApiError({
      code: 'REPORT_TYPE_UNKNOWN',
      status: 422,
      messageAr: 'نوع التقرير غير معروف'
    });
  const now = context.now ?? new Date();
  const sequence = await nextSequence('report-export', context);
  const [job] = await models.ReportExport.create([
    {
      exportNo: `EXP-${String(sequence).padStart(8, '0')}`,
      reportType: input.reportType,
      filtersSafe: { from: input.from, to: input.to, ...(input.filters ?? {}) },
      format: input.format,
      requestedBy: context.actorId,
      requestedAt: now,
      expiresAt: new Date(now.getTime() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000)
    }
  ]);
  try {
    await processReportExport(job._id, { ...context, reportsModels: models });
    const done = await models.ReportExport.findById(job._id).lean();
    return {
      export: {
        id: String(done._id),
        exportNo: done.exportNo,
        status: done.status,
        statusUrl:
          input.reportType === 'audit:events'
            ? `/audit-events/exports/${done._id}`
            : `/financial-reports/exports/${done._id}`,
        expiresAt: done.expiresAt
      }
    };
  } catch (error) {
    await models.ReportExport.findByIdAndUpdate(job._id, {
      $set: { status: 'FAILED', errorCode: error?.code ?? 'EXPORT_FAILED', completedAt: new Date() }
    });
    throw error;
  }
}

export async function processReportExport(exportId, context = {}) {
  const models = context.reportsModels ?? { ReportExport };
  const job = await models.ReportExport.findById(exportId);
  if (!job)
    throw new ApiError({ code: 'EXPORT_NOT_FOUND', status: 404, messageAr: 'التصدير غير موجود' });
  if (job.status === 'READY') return job;
  job.status = 'PROCESSING';
  await job.save();
  const build = EXPORTERS[job.reportType];
  const payload = await build(
    { from: job.filtersSafe?.from, to: job.filtersSafe?.to, ...(job.filtersSafe ?? {}) },
    context
  );
  const rows = payload.items ?? [];
  job.status = 'READY';
  job.completedAt = context.now ?? new Date();
  job.rowCount = rows.length;
  job.checksum = createHash('sha256').update(stableStringify(rows)).digest('hex');
  job.resultInline = rows;
  await job.save();
  return job;
}

export async function getReportExportStatus(exportId, context = {}) {
  const models = context.reportsModels ?? { ReportExport };
  const job = await models.ReportExport.findById(exportId).lean();
  if (!job)
    throw new ApiError({ code: 'EXPORT_NOT_FOUND', status: 404, messageAr: 'التصدير غير موجود' });
  return {
    export: {
      id: String(job._id),
      exportNo: job.exportNo,
      status: job.status,
      progress: job.status === 'READY' ? 100 : job.status === 'PROCESSING' ? 50 : 0,
      rowCount: job.rowCount,
      fileUrl: null,
      checksum: job.checksum ?? null,
      errorCode: job.errorCode ?? null,
      expiresAt: job.expiresAt
    }
  };
}
