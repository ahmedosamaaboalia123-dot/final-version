import { compare, toApiString, toDecimal128 } from '../../platform/database/decimal.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { normalizeName } from '../../shared/utils/normalize-name.js';
import { assertSupplierExists } from '../suppliers/supplier.public-service.js';
import { InventoryAllocation, InventoryMovement, MeasurementUnit, RawMaterial, RawMaterialBatch } from './inventory.models.js';
import { PurchaseItem } from '../purchases/purchase.models.js';
import { PurchaseReturnItem } from '../purchase-returns/purchase-return.models.js';
import { ProductRecipe, ProductType } from '../products/product.models.js';
import { calculateConversionFactor } from './unit.service.js';

const defaults = { MeasurementUnit, RawMaterial };
export async function createRawMaterial(input, context = {}) {
  try {
    return await runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      await (context.suppliersPort?.assertSupplierExists ?? assertSupplierExists)(
        input.supplierId,
        { ...context, ...tx, models: context.supplierModels }
      );
      const [largeUnit, smallUnit] = await Promise.all([
        models.MeasurementUnit.findById(input.largeUnitId).session(tx.session),
        models.MeasurementUnit.findById(input.smallUnitId).session(tx.session)
      ]);
      if (!largeUnit?.isActive || !smallUnit?.isActive)
        throw new ApiError({
          code: 'UNIT_NOT_ACTIVE',
          status: 422,
          messageAr: 'وحدة القياس غير موجودة أو متوقفة'
        });
      const derived = calculateConversionFactor(largeUnit, smallUnit);
      if (compare(derived, input.conversionFactor) !== 0)
        throw new ApiError({
          code: 'CONVERSION_FACTOR_MISMATCH',
          status: 422,
          messageAr: 'معامل التحويل لا يطابق الوحدات المختارة'
        });
      const [material] = await models.RawMaterial.create(
        [
          {
            ...input,
            normalizedName: normalizeName(input.name),
            conversionFactor: toDecimal128(input.conversionFactor),
            smallQuantityStep: toDecimal128(input.smallQuantityStep),
            referenceLargeUnitPrice: input.referenceLargeUnitPrice
              ? toDecimal128(input.referenceLargeUnitPrice)
              : undefined,
            minStockSmall: toDecimal128(input.minStockSmall),
            operationRequestId: context.operationRequestId,
            createdBy: context.actorId
          }
        ],
        { session: tx.session }
      );
      return material;
    },
    context,
    context.transactionOptions
  );
  } catch (error) {
    if (error?.code !== 11000 || !context.operationRequestId) throw error;
    const models = context.models ?? defaults;
    const replayed = await models.RawMaterial.findOne({
      operationRequestId: context.operationRequestId
    }).lean();
    if (!replayed)
      throw new ApiError({
        code: 'MATERIAL_WRITE_CONFLICT',
        status: 409,
        messageAr: 'تعارض في إنشاء المادة، أعد تحميل الصفحة'
      });
    return { ...replayed, replayed: true };
  }
}
export async function updateRawMaterial(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const material = await models.RawMaterial.findOne({
        _id: id,
        version: input.expectedVersion
      }).session(tx.session);
      if (!material)
        throw new ApiError({
          code: 'MATERIAL_VERSION_CONFLICT',
          status: 409,
          messageAr: 'المادة غير موجودة أو تم تعديلها'
        });
      const lockedFields = [
        'supplierId',
        'largeUnitId',
        'smallUnitId',
        'conversionFactor',
        'smallQuantityStep'
      ];
      if (
        material.unitsLocked &&
        lockedFields.some(
          (key) => input[key] !== undefined && String(input[key]) !== String(material[key])
        )
      )
        throw new ApiError({
          code: 'MATERIAL_UNITS_LOCKED',
          status: 409,
          messageAr: 'لا يمكن تغيير المورد أو الوحدات بعد تسجيل أول دفعة'
        });
      if (input.supplierId)
        await (context.suppliersPort?.assertSupplierExists ?? assertSupplierExists)(
          input.supplierId,
          { ...context, ...tx, models: context.supplierModels }
        );
      const nextLargeUnitId = input.largeUnitId ?? material.largeUnitId;
      const nextSmallUnitId = input.smallUnitId ?? material.smallUnitId;
      if (
        input.largeUnitId !== undefined ||
        input.smallUnitId !== undefined ||
        input.conversionFactor !== undefined
      ) {
        const [largeUnit, smallUnit] = await Promise.all([
          models.MeasurementUnit.findById(nextLargeUnitId).session(tx.session),
          models.MeasurementUnit.findById(nextSmallUnitId).session(tx.session)
        ]);
        if (!largeUnit?.isActive || !smallUnit?.isActive)
          throw new ApiError({
            code: 'UNIT_NOT_ACTIVE',
            status: 422,
            messageAr: 'وحدة القياس غير موجودة أو متوقفة'
          });
        const derived = calculateConversionFactor(largeUnit, smallUnit);
        if (compare(derived, input.conversionFactor ?? material.conversionFactor) !== 0)
          throw new ApiError({
            code: 'CONVERSION_FACTOR_MISMATCH',
            status: 422,
            messageAr: 'معامل التحويل لا يطابق الوحدات المختارة'
          });
      }
      for (const key of [
        'name',
        'supplierId',
        'largeUnitId',
        'smallUnitId',
        'expiryAlertDays'
      ])
        if (input[key] !== undefined) material[key] = input[key];
      for (const key of [
        'conversionFactor',
        'smallQuantityStep',
        'referenceLargeUnitPrice',
        'minStockSmall'
      ])
        if (input[key] !== undefined) material[key] = toDecimal128(input[key]);
      if (input.name) material.normalizedName = normalizeName(input.name);
      material.updatedBy = context.actorId;
      await material.save({ session: tx.session });
      return material;
    },
    context,
    context.transactionOptions
  );
}
export async function deleteRawMaterial(id, input, context = {}) {
  return runInTransaction(async (tx) => {
    const models = context.models ?? defaults;
    const material = await models.RawMaterial.findOne({ _id: id, version: input.expectedVersion }).session(tx.session);
    if (!material) throw new ApiError({ code: 'MATERIAL_VERSION_CONFLICT', status: 409, messageAr: 'المادة غير موجودة أو تم تعديلها' });
    const linked = context.materialDeleteModels ?? { RawMaterialBatch, InventoryMovement, InventoryAllocation, PurchaseItem, PurchaseReturnItem, ProductRecipe, ProductType };
    const count = (model, query) => model.countDocuments(query).session(tx.session);
    const [batches, movements, allocations, purchaseItems, returns, recipes, allowedTypes] = await Promise.all([
      count(linked.RawMaterialBatch, { materialId: material._id }), count(linked.InventoryMovement, { materialId: material._id }),
      count(linked.InventoryAllocation, { materialId: material._id }), count(linked.PurchaseItem, { materialId: material._id }),
      count(linked.PurchaseReturnItem, { materialId: material._id }), count(linked.ProductRecipe, { 'ingredients.materialId': material._id }),
      count(linked.ProductType, { allowedMaterialIds: material._id })
    ]);
    const blockers = { ...(batches ? { batches } : {}), ...(movements ? { movements } : {}), ...(allocations ? { allocations } : {}), ...(purchaseItems ? { purchaseItems } : {}), ...(returns ? { returns } : {}), ...(recipes ? { recipes } : {}), ...(allowedTypes ? { allowedTypes } : {}) };
    if (Object.keys(blockers).length) throw new ApiError({ code: 'MATERIAL_DELETE_BLOCKED', status: 409, messageAr: 'لا يمكن حذف المادة لوجود بيانات مرتبطة بها', details: { blockers } });
    await models.RawMaterial.deleteOne({ _id: material._id }, { session: tx.session });
    const auditContext = { ...context, ...tx };
    await writeAudit({ eventType: 'MATERIAL_DELETED', category: 'INVENTORY', module: 'inventory', action: 'DELETE', actor: { type: context.actorType, id: context.actorId }, entity: { type: 'RawMaterial', id: material._id }, metadataSafe: { name: material.name, supplierId: String(material.supplierId), reason: input.reason }, result: 'SUCCESS', severity: 'INFO', requestId: context.requestId }, auditContext);
    await enqueueDomainEvent({ aggregateType: 'RawMaterial', aggregateId: String(material._id), eventType: 'material.deleted', payload: { materialId: String(material._id), name: material.name }, sequence: Number(input.expectedVersion) + 1 }, auditContext);
    return { deleted: true, materialId: String(material._id) };
  }, context, context.transactionOptions);
}
export const toMaterialDto = (material) => ({
  id: String(material._id),
  name: material.name,
  supplierId: String(material.supplierId),
  largeUnitId: String(material.largeUnitId),
  smallUnitId: String(material.smallUnitId),
  conversionFactor: toApiString(material.conversionFactor),
  smallQuantityStep: toApiString(material.smallQuantityStep),
  referenceLargeUnitPrice: material.referenceLargeUnitPrice
    ? toApiString(material.referenceLargeUnitPrice)
    : null,
  currency: material.currency,
  minStockSmall: toApiString(material.minStockSmall),
  expiryAlertDays: material.expiryAlertDays,
  unitsLocked: material.unitsLocked,
  supplierLockedAt: material.supplierLockedAt ?? null,
  supplierLockReason: material.supplierLockReason ?? null,
  priorityVersion: material.priorityVersion,
  stockVersion: material.stockVersion,
  version: material.version ?? 0
});
