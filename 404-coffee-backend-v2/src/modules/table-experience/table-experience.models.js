import mongoose from 'mongoose';

const guestSessionSchema = new mongoose.Schema(
  {
    guestSessionNumber: { type: String, required: true, unique: true },
    tableId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tableNumber: { type: Number, required: true, min: 1, max: 20 },
    tokenHash: { type: String, required: true, unique: true, select: false },
    qrVersion: { type: Number, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'CLOSED', 'EXPIRED', 'REVOKED'],
      required: true,
      default: 'ACTIVE'
    },
    expiresAt: { type: Date, required: true },
    lastSeenAt: Date,
    closedAt: Date,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
guestSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const proposalItemSchema = new mongoose.Schema(
  {
    productId: mongoose.Schema.Types.ObjectId,
    productSizeId: mongoose.Schema.Types.ObjectId,
    addonIds: [mongoose.Schema.Types.ObjectId],
    productName: String,
    typeName: String,
    sizeName: String,
    unitSellingPrice: mongoose.Schema.Types.Decimal128,
    quantity: Number,
    lineSubtotal: mongoose.Schema.Types.Decimal128,
    notes: String
  },
  { _id: false }
);

const proposalSchema = new mongoose.Schema(
  {
    proposalNumber: { type: String, required: true, unique: true },
    guestSessionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tableId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tableNumber: { type: Number, required: true, min: 1, max: 20 },
    tableSessionId: mongoose.Schema.Types.ObjectId,
    items: [proposalItemSchema],
    subtotal: mongoose.Schema.Types.Decimal128,
    status: {
      type: String,
      enum: [
        'WAITING_WAITER',
        'UNDER_REVIEW',
        'NEEDS_CHANGES',
        'CONFIRMED',
        'REJECTED',
        'CANCELLED',
        'EXPIRED'
      ],
      required: true,
      default: 'WAITING_WAITER'
    },
    reviewNote: String,
    confirmedOrderId: mongoose.Schema.Types.ObjectId,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
proposalSchema.index(
  { guestSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['WAITING_WAITER', 'UNDER_REVIEW', 'NEEDS_CHANGES'] }
    }
  }
);
proposalSchema.index({ tableId: 1, status: 1, createdAt: -1, _id: -1 });

export const TableGuestSession =
  mongoose.models.TableGuestSession ?? mongoose.model('TableGuestSession', guestSessionSchema);
export const TableOrderProposal =
  mongoose.models.TableOrderProposal ?? mongoose.model('TableOrderProposal', proposalSchema);
