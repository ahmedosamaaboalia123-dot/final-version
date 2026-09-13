import mongoose from 'mongoose';
const money = { type: mongoose.Schema.Types.Decimal128, required: true };
const shiftSchema = new mongoose.Schema(
  {
    shiftNo: { type: String, unique: true, required: true },
    drawerKey: { type: String, required: true },
    locationId: String,
    scopeType: { type: String, enum: ['POS', 'EMPLOYEE'], default: 'EMPLOYEE' },
    scopeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ['OPEN', 'CLOSING', 'CLOSED'], default: 'OPEN' },
    currency: { type: String, default: 'EGP' },
    openingBalance: money,
    totalCashIn: money,
    totalCashOut: money,
    netCashMovement: money,
    expectedClosingBalance: money,
    actualClosingBalance: mongoose.Schema.Types.Decimal128,
    closingVsOpeningDifference: mongoose.Schema.Types.Decimal128,
    reconciliationDifference: mongoose.Schema.Types.Decimal128,
    reconciliationStatus: {
      type: String,
      enum: ['PENDING', 'MATCHED', 'SHORTAGE', 'SURPLUS'],
      default: 'PENDING'
    },
    shortageAmount: mongoose.Schema.Types.Decimal128,
    surplusAmount: mongoose.Schema.Types.Decimal128,
    openingNotes: String,
    closingNotes: String,
    differenceReason: String,
    openedAt: { type: Date, default: Date.now },
    openedBy: mongoose.Schema.Types.ObjectId,
    closingAt: Date,
    closingBy: mongoose.Schema.Types.ObjectId,
    closedAt: Date,
    closedBy: mongoose.Schema.Types.ObjectId,
    nextOpenShiftWarningAt: Date,
    lastOpenShiftWarningAt: Date,
    openShiftWarningCount: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 }
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
shiftSchema.index(
  { scopeType: 1, scopeId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'CLOSING'] } } }
);
shiftSchema.index({ status: 1, nextOpenShiftWarningAt: 1 });
const txSchema = new mongoose.Schema(
  {
    shiftId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sequenceNo: { type: Number, required: true },
    direction: { type: String, enum: ['IN', 'OUT'], required: true },
    amount: money,
    currency: { type: String, default: 'EGP' },
    balanceAfter: money,
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    accountingClass: { type: String, required: true },
    description: { type: String, required: true },
    recordedAt: { type: Date, default: Date.now },
    recordedBy: mongoose.Schema.Types.ObjectId,
    reversesTransactionId: mongoose.Schema.Types.ObjectId,
    operationRequestId: mongoose.Schema.Types.ObjectId,
    snapshots: mongoose.Schema.Types.Mixed
  },
  { timestamps: false, versionKey: false }
);
txSchema.index({ shiftId: 1, sequenceNo: 1 }, { unique: true });
txSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
txSchema.index({ reversesTransactionId: 1 }, { unique: true, sparse: true });
for (const h of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
])
  txSchema.pre(h, () => {
    throw new Error('DRAWER_TRANSACTION_IMMUTABLE');
  });
const alertSchema = new mongoose.Schema(
  {
    shiftId: { type: mongoose.Schema.Types.ObjectId, required: true },
    shiftNoSnapshot: String,
    thresholdHours: { type: Number, required: true },
    openedAtSnapshot: Date,
    generatedAt: { type: Date, default: Date.now },
    openDurationSeconds: Number,
    expectedBalanceSnapshot: mongoose.Schema.Types.Decimal128,
    currency: String,
    openedBy: mongoose.Schema.Types.ObjectId,
    recipientIds: [mongoose.Schema.Types.ObjectId],
    notificationStatus: {
      type: String,
      enum: ['PENDING', 'PUBLISHED', 'PARTIAL', 'FAILED'],
      default: 'PENDING'
    },
    outboxEventId: mongoose.Schema.Types.ObjectId,
    missedThresholdGroupId: String
  },
  { timestamps: true, versionKey: false }
);
alertSchema.index({ shiftId: 1, thresholdHours: 1 }, { unique: true });
alertSchema.index({ generatedAt: -1 });
export const CashDrawerShift =
  mongoose.models.CashDrawerShift ?? mongoose.model('CashDrawerShift', shiftSchema);
export const CashDrawerTransaction =
  mongoose.models.CashDrawerTransaction ?? mongoose.model('CashDrawerTransaction', txSchema);
export const DrawerShiftAlert =
  mongoose.models.DrawerShiftAlert ?? mongoose.model('DrawerShiftAlert', alertSchema);
