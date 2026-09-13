import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { getInvoice, listInvoices } from './invoice.queries.js';
import { buildInvoicePreview, finalizeInvoice, recordInvoicePrint } from './invoice.service.js';
const c = (r, d) => ({ ...r.auth, ...d.serviceContext });
export function createInvoiceController(d) {
  return {
    list: async (r, s) => sendSuccess(s, await listInvoices(r.validated.query, c(r, d))),
    details: async (r, s) => sendSuccess(s, await getInvoice(r.validated.params.id, c(r, d))),
    preview: async (r, s) =>
      sendSuccess(s, await buildInvoicePreview(r.validated.params.id, c(r, d))),
    finalize: async (r, s) => sendCreated(s, await finalizeInvoice(r.validated.params.id, c(r, d))),
    print: async (r, s) => sendSuccess(s, await getInvoice(r.validated.params.id, c(r, d))),
    printEvent: async (r, s) => {
      const invoice = await recordInvoicePrint(r.validated.params.id, c(r, d));
      return sendSuccess(s, {
        invoice: {
          id: String(invoice._id),
          invoiceNumber: invoice.invoiceNumber,
          payload: invoice.payloadSafe,
          checksum: invoice.checksum,
          printCount: invoice.printCount
        }
      });
    }
  };
}
