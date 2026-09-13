import mongoose from 'mongoose';

const credentialSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    customerId: mongoose.Schema.Types.ObjectId,
    trackingReadTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    orderActionTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false
    },
    readExpiresAt: { type: Date, required: true },
    actionExpiresAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
      required: true,
      default: 'ACTIVE'
    },
    lastReadAt: Date,
    lastActionAt: Date,
    revokedAt: Date,
    revokedBy: mongoose.Schema.Types.ObjectId,
    revokeReason: String,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
credentialSchema.index({ customerId: 1, createdAt: -1, _id: -1 });

const accessSessionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sessionTokenHash: { type: String, required: true, unique: true, select: false },
    proofType: {
      type: String,
      enum: ['ORDER_ACTION_TOKEN', 'OTP'],
      required: true,
      default: 'ORDER_ACTION_TOKEN'
    },
    proofOrderId: mongoose.Schema.Types.ObjectId,
    issuedAt: { type: Date, required: true, default: Date.now },
    lastUsedAt: Date,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED', 'EXPIRED'],
      required: true,
      default: 'ACTIVE'
    }
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
accessSessionSchema.index({ customerId: 1, status: 1, _id: -1 });
accessSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const cancellationRequestSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    customerId: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      enum: ['PENDING', 'AUTO_APPROVED', 'EXECUTED', 'REJECTED'],
      required: true,
      default: 'PENDING'
    },
    reason: { type: String, required: true },
    requestedAt: { type: Date, required: true, default: Date.now },
    decidedAt: Date,
    decidedBy: mongoose.Schema.Types.ObjectId,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
cancellationRequestSchema.index({ customerId: 1, requestedAt: -1, _id: -1 });

export const CustomerOrderCredential =
  mongoose.models.CustomerOrderCredential ??
  mongoose.model('CustomerOrderCredential', credentialSchema);
export const CustomerAccessSession =
  mongoose.models.CustomerAccessSession ??
  mongoose.model('CustomerAccessSession', accessSessionSchema);
export const OrderCancellationRequest =
  mongoose.models.OrderCancellationRequest ??
  mongoose.model('OrderCancellationRequest', cancellationRequestSchema);
