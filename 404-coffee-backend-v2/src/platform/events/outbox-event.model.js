import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    aggregateType: { type: String, required: true },
    aggregateId: { type: String, required: true },
    eventType: { type: String, required: true },
    sequence: { type: Number, required: true },
    auditEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuditEvent' },
    payloadSafe: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD'],
      default: 'PENDING'
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseOwner: String,
    leaseUntil: Date,
    publishedAt: Date,
    lastErrorSafe: mongoose.Schema.Types.Mixed
  },
  { timestamps: true, versionKey: false }
);
schema.index({ aggregateType: 1, aggregateId: 1, sequence: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });

export const OutboxEvent = mongoose.models.OutboxEvent ?? mongoose.model('OutboxEvent', schema);
