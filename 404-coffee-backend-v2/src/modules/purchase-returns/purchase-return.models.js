import mongoose from 'mongoose';
const immutableHooks = (schema) => {
  for (const hook of [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete'
  ])
    schema.pre(hook, () => {
      throw new Error('PURCHASE_RETURN_IMMUTABLE');
    });
  schema.pre('save', function () {
    if (!this.isNew) throw new Error('PURCHASE_RETURN_IMMUTABLE');
  });
};
const returnSchema = new mongoose.Schema(
  {
    returnNo: { type: String, required: true, unique: true },
    status: { type: String, enum: ['RETURNED'], default: 'RETURNED' },
    returnDate: { type: String, required: true },
    currency: { type: String, default: 'EGP' },
    itemCount: { type: Number, required: true },
    totalInventoryValue: { type: mongoose.Schema.Types.Decimal128, required: true },
    notes: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: mongoose.Schema.Types.ObjectId,
    returnedAt: { type: Date, default: Date.now },
    returnedBy: mongoose.Schema.Types.ObjectId,
    operationRequestId: { type: mongoose.Schema.Types.ObjectId, unique: true, sparse: true }
  },
  { timestamps: false, versionKey: false }
);
returnSchema.index({ returnDate: -1, _id: -1 });
const itemSchema = new mongoose.Schema(
  {
    returnId: { type: mongoose.Schema.Types.ObjectId, required: true },
    materialId: { type: mongoose.Schema.Types.ObjectId, required: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    purchaseItemId: mongoose.Schema.Types.ObjectId,
    materialSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    batchSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    supplierSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    quantityLarge: { type: mongoose.Schema.Types.Decimal128, required: true },
    quantitySmall: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitCostSnapshot: { type: mongoose.Schema.Types.Decimal128, required: true },
    totalInventoryValue: { type: mongoose.Schema.Types.Decimal128, required: true },
    reason: { type: String, required: true },
    movementId: mongoose.Schema.Types.ObjectId,
    createdAt: { type: Date, default: Date.now },
    createdBy: mongoose.Schema.Types.ObjectId
  },
  { timestamps: false, versionKey: false }
);
itemSchema.index({ returnId: 1, batchId: 1 }, { unique: true });
itemSchema.index({ movementId: 1 }, { unique: true, sparse: true });
itemSchema.index({ 'supplierSnapshot.id': 1, createdAt: -1 });
immutableHooks(returnSchema);
immutableHooks(itemSchema);
export const PurchaseReturn =
  mongoose.models.PurchaseReturn ?? mongoose.model('PurchaseReturn', returnSchema);
export const PurchaseReturnItem =
  mongoose.models.PurchaseReturnItem ?? mongoose.model('PurchaseReturnItem', itemSchema);
