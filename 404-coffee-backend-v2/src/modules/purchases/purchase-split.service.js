import { add, toApiString, toDecimal128 } from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import { PurchaseGroup, PurchaseItem, SupplierPurchaseInvoice } from './purchase.models.js';
const defaults = { PurchaseGroup, PurchaseItem, SupplierPurchaseInvoice };
export const invoiceDto = (v) => ({
  id: String(v._id),
  groupId: String(v.groupId),
  invoiceNo: v.invoiceNo,
  supplier: v.supplierSnapshot,
  status: v.status,
  itemCount: v.itemCount,
  registeredCount: v.registeredCount,
  subtotal: toApiString(v.subtotal),
  currency: v.currency,
  splitVersion: v.splitVersion,
  version: v.version ?? 0
});
export async function splitPurchaseGroupBySupplier(groupId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const m = context.purchaseModels ?? defaults;
      const group = await m.PurchaseGroup.findOne({
        _id: groupId,
        version: input.expectedVersion,
        deletedAt: null,
        status: { $in: ['DRAFT', 'SPLIT'] }
      }).session(tx.session);
      if (!group)
        throw new ApiError({
          code: 'PURCHASE_SPLIT_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الفاتورة تغيرت أو بدأ تسجيلها'
        });
      if (await m.PurchaseItem.exists({ groupId, status: 'REGISTERED' }).session(tx.session))
        throw new ApiError({
          code: 'PURCHASE_SPLIT_AFTER_REGISTRATION',
          status: 409,
          messageAr: 'لا يمكن إعادة التقسيم بعد التسجيل'
        });
      const items = await m.PurchaseItem.find({ groupId }).session(tx.session);
      if (!items.length)
        throw new ApiError({
          code: 'EMPTY_PURCHASE_GROUP',
          status: 409,
          messageAr: 'الفاتورة بلا عناصر'
        });
      await m.SupplierPurchaseInvoice.deleteMany({ groupId }, { session: tx.session });
      const nextVersion = group.splitVersion + 1;
      const buckets = new Map();
      for (const item of items) {
        const key = String(item.supplierId);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(item);
      }
      const invoices = [];
      for (const bucket of buckets.values()) {
        const seq = await nextSequence('supplier-purchase-invoice', { ...context, ...tx });
        const [invoice] = await m.SupplierPurchaseInvoice.create(
          [
            {
              groupId,
              supplierId: bucket[0].supplierId,
              supplierSnapshot: bucket[0].supplierSnapshot,
              invoiceNo: `SPI-${String(seq).padStart(6, '0')}`,
              itemCount: bucket.length,
              subtotal: toDecimal128(bucket.reduce((sum, item) => add(sum, item.lineTotal), '0')),
              splitVersion: nextVersion,
              createdBy: context.actorId
            }
          ],
          { session: tx.session }
        );
        for (const item of bucket) {
          item.supplierInvoiceId = invoice._id;
          await item.save({ session: tx.session });
        }
        invoices.push(invoice);
      }
      group.status = 'SPLIT';
      group.splitVersion = nextVersion;
      group.splitOutdated = false;
      await group.save({ session: tx.session });
      return { group, supplierInvoices: invoices };
    },
    context,
    context.transactionOptions
  );
}
