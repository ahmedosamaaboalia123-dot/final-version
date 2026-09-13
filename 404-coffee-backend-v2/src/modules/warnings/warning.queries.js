import { DateTime } from 'luxon';
import { add, toApiString } from '../../platform/database/decimal.js';
import { buildPageMeta, parsePage } from '../../platform/database/pagination.js';
import { RawMaterial, RawMaterialBatch } from '../inventory/inventory.models.js';
import { evaluateBatchExpiry, evaluateLowStock } from './warning-evaluator.js';

const defaults = { RawMaterial, RawMaterialBatch };
const snapshotCache = new Map();
const CACHE_TTL_MS = 1_000;
const safeId = (value) => (value === undefined || value === null ? null : String(value));

function sourceVersions(materials, batches) {
  return {
    materials: materials
      .map((item) => `${item._id}:${item.stockVersion ?? 0}`)
      .sort()
      .join('|'),
    batches: batches
      .map(
        (item) =>
          `${item._id}:${item.version ?? 0}:${toApiString(item.remainingQuantitySmall)}:${item.expiryOn ?? ''}`
      )
      .sort()
      .join('|')
  };
}

function cachedItems(cacheKey, calculate, cache = snapshotCache) {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached?.expiresAt > now) return cached.items;
  const items = calculate();
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { items, expiresAt: now + CACHE_TTL_MS });
  return items;
}

function buildItems(materials, batches, businessToday) {
  const materialMap = new Map(materials.map((material) => [String(material._id), material]));
  const stock = new Map();
  for (const batch of batches)
    stock.set(
      String(batch.materialId),
      add(stock.get(String(batch.materialId)) ?? '0', batch.remainingQuantitySmall)
    );
  const items = [];
  for (const material of materials) {
    const warning = evaluateLowStock(material, stock.get(String(material._id)) ?? '0');
    if (warning)
      items.push({
        ...warning,
        material: { id: String(material._id), name: material.name },
        supplier: { id: String(material.supplierId) },
        link: `/raw-materials/${material._id}`
      });
  }
  for (const batch of batches) {
    const material = materialMap.get(String(batch.materialId));
    if (!material) continue;
    const warning = evaluateBatchExpiry(batch, businessToday, material.expiryAlertDays);
    if (warning)
      items.push({
        ...warning,
        currentValue: toApiString(batch.remainingQuantitySmall),
        material: { id: String(material._id), name: material.name },
        batch: { id: String(batch._id), batchNumber: batch.batchNumber },
        supplier: {
          id: safeId(batch.supplierId ?? material.supplierId),
          name: batch.supplierSnapshot?.name ?? null
        },
        link: `/raw-materials/${material._id}`
      });
  }
  const rank = { CRITICAL: 0, WARNING: 1 };
  return items.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      (a.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER) -
        (b.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id)
  );
}

async function loadSources(filters, context) {
  const models = context.warningModels ?? context.models ?? defaults;
  const materialMatch = {
    ...(filters.materialId ? { _id: filters.materialId } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {})
  };
  const materialsResult = await Promise.resolve(
    models.RawMaterial.find(materialMatch)
      .select({
        name: 1,
        supplierId: 1,
        status: 1,
        minStockSmall: 1,
        expiryAlertDays: 1,
        stockVersion: 1
      })
      .lean()
  ).then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason })
  );
  if (materialsResult.status === 'rejected')
    return { materials: [], batches: [], dataQuality: 'ERROR', failedSources: ['rawMaterials'] };
  const materials = materialsResult.value;
  const materialIds = materials.map((material) => material._id);
  const batchesResult = await Promise.resolve(
    materialIds.length
      ? models.RawMaterialBatch.find({
          materialId: { $in: materialIds },
          remainingQuantitySmall: { $gt: 0 }
        })
          .select({
            materialId: 1,
            batchNumber: 1,
            supplierId: 1,
            supplierSnapshot: 1,
            remainingQuantitySmall: 1,
            expiryOn: 1,
            version: 1
          })
          .lean()
      : []
  ).then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason })
  );
  return {
    materials,
    batches: batchesResult.status === 'fulfilled' ? batchesResult.value : [],
    dataQuality: batchesResult.status === 'fulfilled' ? 'COMPLETE' : 'ERROR',
    failedSources: batchesResult.status === 'fulfilled' ? [] : ['rawMaterialBatches']
  };
}

export async function getWarningsScreen(filters = {}, context = {}) {
  const businessToday = context.businessDate ?? DateTime.now().setZone('Africa/Cairo').toISODate();
  const sources = await loadSources(filters, context);
  const versions = sourceVersions(sources.materials, sources.batches);
  const cacheKey = JSON.stringify({
    businessToday,
    materialId: filters.materialId ?? null,
    supplierId: filters.supplierId ?? null,
    versions
  });
  const inventoryItems =
    sources.dataQuality === 'COMPLETE'
      ? cachedItems(
          cacheKey,
          () => buildItems(sources.materials, sources.batches, businessToday),
          context.warningCache
        )
      : [];
  let drawerWarnings = { count: 0, items: [], sourceVersion: '' };
  let drawerFailed = false;
  if (context.includeDrawerWarnings !== false && context.drawerWarningsPort?.getOpenShiftWarnings) {
    try {
      drawerWarnings = await context.drawerWarningsPort.getOpenShiftWarnings(context);
    } catch {
      drawerFailed = true;
    }
  }
  const allItems = [...inventoryItems, ...drawerWarnings.items];
  const counts = {
    lowStock: 0,
    expiring: 0,
    expired: 0,
    openShiftLong:
      context.includeDrawerWarnings === false || !context.drawerWarningsPort
        ? null
        : drawerFailed
          ? null
          : drawerWarnings.count
  };
  for (const item of allItems) {
    if (item.type === 'LOW_STOCK') counts.lowStock += 1;
    if (item.type === 'EXPIRING') counts.expiring += 1;
    if (item.type === 'EXPIRED') counts.expired += 1;
  }
  const filtered = filters.type ? allItems.filter((item) => item.type === filters.type) : allItems;
  const { page, limit } = parsePage(filters);
  const start = (page - 1) * limit;
  return {
    summary: sources.dataQuality === 'COMPLETE' ? counts : null,
    evaluatedAt: new Date().toISOString(),
    businessToday,
    timezone: 'Africa/Cairo',
    dataQuality:
      sources.dataQuality === 'COMPLETE' && !drawerFailed
        ? 'COMPLETE'
        : sources.dataQuality === 'ERROR'
          ? 'ERROR'
          : 'PARTIAL',
    failedSources: [...sources.failedSources, ...(drawerFailed ? ['drawerShifts'] : [])],
    sourceVersions: {
      ...versions,
      inventoryStockVersion: Math.max(
        0,
        ...sources.materials.map((item) => item.stockVersion ?? 0)
      ),
      materialCount: sources.materials.length,
      batchCount: sources.batches.length,
      drawerShifts: drawerWarnings.sourceVersion
    },
    items: filtered.slice(start, start + limit),
    pageMeta: buildPageMeta({ page, limit, totalItems: filtered.length, sort: { severity: 1 } })
  };
}

export async function getWarningsSummary(context = {}) {
  const result = await getWarningsScreen({ page: 1, limit: 1 }, context);
  return {
    counts: result.summary,
    evaluatedAt: result.evaluatedAt,
    businessToday: result.businessToday,
    timezone: result.timezone,
    dataQuality: result.dataQuality,
    failedSources: result.failedSources,
    sourceVersions: result.sourceVersions
  };
}
