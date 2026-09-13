import mongoose from 'mongoose';

const money = { type: mongoose.Schema.Types.Decimal128, required: true };

const delegateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    normalizedName: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    phoneNormalized: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      required: true,
      default: 'ACTIVE'
    },
    statusReason: String,
    maxActiveOrders: { type: Number, required: true, default: 5, min: 1, max: 50 },
    activeOrderCount: { type: Number, required: true, default: 0, min: 0 },
    deliveredCount: { type: Number, required: true, default: 0, min: 0 },
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
delegateSchema.index({ status: 1, createdAt: -1, _id: -1 });

const assignmentSchema = new mongoose.Schema(
  {
    assignmentNo: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    delegateId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    status: {
      type: String,
      enum: [
        'ASSIGNED',
        'IN_PROGRESS',
        'DELIVERED',
        'FAILED',
        'RETURNED',
        'REASSIGNED',
        'CANCELLED'
      ],
      required: true,
      default: 'ASSIGNED'
    },
    cashExpected: money,
    cashSettledTotal: money,
    reason: String,
    supersededBy: mongoose.Schema.Types.ObjectId,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
assignmentSchema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }
  }
);
assignmentSchema.index({ delegateId: 1, status: 1, createdAt: -1, _id: -1 });

const confirmationSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    source: { type: String, enum: ['CUSTOMER', 'ADMIN_OVERRIDE'], required: true },
    customerCredentialId: mongoose.Schema.Types.ObjectId,
    confirmedByEmployeeId: mongoose.Schema.Types.ObjectId,
    overrideReason: String,
    confirmedAt: { type: Date, required: true, default: Date.now },
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: false }
);

export const Delegate = mongoose.models.Delegate ?? mongoose.model('Delegate', delegateSchema);
export const DeliveryAssignment =
  mongoose.models.DeliveryAssignment ?? mongoose.model('DeliveryAssignment', assignmentSchema);
export const DeliveryConfirmation =
  mongoose.models.DeliveryConfirmation ??
  mongoose.model('DeliveryConfirmation', confirmationSchema);
