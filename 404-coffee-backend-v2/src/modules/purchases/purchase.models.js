import mongoose from 'mongoose';
const options = { timestamps: true, versionKey: 'version', optimisticConcurrency: true };
const groupSchema = new mongoose.Schema(
  {
    groupNo: { type: String, required: true, unique: true },
    invoiceDate: { type: String, required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'SPLIT', 'PARTIALLY_REGISTERED', 'REGISTERED'],
      default: 'DRAFT'
    },
    currency: { type: String, default: 'EGP' },
    itemCount: { type: Number, default: 0 },
    registeredCount: { type: Number, default: 0 },
    subtotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    splitVersion: { type: Number, default: 0 },
    splitOutdated: { type: Boolean, default: false },
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId,
    registeredAt: Date,
    registeredBy: mongoose.Schema.Types.ObjectId,
    deletedAt: Date,
    deletedBy: mongoose.Schema.Types.ObjectId,
    operationRequestId: { type: mongoose.Schema.Types.ObjectId, unique: true, sparse: true }
  },
  options
);
groupSchema.index({ status: 1, createdAt: -1, _id: -1 });
const itemSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierInvoiceId: mongoose.Schema.Types.ObjectId,
    materialId: { type: mongoose.Schema.Types.ObjectId, required: true },
    materialSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    unitSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    lastBatchPriceSnapshot: mongoose.Schema.Types.Decimal128,
    quantityLarge: { type: mongoose.Schema.Types.Decimal128, required: true },
    quantitySmall: { type: mongoose.Schema.Types.Decimal128, required: true },
    largeUnitPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    lineTotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    status: { type: String, enum: ['PENDING', 'REGISTERED'], default: 'PENDING' },
    batchId: mongoose.Schema.Types.ObjectId,
    movementId: mongoose.Schema.Types.ObjectId,
    receivedOn: String,
    expiryOn: { type: String, default: null },
    registeredAt: Date,
    registeredBy: mongoose.Schema.Types.ObjectId
  },
  options
);
itemSchema.index({ groupId: 1, materialId: 1 }, { unique: true });
itemSchema.index({ supplierInvoiceId: 1, status: 1 });
itemSchema.index({ batchId: 1 }, { unique: true, sparse: true });
const invoiceSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    invoiceNo: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['UNREGISTERED', 'PARTIALLY_REGISTERED', 'REGISTERED'],
      default: 'UNREGISTERED'
    },
    itemCount: { type: Number, required: true },
    registeredCount: { type: Number, default: 0 },
    subtotal: { type: mongoose.Schema.Types.Decimal128, required: true },
    currency: { type: String, default: 'EGP' },
    splitVersion: { type: Number, required: true },
    createdBy: mongoose.Schema.Types.ObjectId
  },
  options
);
invoiceSchema.index({ groupId: 1, supplierId: 1, splitVersion: 1 }, { unique: true });
invoiceSchema.index({ status: 1, createdAt: -1, _id: -1 });
export const PurchaseGroup =
  mongoose.models.PurchaseGroup ?? mongoose.model('PurchaseGroup', groupSchema);
export const PurchaseItem =
  mongoose.models.PurchaseItem ?? mongoose.model('PurchaseItem', itemSchema);
export const SupplierPurchaseInvoice =
  mongoose.models.SupplierPurchaseInvoice ??
  mongoose.model('SupplierPurchaseInvoice', invoiceSchema);
