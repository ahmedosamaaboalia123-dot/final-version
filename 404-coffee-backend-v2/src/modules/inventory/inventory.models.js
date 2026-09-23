import mongoose from 'mongoose';
import { compare } from '../../platform/database/decimal.js';

const nonNegative = (value) => value != null && compare(value, '0') >= 0;

const unitSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    nameAr: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['MASS', 'VOLUME', 'COUNT', 'CONTAINER'], required: true },
    physicalFactor: { type: mongoose.Schema.Types.Decimal128, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
unitSchema.index({ kind: 1, isActive: 1, nameAr: 1 });

const materialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    largeUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'MeasurementUnit', required: true },
    smallUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'MeasurementUnit', required: true },
    conversionFactor: { type: mongoose.Schema.Types.Decimal128, required: true },
    smallQuantityStep: { type: mongoose.Schema.Types.Decimal128, required: true },
    referenceLargeUnitPrice: mongoose.Schema.Types.Decimal128,
    currency: { type: String, default: 'EGP' },
    minStockSmall: { type: mongoose.Schema.Types.Decimal128, required: true },
    expiryAlertDays: { type: Number, min: 0, max: 3650, required: true },
    unitsLocked: { type: Boolean, default: false },
    supplierLockedAt: { type: Date, default: null },
    supplierLockReason: { type: String, enum: ['FIRST_BATCH', 'RECIPE_USE'], default: null },
    priorityVersion: { type: Number, default: 0 },
    stockVersion: { type: Number, default: 0 },
    operationRequestId: mongoose.Schema.Types.ObjectId,
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
materialSchema.index({ supplierId: 1, name: 1 });
materialSchema.index({ normalizedName: 1, _id: 1 });
materialSchema.index({ operationRequestId: 1 }, { unique: true, sparse: true });

const batchSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    batchNumber: { type: String, required: true, unique: true },
    purchaseReceiptItemId: { type: mongoose.Schema.Types.ObjectId, unique: true, sparse: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, required: true },
    supplierSnapshot: mongoose.Schema.Types.Mixed,
    materialSnapshot: mongoose.Schema.Types.Mixed,
    initialQuantitySmall: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      validate: { validator: nonNegative, message: 'initialQuantitySmall must be non-negative' }
    },
    remainingQuantitySmall: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      validate: [
        { validator: nonNegative, message: 'remainingQuantitySmall must be non-negative' },
        {
          validator(value) {
            return !this.initialQuantitySmall || compare(value, this.initialQuantitySmall) <= 0;
          },
          message: 'remainingQuantitySmall cannot exceed initialQuantitySmall'
        }
      ]
    },
    purchaseLargeUnitPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    initialInventoryValue: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      validate: { validator: nonNegative, message: 'initialInventoryValue must be non-negative' }
    },
    remainingInventoryValue: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      validate: [
        { validator: nonNegative, message: 'remainingInventoryValue must be non-negative' },
        {
          validator(value) {
            return !this.initialInventoryValue || compare(value, this.initialInventoryValue) <= 0;
          },
          message: 'remainingInventoryValue cannot exceed initialInventoryValue'
        }
      ]
    },
    currency: { type: String, default: 'EGP' },
    receivedOn: { type: String, required: true },
    expiryOn: { type: String, default: null },
    salePriority: { type: Number, required: true },
    recordedAt: { type: Date, default: Date.now },
    recordedBy: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
batchSchema.index({ materialId: 1, salePriority: 1, _id: 1 });
batchSchema.index({ materialId: 1, remainingQuantitySmall: 1 });
batchSchema.index({ expiryOn: 1, remainingQuantitySmall: 1 });

const movementSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterialBatch', required: true },
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    sequenceNo: { type: Number, required: true },
    kind: {
      type: String,
      enum: [
        'PURCHASE_RECEIPT',
        'PURCHASE_RETURN',
        'SALE_CONSUMPTION',
        'SALE_CANCELLATION_RESTORE',
        'WITHDRAWAL'
      ],
      required: true
    },
    quantitySmall: { type: mongoose.Schema.Types.Decimal128, required: true },
    inventoryValue: { type: mongoose.Schema.Types.Decimal128, required: true },
    quantityAfterSmall: { type: mongoose.Schema.Types.Decimal128, required: true },
    inventoryValueAfter: { type: mongoose.Schema.Types.Decimal128, required: true },
    occurredOn: { type: String, required: true },
    recordedAt: { type: Date, default: Date.now },
    recordedBy: mongoose.Schema.Types.ObjectId,
    reason: String,
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    reversesMovementId: mongoose.Schema.Types.ObjectId,
    operationRequestId: mongoose.Schema.Types.ObjectId,
    supplierSnapshot: mongoose.Schema.Types.Mixed,
    materialSnapshot: mongoose.Schema.Types.Mixed
  },
  { timestamps: false, versionKey: false }
);
movementSchema.index({ batchId: 1, sequenceNo: 1 }, { unique: true });
movementSchema.index({ sourceType: 1, sourceId: 1, batchId: 1, kind: 1 }, { unique: true });
movementSchema.index({ reversesMovementId: 1 }, { unique: true, sparse: true });
movementSchema.index({ materialId: 1, recordedAt: -1, _id: -1 });
for (const hook of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
])
  movementSchema.pre(hook, () => {
    throw new Error('INVENTORY_MOVEMENT_IMMUTABLE');
  });
movementSchema.pre('save', function preventMovementMutation() {
  if (!this.isNew) throw new Error('INVENTORY_MOVEMENT_IMMUTABLE');
});

const allocationSchema = new mongoose.Schema(
  {
    sourceType: { type: String, required: true },
    sourceId: { type: String, required: true },
    orderItemId: mongoose.Schema.Types.ObjectId,
    materialId: { type: mongoose.Schema.Types.ObjectId, required: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    consumptionMovementId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    quantitySmall: { type: mongoose.Schema.Types.Decimal128, required: true },
    inventoryValue: { type: mongoose.Schema.Types.Decimal128, required: true },
    unitCostSnapshot: { type: mongoose.Schema.Types.Decimal128, required: true },
    reversedQuantitySmall: {
      type: mongoose.Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0')
    },
    reversalMovementId: mongoose.Schema.Types.ObjectId,
    status: { type: String, enum: ['CONSUMED', 'REVERSED'], default: 'CONSUMED' },
    allocatedAt: { type: Date, default: Date.now },
    reversedAt: Date,
    reversedBy: mongoose.Schema.Types.ObjectId,
    reason: String,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: false, versionKey: 'version', optimisticConcurrency: true }
);
allocationSchema.index(
  { orderItemId: 1, materialId: 1, batchId: 1 },
  { unique: true, partialFilterExpression: { orderItemId: { $type: 'objectId' } } }
);
allocationSchema.index({ sourceType: 1, sourceId: 1, status: 1 });
allocationSchema.index({ batchId: 1, status: 1 });
allocationSchema.index({ reversalMovementId: 1 }, { unique: true, sparse: true });

export const MeasurementUnit =
  mongoose.models.MeasurementUnit ?? mongoose.model('MeasurementUnit', unitSchema);
export const RawMaterial =
  mongoose.models.RawMaterial ?? mongoose.model('RawMaterial', materialSchema);
export const RawMaterialBatch =
  mongoose.models.RawMaterialBatch ?? mongoose.model('RawMaterialBatch', batchSchema);
export const InventoryMovement =
  mongoose.models.InventoryMovement ?? mongoose.model('InventoryMovement', movementSchema);
export const InventoryAllocation =
  mongoose.models.InventoryAllocation ?? mongoose.model('InventoryAllocation', allocationSchema);
