import mongoose from 'mongoose';

const requestSchema = new mongoose.Schema(
  {
    serviceRequestNumber: { type: String, required: true, unique: true },
    tableId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tableNumberSnapshot: { type: Number, required: true, min: 1, max: 20 },
    tableSessionId: mongoose.Schema.Types.ObjectId,
    guestSessionId: mongoose.Schema.Types.ObjectId,
    proposalId: mongoose.Schema.Types.ObjectId,
    purpose: {
      type: String,
      enum: ['GENERAL', 'ORDER_REVIEW'],
      required: true,
      default: 'GENERAL'
    },
    requestOwnerKey: { type: String, required: true },
    type: {
      type: String,
      enum: ['CALL_WAITER', 'WATER_REQUEST', 'PARTY_SURPRISE', 'BILL_REQUEST', 'REPORT_PROBLEM'],
      required: true
    },
    details: String,
    problemCategory: String,
    requestedQuantity: Number,
    priority: {
      type: String,
      enum: ['NORMAL', 'HIGH'],
      required: true,
      default: 'NORMAL'
    },
    status: {
      type: String,
      enum: ['OPEN', 'RESOLVED', 'CANCELLED'],
      required: true,
      default: 'OPEN'
    },
    source: {
      type: String,
      enum: ['GUEST', 'ADMIN', 'SYSTEM'],
      required: true,
      default: 'GUEST'
    },
    requestedAt: { type: Date, required: true, default: Date.now },
    handledAt: Date,
    handledBy: mongoose.Schema.Types.ObjectId,
    resolutionNote: String,
    resultCode: String,
    cancelledAt: Date,
    cancelledBy: mongoose.Schema.Types.ObjectId,
    cancelReason: String,
    responseDurationSeconds: Number,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
requestSchema.index(
  { requestOwnerKey: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'OPEN' }
  }
);
requestSchema.index({ status: 1, priority: 1, requestedAt: 1, _id: 1 });
requestSchema.index({ tableId: 1, status: 1, requestedAt: -1, _id: -1 });
requestSchema.index({ operationRequestId: 1 }, { unique: true, sparse: true });

const eventSchema = new mongoose.Schema(
  {
    serviceRequestId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    fromStatus: String,
    toStatus: { type: String, required: true },
    actorType: String,
    actorId: mongoose.Schema.Types.ObjectId,
    note: String
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
for (const hook of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
])
  eventSchema.pre(hook, () => {
    throw new Error('TABLE_SERVICE_EVENT_IMMUTABLE');
  });
eventSchema.pre('save', function preventMutation() {
  if (!this.isNew) throw new Error('TABLE_SERVICE_EVENT_IMMUTABLE');
});

export const TableServiceRequest =
  mongoose.models.TableServiceRequest ?? mongoose.model('TableServiceRequest', requestSchema);
export const TableServiceStatusEvent =
  mongoose.models.TableServiceStatusEvent ?? mongoose.model('TableServiceStatusEvent', eventSchema);
