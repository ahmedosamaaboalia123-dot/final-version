import mongoose from 'mongoose';

const dailySchema = new mongoose.Schema(
  {
    period: { type: String, required: true, unique: true },
    metrics: { type: mongoose.Schema.Types.Mixed, required: true },
    sourceVersions: { type: mongoose.Schema.Types.Mixed, required: true },
    dataQuality: { type: String, enum: ['COMPLETE', 'ERROR'], required: true },
    failedSources: [String],
    generatedAt: { type: Date, required: true }
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);

export const DashboardDaily =
  mongoose.models.DashboardDaily ?? mongoose.model('DashboardDaily', dailySchema);
