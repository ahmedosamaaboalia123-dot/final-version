import { DateTime } from 'luxon';
import { add, multiply, toApiString, toDecimal128 } from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import { MeasurementUnit, RawMaterial } from '../inventory/inventory.models.js';
import { Supplier } from '../suppliers/supplier.models.js';
import { PurchaseGroup, PurchaseItem, SupplierPurchaseInvoice } from './purchase.models.js';
const defaults = {
  MeasurementUnit,
  PurchaseGroup,
  PurchaseItem,
  RawMaterial,
  SupplierPurchaseInvoice,
  Supplier
};
const number = (prefix, n) => `${prefix}-${String(n).padStart(6, '0')}`;
async function prepareItems(inputs, models, context) {
  const ids = inputs.map((i) => String(i.materialId));
  if (new Set(ids).size !== ids.length)
    throw new ApiError({
      code: 'DUPLICATE_PURCHASE_MATERIAL',
      status: 422,
      messageAr: 'المادة الخام مكررة في الفاتورة'
    });
  const materials = await models.RawMaterial.find({ _id: { $in: ids } }).session(
    context.session
  );
  if (materials.length !== ids.length)
    throw new ApiError({
      code: 'INVALID_PURCHASE_MATERIAL',
      status: 422,
      messageAr: 'إحدى المواد غير موجودة'
    });
  const units = await models.MeasurementUnit.find({
    _id: { $in: materials.map((m) => m.largeUnitId) }
  }).session(context.session);
  const unitMap = new Map(units.map((u) => [String(u._id), u]));
  const suppliers = await models.Supplier.find({
    _id: { $in: [...new Set(materials.map((item) => String(item.supplierId)))] }
  }).session(context.session);
  const supplierMap = new Map(suppliers.map((item) => [String(item._id), item]));
  return inputs.map((input) => {
    const material = materials.find((m) => String(m._id) === String(input.materialId));
    const unit = unitMap.get(String(material.largeUnitId));
    const supplier = supplierMap.get(String(material.supplierId));
    if (!unit)
      throw new ApiError({
        code: 'PURCHASE_UNIT_MISSING',
        status: 409,
        messageAr: 'وحدة شراء المادة غير موجودة'
      });
    if (!supplier)
      throw new ApiError({
        code: 'PURCHASE_SUPPLIER_NOT_FOUND',
        status: 422,
        messageAr: 'مورد إحدى المواد غير موجود'
      });
    const quantitySmall = multiply(input.quantityLarge, material.conversionFactor);
    const lineTotal = multiply(input.quantityLarge, input.largeUnitPrice);
    return {
      materialId: material._id,
      supplierId: material.supplierId,
      materialSnapshot: {
        id: String(material._id),
        name: material.name,
        conversionFactor: toApiString(material.conversionFactor)
      },
      supplierSnapshot: {
        id: String(material.supplierId),
        name: supplier.name,
        phone: supplier.phone ?? ''
      },
      unitSnapshot: { id: String(unit._id), name: unit.nameAr },
      lastBatchPriceSnapshot: material.referenceLargeUnitPrice,
      quantityLarge: toDecimal128(input.quantityLarge),
      quantitySmall: toDecimal128(quantitySmall),
      largeUnitPrice: toDecimal128(input.largeUnitPrice),
      lineTotal: toDecimal128(lineTotal)
    };
  });
}
export async function createPurchaseGroup(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const m = context.purchaseModels ?? defaults;
      const rows = await prepareItems(input.items, m, { ...context, ...tx });
      const seq = await nextSequence('purchase-group', { ...context, ...tx });
      const subtotal = rows.reduce((sum, row) => add(sum, row.lineTotal), '0');
      const [group] = await m.PurchaseGroup.create(
        [
          {
            groupNo: number('PUR', seq),
            invoiceDate: input.invoiceDate ?? DateTime.now().setZone('Africa/Cairo').toISODate(),
            subtotal: toDecimal128(subtotal),
            itemCount: rows.length,
            createdBy: context.actorId
          }
        ],
        { session: tx.session }
      );
      const items = await m.PurchaseItem.create(
        rows.map((row) => ({ ...row, groupId: group._id })),
        { session: tx.session }
      );
      return { group, items };
    },
    context,
    context.transactionOptions
  );
}
export async function updatePurchaseGroup(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const m = context.purchaseModels ?? defaults;
      const group = await m.PurchaseGroup.findOne({
        _id: id,
        version: input.expectedVersion,
        deletedAt: null,
        status: { $in: ['DRAFT', 'SPLIT'] }
      }).session(tx.session);
      if (!group)
        throw new ApiError({
          code: 'PURCHASE_GROUP_NOT_EDITABLE',
          status: 409,
          messageAr: 'الفاتورة غير موجودة أو بدأ تسجيلها أو تم تعديلها'
        });
      const registered = await m.PurchaseItem.exists({ groupId: id, status: 'REGISTERED' }).session(
        tx.session
      );
      if (registered)
        throw new ApiError({
          code: 'PURCHASE_ALREADY_REGISTERED',
          status: 409,
          messageAr: 'لا يمكن تعديل الفاتورة بعد أول تسجيل'
        });
      const rows = await prepareItems(input.items, m, { ...context, ...tx });
      await m.PurchaseItem.deleteMany({ groupId: id }, { session: tx.session });
      await m.SupplierPurchaseInvoice.deleteMany({ groupId: id }, { session: tx.session });
      const items = await m.PurchaseItem.create(
        rows.map((row) => ({ ...row, groupId: id })),
        { session: tx.session }
      );
      group.invoiceDate = input.invoiceDate ?? group.invoiceDate;
      group.itemCount = rows.length;
      group.registeredCount = 0;
      group.subtotal = toDecimal128(rows.reduce((sum, row) => add(sum, row.lineTotal), '0'));
      group.status = 'DRAFT';
      group.splitOutdated = true;
      group.updatedBy = context.actorId;
      await group.save({ session: tx.session });
      return { group, items, splitOutdated: true };
    },
    context,
    context.transactionOptions
  );
}
export async function deleteDraftPurchaseGroup(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const m = context.purchaseModels ?? defaults;
      const group = await m.PurchaseGroup.findOne({
        _id: id,
        version: input.expectedVersion,
        status: 'DRAFT',
        deletedAt: null
      }).session(tx.session);
      if (!group)
        throw new ApiError({
          code: 'PURCHASE_GROUP_NOT_DELETABLE',
          status: 409,
          messageAr: 'يمكن حذف الفاتورة المسودة فقط'
        });
      group.deletedAt = new Date();
      group.deletedBy = context.actorId;
      await group.save({ session: tx.session });
      return { deleted: true, groupNo: group.groupNo };
    },
    context,
    context.transactionOptions
  );
}
export const groupDto = (g) => ({
  id: String(g._id),
  groupNo: g.groupNo,
  invoiceDate: g.invoiceDate,
  status: g.status,
  currency: g.currency,
  itemCount: g.itemCount,
  registeredCount: g.registeredCount,
  subtotal: toApiString(g.subtotal),
  splitVersion: g.splitVersion,
  splitOutdated: g.splitOutdated,
  version: g.version ?? 0
});
export const itemDto = (i) => ({
  id: String(i._id),
  groupId: String(i.groupId),
  supplierInvoiceId: i.supplierInvoiceId ? String(i.supplierInvoiceId) : null,
  material: i.materialSnapshot,
  supplier: i.supplierSnapshot,
  unit: i.unitSnapshot,
  lastBatchPrice: i.lastBatchPriceSnapshot ? toApiString(i.lastBatchPriceSnapshot) : null,
  quantityLarge: toApiString(i.quantityLarge),
  quantitySmall: toApiString(i.quantitySmall),
  largeUnitPrice: toApiString(i.largeUnitPrice),
  lineTotal: toApiString(i.lineTotal),
  status: i.status,
  batchId: i.batchId ? String(i.batchId) : null,
  movementId: i.movementId ? String(i.movementId) : null,
  receivedOn: i.receivedOn ?? null,
  expiryOn: i.expiryOn ?? null,
  version: i.version ?? 0
});
