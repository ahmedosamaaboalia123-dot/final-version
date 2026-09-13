import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema(
  {
    tableNumber: { type: Number, required: true, unique: true, min: 1, max: 20 },
    outOfService: { type: Boolean, required: true, default: false },
    outOfServiceReason: String,
    currentQrSecretHash: { type: String, select: false },
    qrVersion: { type: Number, required: true, default: 0 },
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);

const sessionSchema = new mongoose.Schema(
  {
    sessionNumber: { type: String, required: true, unique: true },
    tableId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tableNumber: { type: Number, required: true, min: 1, max: 20 },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSING', 'CLOSED', 'CANCELLED'],
      required: true,
      default: 'OPEN'
    },
    activeOrderId: mongoose.Schema.Types.ObjectId,
    openedBy: mongoose.Schema.Types.ObjectId,
    openedAt: { type: Date, required: true, default: Date.now },
    closedAt: Date,
    closedBy: mongoose.Schema.Types.ObjectId,
    cancelReason: String,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
sessionSchema.index(
  { tableId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['OPEN', 'CLOSING'] } }
  }
);
sessionSchema.index({ status: 1, openedAt: -1, _id: -1 });

export const Table = mongoose.models.Table ?? mongoose.model('Table', tableSchema);
export const TableSession =
  mongoose.models.TableSession ?? mongoose.model('TableSession', sessionSchema);
