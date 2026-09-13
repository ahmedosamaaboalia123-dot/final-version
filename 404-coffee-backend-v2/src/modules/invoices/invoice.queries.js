import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { InvoiceSnapshot } from './invoice.model.js';
const dto = (i) => ({
  id: String(i._id),
  invoiceNumber: i.invoiceNumber,
  orderId: String(i.orderId),
  revision: i.revision,
  channel: i.channel,
  fulfillmentType: i.fulfillmentType,
  status: i.status,
  totals: i.totals,
  finalizedAt: i.finalizedAt,
  checksum: i.checksum,
  printCount: i.printCount,
  lastPrintedAt: i.lastPrintedAt ?? null
});
export async function listInvoices(filters = {}, context = {}) {
  const model = context.invoiceModel ?? InvoiceSnapshot,
    { page, limit } = parsePage(filters),
    { skip } = buildSkipLimit({ page, limit }),
    q = {};
  if (filters.channel) q.channel = filters.channel;
  if (filters.status) q.status = filters.status;
  if (filters.from || filters.to)
    q.finalizedAt = {
      ...(filters.from ? { $gte: new Date(filters.from) } : {}),
      ...(filters.to ? { $lte: new Date(filters.to) } : {})
    };
  if (filters.search)
    q.invoiceNumber = {
      $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i'
    };
  const [rows, totalItems, finalCount, cancelledCount] = await Promise.all([
    model.find(q).sort({ finalizedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(q),
    model.countDocuments({ ...q, status: 'FINAL' }),
    model.countDocuments({ ...q, status: 'CANCELLED' })
  ]);
  return {
    items: rows.map(dto),
    summary: { total: totalItems, final: finalCount, cancelled: cancelledCount },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { finalizedAt: -1 } })
  };
}
export async function getInvoice(id, context = {}) {
  const model = context.invoiceModel ?? InvoiceSnapshot,
    invoice = await model.findById(id).lean();
  if (!invoice)
    throw new ApiError({
      code: 'INVOICE_NOT_FOUND',
      status: 404,
      messageAr: 'الفاتورة غير موجودة'
    });
  return { invoice: { ...dto(invoice), payload: invoice.payloadSafe } };
}
