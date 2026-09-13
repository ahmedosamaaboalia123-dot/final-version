import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    eventNo: { type: Number, required: true, unique: true },
    eventType: { type: String, required: true },
    category: { type: String, required: true },
    module: { type: String, required: true },
    pageKey: String,
    action: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.Mixed, required: true },
    subject: mongoose.Schema.Types.Mixed,
    entity: { type: mongoose.Schema.Types.Mixed, required: true },
    relatedEntities: [mongoose.Schema.Types.Mixed],
    statusBefore: String,
    statusAfter: String,
    changesSafe: mongoose.Schema.Types.Mixed,
    financialContext: mongoose.Schema.Types.Mixed,
    inventoryContext: mongoose.Schema.Types.Mixed,
    reason: String,
    result: { type: String, required: true },
    severity: { type: String, required: true },
    errorSafe: mongoose.Schema.Types.Mixed,
    requestId: String,
    correlationId: String,
    causationId: String,
    idempotencyKeyHash: String,
    sessionId: String,
    deviceId: String,
    ip: String,
    userAgent: String,
    route: String,
    method: String,
    responseStatus: Number,
    durationMs: Number,
    source: String,
    businessDate: String,
    metadataSafe: mongoose.Schema.Types.Mixed,
    previousHash: String,
    integrityHash: String,
    occurredAt: { type: Date, required: true, default: Date.now },
    schemaVersion: { type: Number, required: true, default: 1 }
  },
  { timestamps: true, versionKey: false }
);
schema.index({ module: 1, occurredAt: -1, _id: -1 });
schema.index({ 'entity.type': 1, 'entity.id': 1, occurredAt: -1 });
schema.index({ 'actor.id': 1, occurredAt: -1, _id: -1 });
schema.index({ requestId: 1 });

export const AuditEvent = mongoose.models.AuditEvent ?? mongoose.model('AuditEvent', schema);
