import mongoose from 'mongoose';
import {
  add,
  compare,
  decimal,
  divide,
  multiply,
  roundMoney,
  subtract,
  toApiString,
  toDecimal128
} from '../../platform/database/decimal.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import {
  InventoryAllocation,
  InventoryMovement,
  RawMaterial,
  RawMaterialBatch
} from './inventory.models.js';

const defaults = { InventoryAllocation, InventoryMovement, RawMaterial, RawMaterialBatch };
function assertStep(quantity, step) {
  if (!decimal(quantity).mod(decimal(step)).isZero())
    throw new ApiError({
      code: 'QUANTITY_STEP_MISMATCH',
      status: 422,
      messageAr: 'الكمية لا تطابق أقل خطوة مسموحة للمادة'
    });
}
function valueForExit(batch, quantity) {
  if (compare(quantity, batch.remainingQuantitySmall) === 0)
    return decimal(batch.remainingInventoryValue);
  return roundMoney(
    multiply(divide(batch.remainingInventoryValue, batch.remainingQuantitySmall, 12), quantity)
  );
}
async function createMovement(models, batch, data, session) {
  const [movement] = await models.InventoryMovement.create(
    [
      {
        batchId: batch._id,
        materialId: batch.materialId,
        sequenceNo: batch.version + 1,
        quantityAfterSmall: batch.remainingQuantitySmall,
        inventoryValueAfter: batch.remainingInventoryValue,
        recordedAt: new Date(),
        ...data
      }
    ],
    { session }
  );
  return movement;
}

export async function createBatchFromPurchase(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const material = await models.RawMaterial.findById(input.materialId).session(tx.session);
      if (!material)
        throw new ApiError({
          code: 'MATERIAL_NOT_FOUND',
          status: 409,
          messageAr: 'المادة غير موجودة'
        });
      if (String(material.supplierId) !== String(input.supplierId))
        throw new ApiError({
          code: 'MATERIAL_SUPPLIER_MISMATCH',
          status: 409,
          messageAr: 'المورد لا يطابق مورد المادة الخام'
        });
      const quantitySmall = multiply(input.quantityLarge, material.conversionFactor);
      assertStep(quantitySmall, material.smallQuantityStep);
      const inventoryValue = roundMoney(multiply(input.quantityLarge, input.largeUnitPrice));
      const last = await models.RawMaterialBatch.findOne({ materialId: material._id })
        .sort({ salePriority: -1 })
        .session(tx.session);
      const [batch] = await models.RawMaterialBatch.create(
        [
          {
            materialId: material._id,
            batchNumber: input.batchNumber,
            purchaseReceiptItemId: input.purchaseReceiptItemId,
            supplierId: material.supplierId,
            supplierSnapshot: {
              id: String(material.supplierId),
              ...(input.supplierSnapshot ?? {})
            },
            materialSnapshot: {
              name: material.name,
              conversionFactor: toApiString(material.conversionFactor)
            },
            initialQuantitySmall: toDecimal128(quantitySmall),
            remainingQuantitySmall: toDecimal128(quantitySmall),
            purchaseLargeUnitPrice: toDecimal128(input.largeUnitPrice),
            initialInventoryValue: toDecimal128(inventoryValue),
            remainingInventoryValue: toDecimal128(inventoryValue),
            currency: material.currency,
            receivedOn: input.receivedOn,
            expiryOn: input.expiryOn,
            salePriority: (last?.salePriority ?? 0) + 1,
            recordedBy: context.actorId
          }
        ],
        { session: tx.session }
      );
      const movement = await createMovement(
        models,
        batch,
        {
          kind: 'PURCHASE_RECEIPT',
          quantitySmall: batch.initialQuantitySmall,
          inventoryValue: batch.initialInventoryValue,
          occurredOn: input.receivedOn,
          recordedBy: context.actorId,
          reason: 'تسجيل دفعة مشتريات',
          sourceType: 'PURCHASE_RECEIPT_ITEM',
          sourceId: String(input.purchaseReceiptItemId),
          supplierSnapshot: batch.supplierSnapshot,
          materialSnapshot: batch.materialSnapshot
        },
        tx.session
      );
      if (!material.unitsLocked) {
        material.unitsLocked = true;
        material.supplierLockedAt = new Date();
        material.supplierLockReason = 'FIRST_BATCH';
      }
      material.stockVersion += 1;
      material.referenceLargeUnitPrice = toDecimal128(input.largeUnitPrice);
      await material.save({ session: tx.session });
      return { material, batch, movement };
    },
    context,
    context.transactionOptions
  );
}

export async function simulateRecipeRequirements(requirements, context = {}) {
  const models = context.models ?? defaults;
  const grouped = new Map();
  for (const requirement of requirements)
    grouped.set(
      String(requirement.materialId),
      add(grouped.get(String(requirement.materialId)) ?? '0', requirement.quantitySmall)
    );
  const plan = [];
  for (const [materialId, neededValue] of grouped) {
    let needed = decimal(neededValue);
    const batches = await models.RawMaterialBatch.find({
      materialId,
      remainingQuantitySmall: { $gt: toDecimal128('0') }
    })
      .sort({ salePriority: 1, _id: 1 })
      .lean();
    for (const batch of batches) {
      if (needed.lte(0)) break;
      const take = DecimalMin(needed, decimal(batch.remainingQuantitySmall));
      const value = valueForExit(batch, take);
      plan.push({
        materialId,
        batchId: String(batch._id),
        quantitySmall: toApiString(take),
        inventoryValue: toApiString(value),
        unitCost: toApiString(divide(value, take, 12)),
        batchVersion: batch.version ?? 0,
        expiryOn: batch.expiryOn
      });
      needed = needed.minus(take);
    }
    if (needed.gt(0))
      throw new ApiError({
        code: 'INSUFFICIENT_STOCK',
        status: 409,
        messageAr: 'المخزون غير كافٍ',
        fieldErrors: [{ field: materialId, code: 'SHORTAGE', message: toApiString(needed) }]
      });
  }
  return plan;
}
const DecimalMin = (a, b) => (a.lte(b) ? a : b);

export async function consumeFromBatch(batch, quantitySmall, source, context = {}) {
  const models = context.models ?? defaults;
  if (compare(quantitySmall, batch.remainingQuantitySmall) > 0)
    throw new ApiError({
      code: 'INSUFFICIENT_BATCH_STOCK',
      status: 409,
      messageAr: 'رصيد الدفعة غير كافٍ'
    });
  const inventoryValue = valueForExit(batch, quantitySmall);
  batch.remainingQuantitySmall = toDecimal128(
    subtract(batch.remainingQuantitySmall, quantitySmall)
  );
  batch.remainingInventoryValue =
    compare(batch.remainingQuantitySmall, '0') === 0
      ? toDecimal128('0')
      : toDecimal128(subtract(batch.remainingInventoryValue, inventoryValue));
  await batch.save({ session: context.session });
  const movement = await createMovement(
    models,
    batch,
    {
      kind: source.kind ?? 'SALE_CONSUMPTION',
      quantitySmall: toDecimal128(quantitySmall),
      inventoryValue: toDecimal128(inventoryValue),
      occurredOn: source.occurredOn,
      recordedBy: context.actorId,
      reason: source.reason,
      sourceType: source.type,
      sourceId: String(source.id),
      supplierSnapshot: batch.supplierSnapshot,
      materialSnapshot: batch.materialSnapshot,
      operationRequestId: context.operationRequestId
    },
    context.session
  );
  return { batch, movement, inventoryValue };
}

export async function allocateRecipeRequirements(requirements, source, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const plan = await simulateRecipeRequirements(requirements, { ...context, ...tx, models });
      const allocations = [];
      for (const item of plan) {
        const batch = await models.RawMaterialBatch.findOne({
          _id: item.batchId,
          version: item.batchVersion
        }).session(tx.session);
        if (!batch)
          throw new ApiError({
            code: 'INVENTORY_RACE_CONFLICT',
            status: 409,
            messageAr: 'تغير المخزون أثناء تنفيذ الطلب',
            retryable: true
          });
        const consumed = await consumeFromBatch(
          batch,
          item.quantitySmall,
          { ...source, kind: 'SALE_CONSUMPTION' },
          { ...context, ...tx, models }
        );
        const [allocation] = await models.InventoryAllocation.create(
          [
            {
              sourceType: source.type,
              sourceId: String(source.id),
              orderItemId: source.orderItemId,
              materialId: batch.materialId,
              batchId: batch._id,
              consumptionMovementId: consumed.movement._id,
              quantitySmall: toDecimal128(item.quantitySmall),
              inventoryValue: toDecimal128(consumed.inventoryValue),
              unitCostSnapshot: toDecimal128(
                divide(consumed.inventoryValue, item.quantitySmall, 12)
              ),
              status: 'CONSUMED',
              operationRequestId: context.operationRequestId
            }
          ],
          { session: tx.session }
        );
        allocations.push(allocation);
      }
      const materialIds = [...new Set(plan.map((item) => item.materialId))];
      await models.RawMaterial.updateMany(
        { _id: { $in: materialIds } },
        { $inc: { stockVersion: 1 } },
        { session: tx.session }
      );
      return { allocations, plan };
    },
    context,
    context.transactionOptions
  );
}

export async function restoreAllocations(allocationIds, reason, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const restored = [];
      for (const allocationId of allocationIds) {
        const allocation = await models.InventoryAllocation.findById(allocationId).session(
          tx.session
        );
        if (!allocation)
          throw new ApiError({
            code: 'ALLOCATION_NOT_FOUND',
            status: 404,
            messageAr: 'تخصيص المخزون غير موجود'
          });
        if (allocation.status === 'REVERSED') {
          restored.push({ allocation, alreadyRestored: true });
          continue;
        }
        const batch = await models.RawMaterialBatch.findById(allocation.batchId).session(
          tx.session
        );
        const nextQuantity = add(batch.remainingQuantitySmall, allocation.quantitySmall);
        const nextValue = add(batch.remainingInventoryValue, allocation.inventoryValue);
        if (
          compare(nextQuantity, batch.initialQuantitySmall) > 0 ||
          compare(nextValue, batch.initialInventoryValue) > 0
        )
          throw new ApiError({
            code: 'RESTORE_EXCEEDS_BATCH_INITIAL',
            status: 409,
            messageAr: 'الاستعادة تتجاوز الكمية الأصلية للدفعة'
          });
        batch.remainingQuantitySmall = toDecimal128(nextQuantity);
        batch.remainingInventoryValue = toDecimal128(nextValue);
        await batch.save({ session: tx.session });
        const movement = await createMovement(
          models,
          batch,
          {
            kind: 'SALE_CANCELLATION_RESTORE',
            quantitySmall: allocation.quantitySmall,
            inventoryValue: allocation.inventoryValue,
            occurredOn: context.businessDate ?? new Date().toISOString().slice(0, 10),
            recordedBy: context.actorId,
            reason,
            sourceType: 'INVENTORY_ALLOCATION',
            sourceId: String(allocation._id),
            reversesMovementId: allocation.consumptionMovementId,
            operationRequestId: context.operationRequestId
          },
          tx.session
        );
        allocation.reversedQuantitySmall = allocation.quantitySmall;
        allocation.reversalMovementId = movement._id;
        allocation.status = 'REVERSED';
        allocation.reversedAt = new Date();
        allocation.reversedBy = context.actorId;
        allocation.reason = reason;
        await allocation.save({ session: tx.session });
        await models.RawMaterial.updateOne(
          { _id: allocation.materialId },
          { $inc: { stockVersion: 1 } },
          { session: tx.session }
        );
        restored.push({ allocation, movement, batch, alreadyRestored: false });
      }
      return restored;
    },
    context,
    context.transactionOptions
  );
}

export async function withdrawBatchQuantity(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const [material, batch] = await Promise.all([
        models.RawMaterial.findById(input.materialId).session(tx.session),
        models.RawMaterialBatch.findOne({
          _id: input.batchId,
          materialId: input.materialId,
          version: input.expectedBatchVersion
        }).session(tx.session)
      ]);
      if (!material || !batch)
        throw new ApiError({
          code: 'BATCH_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الدفعة غير موجودة أو تغير رصيدها'
        });
      const quantitySmall = multiply(input.quantityLarge, material.conversionFactor);
      assertStep(quantitySmall, material.smallQuantityStep);
      const result = await consumeFromBatch(
        batch,
        quantitySmall,
        {
          kind: 'WITHDRAWAL',
          type: 'WITHDRAWAL',
          id: new mongoose.Types.ObjectId(),
          occurredOn: input.occurredOn,
          reason: input.reason
        },
        { ...context, ...tx, models }
      );
      material.stockVersion += 1;
      await material.save({ session: tx.session });
      return {
        withdrawal: {
          id: result.movement.sourceId,
          materialId: String(material._id),
          batchId: String(batch._id),
          quantityLarge: input.quantityLarge,
          quantitySmall: toApiString(quantitySmall),
          reason: input.reason,
          occurredOn: input.occurredOn
        },
        movement: result.movement,
        batch,
        material
      };
    },
    context,
    context.transactionOptions
  );
}

export async function reorderBatchPriorities(materialId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.models ?? defaults;
      const material = await models.RawMaterial.findOne({
        _id: materialId,
        priorityVersion: input.expectedPriorityVersion
      }).session(tx.session);
      if (!material)
        throw new ApiError({
          code: 'PRIORITY_VERSION_CONFLICT',
          status: 409,
          messageAr: 'ترتيب الدفعات تغير، أعد تحميل الصفحة'
        });
      const batches = await models.RawMaterialBatch.find({ materialId }).session(tx.session);
      if (
        batches.length !== input.orderedBatchIds.length ||
        batches.some((batch) => !input.orderedBatchIds.includes(String(batch._id)))
      )
        throw new ApiError({
          code: 'BATCH_PRIORITY_SET_MISMATCH',
          status: 422,
          messageAr: 'يجب إرسال كل دفعات المادة مرة واحدة'
        });
      await Promise.all(
        batches.map((batch) => {
          batch.salePriority = input.orderedBatchIds.indexOf(String(batch._id)) + 1;
          return batch.save({ session: tx.session });
        })
      );
      material.priorityVersion += 1;
      await material.save({ session: tx.session });
      return {
        materialId: String(material._id),
        priorityVersion: material.priorityVersion,
        batches: batches.map((batch) => ({
          id: String(batch._id),
          salePriority: batch.salePriority
        }))
      };
    },
    context,
    context.transactionOptions
  );
}
