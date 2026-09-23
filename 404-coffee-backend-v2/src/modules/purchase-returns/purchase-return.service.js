import mongoose from 'mongoose';
import {
  compare,
  decimal,
  divide,
  multiply,
  roundMoney,
  toApiString,
  toDecimal128
} from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { RawMaterial, RawMaterialBatch, InventoryMovement } from '../inventory/inventory.models.js';
import { consumeFromBatch } from '../inventory/inventory.service.js';
import { PurchaseReturn, PurchaseReturnItem } from './purchase-return.models.js';
const defaults = {
  InventoryMovement,
  PurchaseReturn,
  PurchaseReturnItem,
  RawMaterial,
  RawMaterialBatch
};
const exitValue = (batch, quantity) =>
  compare(quantity, batch.remainingQuantitySmall) === 0
    ? decimal(batch.remainingInventoryValue)
    : roundMoney(
        multiply(divide(batch.remainingInventoryValue, batch.remainingQuantitySmall, 12), quantity)
      );
export async function validateReturnItems(inputs, context = {}) {
  const m = context.returnModels ?? defaults;
  const ids = inputs.map((i) => String(i.batchId));
  if (new Set(ids).size !== ids.length)
    throw new ApiError({
      code: 'DUPLICATE_RETURN_BATCH',
      status: 422,
      messageAr: 'الدفعة مكررة في المرتجع'
    });
  const batches = await m.RawMaterialBatch.find({ _id: { $in: ids } }).session(context.session);
  if (batches.length !== ids.length)
    throw new ApiError({
      code: 'RETURN_BATCH_NOT_FOUND',
      status: 404,
      messageAr: 'إحدى الدفعات غير موجودة'
    });
  const materials = await m.RawMaterial.find({
    _id: { $in: [...new Set(batches.map((b) => String(b.materialId)))] }
  }).session(context.session);
  const materialMap = new Map(materials.map((v) => [String(v._id), v]));
  return inputs.map((input) => {
    const batch = batches.find((v) => String(v._id) === String(input.batchId));
    if ((batch.version ?? 0) !== input.expectedBatchVersion)
      throw new ApiError({
        code: 'RETURN_BATCH_VERSION_CONFLICT',
        status: 409,
        messageAr: 'رصيد إحدى الدفعات تغير'
      });
    const material = materialMap.get(String(batch.materialId));
    if (!material)
      throw new ApiError({
        code: 'RETURN_MATERIAL_NOT_FOUND',
        status: 409,
        messageAr: 'مادة الدفعة غير موجودة'
      });
    const quantitySmall = multiply(input.quantityLarge, material.conversionFactor);
    if (compare(quantitySmall, batch.remainingQuantitySmall) > 0)
      throw new ApiError({
        code: 'RETURN_EXCEEDS_BATCH_STOCK',
        status: 409,
        messageAr: 'كمية المرتجع أكبر من رصيد الدفعة'
      });
    if (!decimal(quantitySmall).mod(decimal(material.smallQuantityStep)).isZero())
      throw new ApiError({
        code: 'RETURN_QUANTITY_STEP_MISMATCH',
        status: 422,
        messageAr: 'كمية المرتجع لا تطابق خطوة المادة'
      });
    const value = exitValue(batch, quantitySmall);
    return {
      input,
      batch,
      material,
      quantitySmall,
      value,
      unitCost: divide(value, quantitySmall, 12)
    };
  });
}
export async function createPurchaseReturn(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const m = context.returnModels ?? defaults;
      const plan = await validateReturnItems(input.items, { ...context, ...tx, returnModels: m });
      const seq = await nextSequence('purchase-return', { ...context, ...tx });
      const total = plan.reduce((sum, row) => decimal(sum).plus(row.value), '0');
      const [header] = await m.PurchaseReturn.create(
        [
          {
            returnNo: `RET-${String(seq).padStart(6, '0')}`,
            returnDate: input.returnDate,
            itemCount: plan.length,
            totalInventoryValue: toDecimal128(total),
            notes: input.notes,
            createdBy: context.actorId,
            returnedBy: context.actorId,
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      const itemRows = plan.map((row) => ({
        _id: new mongoose.Types.ObjectId(),
        returnId: header._id,
        materialId: row.material._id,
        batchId: row.batch._id,
        purchaseItemId: row.batch.purchaseReceiptItemId,
        materialSnapshot: row.batch.materialSnapshot ?? { name: row.material.name },
        batchSnapshot: {
          id: String(row.batch._id),
          batchNumber: row.batch.batchNumber,
          receivedOn: row.batch.receivedOn,
          expiryOn: row.batch.expiryOn
        },
        supplierSnapshot: row.batch.supplierSnapshot ?? { id: String(row.batch.supplierId) },
        quantityLarge: toDecimal128(row.input.quantityLarge),
        quantitySmall: toDecimal128(row.quantitySmall),
        unitCostSnapshot: toDecimal128(row.unitCost),
        totalInventoryValue: toDecimal128(row.value),
        reason: row.input.reason,
        createdBy: context.actorId
      }));
      const movements = [];
      for (let index = 0; index < plan.length; index += 1) {
        const row = plan[index],
          item = itemRows[index];
        const consumed = await consumeFromBatch(
          row.batch,
          row.quantitySmall,
          {
            kind: 'PURCHASE_RETURN',
            type: 'PURCHASE_RETURN_ITEM',
            id: item._id,
            occurredOn: input.returnDate,
            reason: row.input.reason
          },
          {
            ...context,
            ...tx,
            models: { ...context.inventoryModels, InventoryMovement: m.InventoryMovement }
          }
        );
        item.movementId = consumed.movement._id;
        await m.RawMaterial.updateOne(
          { _id: row.material._id },
          { $inc: { stockVersion: 1 } },
          { session: tx.session }
        );
        movements.push(consumed.movement);
      }
      const items = await m.PurchaseReturnItem.create(itemRows, { session: tx.session });
      await writeAudit(
        {
          eventType: 'PURCHASE_RETURN_CREATED',
          category: 'FINANCIAL',
          module: 'purchase-returns',
          action: 'CREATED',
          actor: { type: context.actorType, id: context.actorId },
          entity: { type: 'PurchaseReturn', id: header._id },
          result: 'SUCCESS',
          severity: 'INFO',
          metadataSafe: {
            itemCount: plan.length,
            totalInventoryValue: toApiString(total),
            returnDate: input.returnDate
          },
          requestId: context.requestId
        },
        { ...context, ...tx }
      );
      await enqueueDomainEvent(
        {
          aggregateType: 'PurchaseReturn',
          aggregateId: String(header._id),
          eventType: 'purchase-return.created',
          payload: {
            returnId: String(header._id),
            itemCount: plan.length,
            totalInventoryValue: toApiString(total)
          },
          sequence: 1
        },
        { ...context, ...tx }
      );
      return {
        return: header,
        items,
        movements,
        affectedMaterials: [...new Set(plan.map((row) => String(row.material._id)))]
      };
    },
    context,
    context.transactionOptions
  );
}
export const returnDto = (v) => ({
  id: String(v._id),
  returnNo: v.returnNo,
  status: v.status,
  returnDate: v.returnDate,
  currency: v.currency,
  itemCount: v.itemCount,
  totalInventoryValue: toApiString(v.totalInventoryValue),
  notes: v.notes ?? '',
  createdAt: v.createdAt,
  createdBy: v.createdBy ? String(v.createdBy) : null
});
export const returnItemDto = (v) => ({
  id: String(v._id),
  returnId: String(v.returnId),
  material: v.materialSnapshot,
  batch: v.batchSnapshot,
  supplier: v.supplierSnapshot,
  quantityLarge: toApiString(v.quantityLarge),
  quantitySmall: toApiString(v.quantitySmall),
  unitCost: toApiString(v.unitCostSnapshot),
  totalValue: toApiString(v.totalInventoryValue),
  reason: v.reason,
  movementId: v.movementId ? String(v.movementId) : null
});
