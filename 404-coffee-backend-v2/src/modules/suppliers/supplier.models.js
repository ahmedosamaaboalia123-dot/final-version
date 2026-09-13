import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    phoneNormalized: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
supplierSchema.index({ createdAt: -1, _id: -1 });
supplierSchema.index({ phoneNormalized: 1 });
supplierSchema.index({ normalizedName: 1 });
supplierSchema.index({ city: 1 });

const accountSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      unique: true
    },
    currency: { type: String, required: true, default: 'EGP' },
    debtBalance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0')
    },
    receivableBalance: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      default: () => mongoose.Types.Decimal128.fromString('0')
    }
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);

const entrySchema = new mongoose.Schema(
  {
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    sequenceNo: { type: Number, required: true },
    kind: {
      type: String,
      enum: ['DEBT', 'RECEIVABLE', 'DEBT_PAYMENT', 'RECEIVABLE_COLLECTION', 'REVERSAL'],
      required: true
    },
    amount: { type: mongoose.Schema.Types.Decimal128, required: true },
    occurredOn: { type: String, required: true },
    recordedAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    notes: String,
    debtBalanceAfter: { type: mongoose.Schema.Types.Decimal128, required: true },
    receivableBalanceAfter: { type: mongoose.Schema.Types.Decimal128, required: true },
    reversesEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierAccountEntry' },
    reversedByEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierAccountEntry' },
    replacesEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierAccountEntry' },
    originalKind: String,
    origin: { type: String, enum: ['MANUAL'], default: 'MANUAL' },
    operationRequestId: mongoose.Schema.Types.ObjectId,
    drawerTransactionId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: false, versionKey: false }
);
entrySchema.index({ supplierId: 1, sequenceNo: 1 }, { unique: true });
entrySchema.index(
  { reversesEntryId: 1 },
  { unique: true, partialFilterExpression: { reversesEntryId: { $type: 'objectId' } } }
);
entrySchema.index(
  { replacesEntryId: 1 },
  { unique: true, partialFilterExpression: { replacesEntryId: { $type: 'objectId' } } }
);
entrySchema.index({ supplierId: 1, occurredOn: -1, _id: -1 });
for (const hook of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
])
  entrySchema.pre(hook, () => {
    throw new Error('SUPPLIER_ACCOUNT_ENTRY_IMMUTABLE');
  });
entrySchema.pre('save', function preventLedgerMutation() {
  if (!this.isNew) throw new Error('SUPPLIER_ACCOUNT_ENTRY_IMMUTABLE');
});

export const Supplier = mongoose.models.Supplier ?? mongoose.model('Supplier', supplierSchema);
export const SupplierAccount =
  mongoose.models.SupplierAccount ?? mongoose.model('SupplierAccount', accountSchema);
export const SupplierAccountEntry =
  mongoose.models.SupplierAccountEntry ?? mongoose.model('SupplierAccountEntry', entrySchema);
