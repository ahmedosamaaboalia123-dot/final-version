import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { add, divide, toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import {
  InventoryMovement,
  MeasurementUnit,
  RawMaterial,
  RawMaterialBatch
} from './inventory.models.js';
import { toMaterialDto } from './material.service.js';
import { toUnitDto } from './unit.service.js';

const batchDto = (batch) => ({
  id: String(batch._id),
  batchNumber: batch.batchNumber,
  materialId: String(batch.materialId),
  supplierId: String(batch.supplierId),
  initialQuantitySmall: toApiString(batch.initialQuantitySmall),
  remainingQuantitySmall: toApiString(batch.remainingQuantitySmall),
  purchaseLargeUnitPrice: toApiString(batch.purchaseLargeUnitPrice),
  initialInventoryValue: toApiString(batch.initialInventoryValue),
  remainingInventoryValue: toApiString(batch.remainingInventoryValue),
  receivedOn: batch.receivedOn,
  expiryOn: batch.expiryOn,
  salePriority: batch.salePriority,
  version: batch.version ?? 0
});
const movementDto = (movement) => ({
  id: String(movement._id),
  movementNo: movement.sequenceNo,
  materialId: String(movement.materialId),
  batchId: String(movement.batchId),
  kind: movement.kind,
  quantitySmall: toApiString(movement.quantitySmall),
  inventoryValue: toApiString(movement.inventoryValue),
  quantityAfterSmall: toApiString(movement.quantityAfterSmall),
  inventoryValueAfter: toApiString(movement.inventoryValueAfter),
  occurredOn: movement.occurredOn,
  recordedAt: movement.recordedAt,
  recordedBy: String(movement.recordedBy),
  reason: movement.reason ?? '',
  sourceType: movement.sourceType,
  sourceId: movement.sourceId
});

export async function getRawMaterialsScreen(filters = {}, context = {}) {
  const models = context.models ?? { RawMaterial, RawMaterialBatch, MeasurementUnit };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const match = {};
  if (filters.supplierId) match.supplierId = filters.supplierId;
  if (filters.search)
    match.name = { $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [materials, totalItems, units, suppliers] = await Promise.all([
    models.RawMaterial.find(match).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    models.RawMaterial.countDocuments(match),
    models.MeasurementUnit.find({ isActive: true }).sort({ kind: 1, physicalFactor: -1 }).lean(),
    context.suppliersPort?.listSummaries
      ? context.suppliersPort.listSummaries(context)
      : Promise.resolve([])
  ]);
  const ids = materials.map((item) => item._id);
  const batches = ids.length
    ? await models.RawMaterialBatch.find({
        materialId: { $in: ids },
        remainingQuantitySmall: { $gt: 0 }
      })
        .sort({ salePriority: 1, _id: 1 })
        .lean()
    : [];
  const rows = materials.map((material) => {
    const owned = batches.filter((batch) => String(batch.materialId) === String(material._id));
    const stockSmall = owned.reduce((sum, batch) => add(sum, batch.remainingQuantitySmall), '0');
    return {
      ...toMaterialDto(material),
      stockSmall: toApiString(stockSmall),
      stockLarge: toApiString(divide(stockSmall, material.conversionFactor, 6)),
      lastPurchasePrice:
        material.referenceLargeUnitPrice?.toString() ??
        [...owned]
          .sort(
            (a, b) =>
              String(b.receivedOn).localeCompare(String(a.receivedOn)) ||
              new Date(b.recordedAt ?? 0) - new Date(a.recordedAt ?? 0)
          )[0]
          ?.purchaseLargeUnitPrice?.toString() ??
        null,
      nextExpiry: owned.map((batch) => batch.expiryOn).sort()[0] ?? null
    };
  });
  const warningSummary = context.warningsPort?.getSummary
    ? await context.warningsPort.getSummary({
        ...context,
        warningModels: models,
        includeDrawerWarnings: false
      })
    : null;
  return {
    summary: {
      materials: totalItems,
      lowStock: warningSummary?.counts?.lowStock ?? null,
      expiring: warningSummary?.counts?.expiring ?? null,
      expired: warningSummary?.counts?.expired ?? null,
      dataQuality: warningSummary?.dataQuality ?? 'UNAVAILABLE'
    },
    filters: { suppliers, units: units.map(toUnitDto) },
    materials: rows,
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { name: 1 } })
  };
}

export async function getRawMaterialDetails(id, includes = [], context = {}) {
  const models = context.models ?? { RawMaterial, RawMaterialBatch, InventoryMovement };
  const material = await models.RawMaterial.findById(id).lean();
  if (!material)
    throw new ApiError({
      code: 'MATERIAL_NOT_FOUND',
      status: 404,
      messageAr: 'المادة الخام غير موجودة'
    });
  const allBatches = await models.RawMaterialBatch.find({ materialId: id })
    .sort({ salePriority: 1, _id: 1 })
    .limit(10)
    .lean();
  const stockSmall = allBatches.reduce((sum, batch) => add(sum, batch.remainingQuantitySmall), '0');
  const result = {
    material: toMaterialDto(material),
    stockSummary: {
      stockSmall: toApiString(stockSmall),
      stockLarge: toApiString(divide(stockSmall, material.conversionFactor, 6)),
      inventoryValue: toApiString(
        allBatches.reduce((sum, batch) => add(sum, batch.remainingInventoryValue), '0')
      )
    }
  };
  if (includes.includes('batches'))
    result.batches = {
      items: allBatches.map(batchDto),
      pageMeta: buildPageMeta({
        page: 1,
        limit: 10,
        totalItems: allBatches.length,
        sort: { salePriority: 1 }
      })
    };
  if (includes.includes('movements')) {
    const movements = await models.InventoryMovement.find({ materialId: id })
      .sort({ recordedAt: -1, _id: -1 })
      .limit(10)
      .lean();
    result.movements = {
      items: movements.map(movementDto),
      pageMeta: buildPageMeta({
        page: 1,
        limit: 10,
        totalItems: movements.length,
        sort: { recordedAt: -1 }
      })
    };
  }
  if (includes.includes('affectedProducts')) {
    if (!context.productsPort?.listByMaterial)
      throw new ApiError({
        code: 'PRODUCTS_SERVICE_UNAVAILABLE',
        status: 503,
        messageAr: 'خدمة المنتجات غير متاحة حاليًا',
        retryable: true
      });
    result.affectedProducts = await context.productsPort.listByMaterial(
      id,
      { page: 1, limit: 10 },
      context
    );
  }
  return result;
}

export async function listWithdrawals(filters = {}, context = {}) {
  const model = context.models?.InventoryMovement ?? InventoryMovement;
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const match = {
    kind: 'WITHDRAWAL',
    ...(filters.materialId ? { materialId: filters.materialId } : {}),
    ...(filters.supplierId ? { 'supplierSnapshot.id': String(filters.supplierId) } : {})
  };
  if (filters.from || filters.to)
    match.occurredOn = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {})
    };
  const [items, totalItems] = await Promise.all([
    model.find(match).sort({ recordedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(match)
  ]);
  return {
    items: items.map(movementDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { recordedAt: -1 } })
  };
}

export async function listMaterialsBySupplier(supplierId, filters = {}, context = {}) {
  const model = context.inventoryModels?.RawMaterial ?? RawMaterial;
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const match = { supplierId };
  const [items, totalItems] = await Promise.all([
    model.find(match).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(match)
  ]);
  return {
    items: items.map(toMaterialDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { name: 1, _id: 1 } })
  };
}

export { batchDto, movementDto };
