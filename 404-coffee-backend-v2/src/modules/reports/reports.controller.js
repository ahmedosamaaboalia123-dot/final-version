import { sendAccepted, sendSuccess } from '../../platform/http/response.js';
import {
  getDelegateReport,
  getDrawerReport,
  getFinancialReportScreen,
  getInventoryReport,
  getReportExportStatus,
  getSalesReport,
  getSupplierReport,
  requestReportExport
} from './reports.service.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createReportsController(d) {
  return {
    screen: async (r, s) =>
      sendSuccess(s, await getFinancialReportScreen(r.validated.query, ctx(r, d))),
    sales: async (r, s) => sendSuccess(s, await getSalesReport(r.validated.query, ctx(r, d))),
    inventory: async (r, s) =>
      sendSuccess(s, await getInventoryReport(r.validated.query, ctx(r, d))),
    drawer: async (r, s) => sendSuccess(s, await getDrawerReport(r.validated.query, ctx(r, d))),
    suppliers: async (r, s) =>
      sendSuccess(s, await getSupplierReport(r.validated.query, ctx(r, d))),
    delegates: async (r, s) =>
      sendSuccess(s, await getDelegateReport(r.validated.query, ctx(r, d))),
    export: async (r, s) => {
      const result = await requestReportExport(r.validated.body, ctx(r, d));
      return sendAccepted(s, result);
    },
    exportStatus: async (r, s) =>
      sendSuccess(s, await getReportExportStatus(r.validated.params.id, ctx(r, d)))
  };
}
