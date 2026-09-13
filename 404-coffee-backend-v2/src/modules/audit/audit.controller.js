import { sendAccepted, sendSuccess } from '../../platform/http/response.js';
import { getAuditEvent, getAuditScreen, getEntityTimeline } from './audit.queries.js';
import { getReportExportStatus, requestReportExport } from '../reports/reports.public-service.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createAuditController(d) {
  return {
    screen: async (r, s) => sendSuccess(s, await getAuditScreen(r.validated.query, ctx(r, d))),
    details: async (r, s) => sendSuccess(s, await getAuditEvent(r.validated.params.id, ctx(r, d))),
    timeline: async (r, s) =>
      sendSuccess(
        s,
        await getEntityTimeline(
          r.validated.params.entityType,
          r.validated.params.entityId,
          r.validated.query,
          ctx(r, d)
        )
      ),
    export: async (r, s) => {
      const result = await requestReportExport(
        {
          reportType: 'audit:events',
          filters: r.validated.body.filters,
          format: r.validated.body.format
        },
        ctx(r, d)
      );
      return sendAccepted(s, result);
    },
    exportStatus: async (r, s) =>
      sendSuccess(s, await getReportExportStatus(r.validated.params.id, ctx(r, d)))
  };
}
