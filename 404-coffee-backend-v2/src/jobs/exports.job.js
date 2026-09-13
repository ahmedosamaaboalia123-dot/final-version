import { processReportExport } from '../modules/reports/reports.public-service.js';
import { ReportExport } from '../modules/reports/reports.models.js';

const SWEEP_LIMIT = 5;

export async function tickReportExports(context = {}) {
  const models = context.exportsJobsModels ?? { ReportExport };
  const process = context.exportsJobsPort?.process ?? processReportExport;
  const queued = await models.ReportExport.find({ status: 'QUEUED' })
    .sort({ requestedAt: 1, _id: 1 })
    .limit(SWEEP_LIMIT)
    .lean();
  let processed = 0;
  let failed = 0;
  for (const job of queued) {
    try {
      await process(job._id, context);
      processed += 1;
    } catch (error) {
      failed += 1;
      await models.ReportExport.findByIdAndUpdate(job._id, {
        $set: {
          status: 'FAILED',
          errorCode: error?.code ?? 'EXPORT_FAILED',
          completedAt: context.now ?? new Date()
        }
      }).catch(() => null);
    }
  }
  return { queued: queued.length, processed, failed };
}
