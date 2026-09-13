import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    actorId: { type: String, required: true },
    scope: { type: String, required: true },
    key: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: { type: String, enum: ['PROCESSING', 'COMPLETED', 'FAILED'], required: true },
    responseStatus: Number,
    responsePayload: mongoose.Schema.Types.Mixed,
    errorSnapshot: mongoose.Schema.Types.Mixed,
    leaseUntil: { type: Date, required: true },
    completedAt: Date,
    failedAt: Date
  },
  { timestamps: true, versionKey: false }
);
schema.index({ actorId: 1, scope: 1, key: 1 }, { unique: true });
schema.index({ status: 1, leaseUntil: 1 });

export const OperationRequest =
  mongoose.models.OperationRequest ?? mongoose.model('OperationRequest', schema);
