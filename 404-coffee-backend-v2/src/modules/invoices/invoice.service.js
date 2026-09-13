import crypto from 'node:crypto';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { redactSensitive } from '../../platform/observability/redact.js';
import { InvoiceSnapshot } from './invoice.model.js';
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])])
    );
  return value;
}
export function calculateInvoiceChecksum(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonical(payload)))
    .digest('hex');
}
function orders(context) {
  if (!context.ordersPort?.getInvoicePayload)
    throw new ApiError({
      code: 'ORDERS_PORT_UNAVAILABLE',
      status: 503,
      messageAr: 'خدمة الطلبات غير متاحة'
    });
  return context.ordersPort;
}
export async function buildInvoicePreview(orderId, context = {}) {
  const payload = redactSensitive(
    await orders(context).getInvoicePayload(orderId, { ...context, preview: true })
  );
  return { payload, checksum: calculateInvoiceChecksum(payload), final: false };
}
export async function finalizeInvoice(orderId, context = {}) {
  return runInTransaction(
    async (tx) => {
      const model = context.invoiceModel ?? InvoiceSnapshot,
        existing = await model.findOne({ orderId }).session(tx.session);
      if (existing) return { invoice: existing, alreadyFinalized: true };
      const payload = redactSensitive(
        await orders(context).getInvoicePayload(orderId, { ...context, ...tx, preview: false })
      );
      if (
        !payload.order?.status ||
        !['READY', 'OUT_FOR_DELIVERY', 'COMPLETED'].includes(payload.order.status)
      )
        throw new ApiError({
          code: 'ORDER_NOT_INVOICEABLE',
          status: 409,
          messageAr: 'حالة الطلب لا تسمح بإنهاء الفاتورة'
        });
      const sequence = await nextSequence('invoice', { ...context, ...tx });
      const checksum = calculateInvoiceChecksum(payload);
      const [invoice] = await model.create(
        [
          {
            invoiceNumber: `INV-${String(sequence).padStart(8, '0')}`,
            orderId,
            tableSessionId: payload.order.tableSessionId,
            revision: payload.order.invoiceRevision ?? 1,
            channel: payload.order.channel,
            fulfillmentType: payload.order.fulfillmentType,
            payloadSafe: payload,
            totals: payload.totals,
            finalizedBy: context.actorId,
            checksum
          }
        ],
        { session: tx.session }
      );
      await writeAudit(
        {
          eventType: 'INVOICE_FINALIZED',
          category: 'FINANCIAL',
          module: 'invoices',
          action: 'FINALIZED',
          actor: { type: context.actorType, id: context.actorId },
          entity: { type: 'InvoiceSnapshot', id: invoice._id },
          result: 'SUCCESS',
          severity: 'INFO',
          metadataSafe: { invoiceNumber: invoice.invoiceNumber, checksum },
          requestId: context.requestId
        },
        { ...context, ...tx }
      );
      await enqueueDomainEvent(
        {
          aggregateType: 'InvoiceSnapshot',
          aggregateId: String(invoice._id),
          eventType: 'invoice.finalized',
          payload: {
            invoiceId: String(invoice._id),
            orderId: String(orderId),
            invoiceNumber: invoice.invoiceNumber
          },
          sequence: 1
        },
        { ...context, ...tx }
      );
      return { invoice, alreadyFinalized: false };
    },
    context,
    context.transactionOptions
  );
}
export async function recordInvoicePrint(invoiceId, context = {}) {
  return runInTransaction(
    async (tx) => {
      const model = context.invoiceModel ?? InvoiceSnapshot;
      const invoice = await model.findOneAndUpdate(
        { _id: invoiceId, status: 'FINAL' },
        {
          $inc: { printCount: 1 },
          $set: { lastPrintedAt: context.now ?? new Date(), lastPrintedBy: context.actorId }
        },
        { new: true, session: tx.session }
      );
      if (!invoice)
        throw new ApiError({
          code: 'INVOICE_NOT_FOUND',
          status: 404,
          messageAr: 'الفاتورة غير موجودة'
        });
      await writeAudit(
        {
          eventType: 'INVOICE_PRINTED',
          category: 'BUSINESS',
          module: 'invoices',
          action: 'PRINTED',
          actor: { type: context.actorType, id: context.actorId },
          entity: { type: 'InvoiceSnapshot', id: invoice._id },
          result: 'SUCCESS',
          severity: 'INFO',
          metadataSafe: { printCount: invoice.printCount },
          requestId: context.requestId
        },
        { ...context, ...tx }
      );
      return invoice;
    },
    context,
    context.transactionOptions
  );
}
