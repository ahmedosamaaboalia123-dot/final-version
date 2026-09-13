import mongoose from 'mongoose';

const cacheSchema = new mongoose.Schema(
  {
    cacheKey: { type: String, required: true, unique: true },
    reportType: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    sourceVersions: { type: mongoose.Schema.Types.Mixed, required: true },
    generatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true, versionKey: false }
);
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const exportSchema = new mongoose.Schema(
  {
    exportNo: { type: String, required: true, unique: true },
    reportType: { type: String, required: true },
    filtersSafe: { type: mongoose.Schema.Types.Mixed, required: true },
    format: { type: String, enum: ['PDF', 'XLSX', 'CSV'], required: true },
    status: {
      type: String,
      enum: ['QUEUED', 'PROCESSING', 'READY', 'FAILED'],
      required: true,
      default: 'QUEUED'
    },
    requestedBy: mongoose.Schema.Types.ObjectId,
    requestedAt: { type: Date, required: true, default: Date.now },
    completedAt: Date,
    rowCount: { type: Number, default: 0 },
    checksum: String,
    resultInline: mongoose.Schema.Types.Mixed,
    errorCode: String,
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
exportSchema.index({ status: 1, requestedAt: 1, _id: 1 });

export const FinancialReportCache =
  mongoose.models.FinancialReportCache ?? mongoose.model('FinancialReportCache', cacheSchema);
export const ReportExport =
  mongoose.models.ReportExport ?? mongoose.model('ReportExport', exportSchema);
