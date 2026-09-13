import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { PurchaseGroup, PurchaseItem, SupplierPurchaseInvoice } from './purchase.models.js';
import { groupDto, itemDto } from './purchase.service.js';
import { invoiceDto } from './purchase-split.service.js';
const defaults = { PurchaseGroup, PurchaseItem, SupplierPurchaseInvoice };
export async function getPurchasesScreen(filters = {}, context = {}) {
  const m = context.purchaseModels ?? defaults;
  const { page, limit } = parsePage(filters),
    { skip } = buildSkipLimit({ page, limit });
  const status =
    filters.tab === 'registered'
      ? ['REGISTERED']
      : filters.tab === 'all'
        ? ['DRAFT', 'SPLIT', 'PARTIALLY_REGISTERED', 'REGISTERED']
        : ['DRAFT', 'SPLIT', 'PARTIALLY_REGISTERED'];
  const match = { status: { $in: status }, deletedAt: null };
  const [groups, totalItems, summary] = await Promise.all([
    m.PurchaseGroup.find(match).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    m.PurchaseGroup.countDocuments(match),
    m.PurchaseGroup.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);
  const counts = Object.fromEntries(summary.map((i) => [i._id, i.count]));
  return {
    summary: {
      draft: counts.DRAFT ?? 0,
      split: counts.SPLIT ?? 0,
      partiallyRegistered: counts.PARTIALLY_REGISTERED ?? 0,
      registered: counts.REGISTERED ?? 0
    },
    groups: groups.map(groupDto),
    filters: { tabs: ['unregistered', 'registered', 'all'] },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}
export async function getPurchaseGroupDetails(id, context = {}) {
  const m = context.purchaseModels ?? defaults;
  const group = await m.PurchaseGroup.findOne({ _id: id, deletedAt: null }).lean();
  if (!group)
    throw new ApiError({
      code: 'PURCHASE_GROUP_NOT_FOUND',
      status: 404,
      messageAr: 'فاتورة المشتريات غير موجودة'
    });
  const [items, invoices] = await Promise.all([
    m.PurchaseItem.find({ groupId: id }).sort({ _id: 1 }).lean(),
    m.SupplierPurchaseInvoice.find({ groupId: id, splitVersion: group.splitVersion })
      .sort({ invoiceNo: 1 })
      .lean()
  ]);
  return {
    group: groupDto(group),
    items: items.map(itemDto),
    supplierInvoices: invoices.map(invoiceDto),
    totals: { subtotal: groupDto(group).subtotal, currency: group.currency }
  };
}
export async function getPurchaseGroupPrintData(id, context = {}) {
  const data = await getPurchaseGroupDetails(id, context);
  return {
    documentType: 'PURCHASE_GROUP',
    number: data.group.groupNo,
    status: data.group.status,
    dates: { invoiceDate: data.group.invoiceDate },
    items: data.items,
    totals: data.totals,
    actors: {},
    generatedAt: new Date().toISOString()
  };
}
export async function getSupplierInvoicePrintData(id, context = {}) {
  const m = context.purchaseModels ?? defaults;
  const invoice = await m.SupplierPurchaseInvoice.findById(id).lean();
  if (!invoice)
    throw new ApiError({
      code: 'SUPPLIER_INVOICE_NOT_FOUND',
      status: 404,
      messageAr: 'فاتورة المورد غير موجودة'
    });
  const items = await m.PurchaseItem.find({ supplierInvoiceId: id }).sort({ _id: 1 }).lean();
  return {
    documentType: 'SUPPLIER_PURCHASE_INVOICE',
    number: invoice.invoiceNo,
    status: invoice.status,
    dates: { createdAt: invoice.createdAt },
    supplier: invoice.supplierSnapshot,
    items: items.map(itemDto),
    totals: { subtotal: invoiceDto(invoice).subtotal, currency: invoice.currency },
    actors: { createdBy: invoice.createdBy ? String(invoice.createdBy) : null },
    generatedAt: new Date().toISOString()
  };
}
