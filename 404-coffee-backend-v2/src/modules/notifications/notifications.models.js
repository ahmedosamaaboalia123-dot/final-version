import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    recipientEmployeeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, required: true },
    severity: {
      type: String,
      enum: ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'],
      required: true,
      default: 'INFO'
    },
    title: { type: String, required: true },
    message: String,
    entityType: String,
    entityId: String,
    link: String,
    deduplicationKey: { type: String, required: true },
    readAt: Date,
    archivedAt: Date,
    metadataSafe: mongoose.Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
schema.index({ recipientEmployeeId: 1, deduplicationKey: 1 }, { unique: true });
schema.index({ recipientEmployeeId: 1, readAt: 1, createdAt: -1, _id: -1 });

export const Notification = mongoose.models.Notification ?? mongoose.model('Notification', schema);
