import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import { createBatchFromPurchase } from '../inventory/inventory.service.js';
import { PurchaseGroup, PurchaseItem, SupplierPurchaseInvoice } from './purchase.models.js';
const defaults = { PurchaseGroup, PurchaseItem, SupplierPurchaseInvoice };

async function recompute(groupId, models, context) {
  const items = await models.PurchaseItem.find({ groupId }).session(context.session);
  const registeredCount = items.filter((item) => item.status === 'REGISTERED').length;
  const group = await models.PurchaseGroup.findById(groupId).session(context.session);
  group.registeredCount = registeredCount;
  group.status =
    registeredCount === items.length
      ? 'REGISTERED'
      : registeredCount
        ? 'PARTIALLY_REGISTERED'
        : 'SPLIT';
  if (group.status === 'REGISTERED') {
    group.registeredAt = new Date();
    group.registeredBy = context.actorId;
  }
  await group.save({ session: context.session });
  const invoices = await models.SupplierPurchaseInvoice.find({ groupId }).session(context.session);
  for (const invoice of invoices) {
    const owned = items.filter((item) => String(item.supplierInvoiceId) === String(invoice._id));
    invoice.registeredCount = owned.filter((item) => item.status === 'REGISTERED').length;
    invoice.status =
      invoice.registeredCount === invoice.itemCount
        ? 'REGISTERED'
        : invoice.registeredCount
          ? 'PARTIALLY_REGISTERED'
          : 'UNREGISTERED';
    await invoice.save({ session: context.session });
  }
  return { group, invoices };
}

async function registerOne(itemId, input, models, context) {
  const item = await models.PurchaseItem.findOne({
    _id: itemId,
    version: input.expectedVersion,
    status: 'PENDING'
  }).session(context.session);
  if (!item)
    throw new ApiError({
      code: 'PURCHASE_ITEM_ALREADY_REGISTERED_OR_STALE',
      status: 409,
      messageAr: 'العنصر مسجل بالفعل أو تم تعديله'
    });
  const group = await models.PurchaseGroup.findOne({
    _id: item.groupId,
    status: { $in: ['SPLIT', 'PARTIALLY_REGISTERED'] },
    splitOutdated: false,
    deletedAt: null
  }).session(context.session);
  if (!group || !item.supplierInvoiceId)
    throw new ApiError({
      code: 'PURCHASE_SPLIT_REQUIRED',
      status: 409,
      messageAr: 'يجب تقسيم الفاتورة حسب المورد أولًا'
    });
  const batchSeq = await nextSequence('raw-material-batch', context);
  const registerBatch = context.inventoryPort?.createBatch ?? createBatchFromPurchase;
  const inventory = await registerBatch(
    {
      materialId: item.materialId,
      supplierId: item.supplierId,
      supplierSnapshot: item.supplierSnapshot,
      purchaseReceiptItemId: item._id,
      batchNumber: `BAT-${String(batchSeq).padStart(7, '0')}`,
      quantityLarge: item.quantityLarge.toString(),
      largeUnitPrice: item.largeUnitPrice.toString(),
      receivedOn: input.receivedOn,
      expiryOn: input.expiryOn
    },
    { ...context, models: context.inventoryModels }
  );
  item.status = 'REGISTERED';
  item.batchId = inventory.batch._id;
  item.movementId = inventory.movement._id;
  item.receivedOn = input.receivedOn;
  item.expiryOn = input.expiryOn;
  item.registeredAt = new Date();
  item.registeredBy = context.actorId;
  await item.save({ session: context.session });
  return { item, batch: inventory.batch, movement: inventory.movement };
}

export async function registerPurchaseItem(itemId, input, context = {}) {
  const result = await runInTransaction(
    async (tx) => {
      const models = context.purchaseModels ?? defaults;
      const registered = await registerOne(itemId, input, models, { ...context, ...tx });
      const statuses = await recompute(registered.item.groupId, models, { ...context, ...tx });
      return {
        ...registered,
        group: statuses.group,
        supplierInvoice: statuses.invoices.find(
          (i) => String(i._id) === String(registered.item.supplierInvoiceId)
        )
      };
    },
    context,
    context.transactionOptions
  );
  const warningsSummary = context.warningsPort?.getSummary
    ? await context.warningsPort.getSummary(context)
    : null;
  return { ...result, warningsSummary };
}
export async function registerPurchaseItems(groupId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.purchaseModels ?? defaults;
      const group = await models.PurchaseGroup.findOne({
        _id: groupId,
        version: input.expectedVersion,
        status: { $in: ['SPLIT', 'PARTIALLY_REGISTERED'] },
        splitOutdated: false,
        deletedAt: null
      }).session(tx.session);
      if (!group)
        throw new ApiError({
          code: 'PURCHASE_GROUP_REGISTRATION_CONFLICT',
          status: 409,
          messageAr: 'الفاتورة تغيرت أو غير جاهزة للتسجيل'
        });
      const owned = await models.PurchaseItem.countDocuments({
        _id: { $in: input.items.map((i) => i.purchaseItemId) },
        groupId
      });
      if (owned !== input.items.length)
        throw new ApiError({
          code: 'PURCHASE_ITEMS_GROUP_MISMATCH',
          status: 422,
          messageAr: 'أحد العناصر لا يتبع الفاتورة'
        });
      const registered = [];
      for (const item of input.items)
        registered.push(
          await registerOne(
            item.purchaseItemId,
            {
              receivedOn: item.receivedOn,
              expiryOn: item.expiryOn,
              expectedVersion: item.expectedItemVersion
            },
            models,
            { ...context, ...tx }
          )
        );
      const statuses = await recompute(groupId, models, { ...context, ...tx });
      return { registered, group: statuses.group };
    },
    context,
    context.transactionOptions
  );
}
export { recompute as recomputePurchaseStatuses };
