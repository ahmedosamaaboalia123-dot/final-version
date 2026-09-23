import mongoose from 'mongoose';

const money = { type: mongoose.Schema.Types.Decimal128, required: true };
const optionalMoney = { type: mongoose.Schema.Types.Decimal128, default: undefined };

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    publicOrderNumber: { type: String, required: true, unique: true },
    trackingCode: { type: String, required: true, unique: true },
    barcodeValue: { type: String, required: true, unique: true },
    channel: {
      type: String,
      enum: ['ADMIN', 'CUSTOMER_WEB', 'TABLE'],
      required: true,
      default: 'ADMIN'
    },
    fulfillmentType: {
      type: String,
      enum: ['TAKEAWAY', 'DELIVERY', 'DINE_IN'],
      required: true
    },
    customerId: mongoose.Schema.Types.ObjectId,
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: String,
    tableSessionId: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      enum: ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
      required: true,
      default: 'CONFIRMED'
    },
    subtotal: money,
    discount: money,
    tax: money,
    taxRateSnapshot: { type: mongoose.Schema.Types.Decimal128, default: undefined },
    deliveryFee: money,
    total: money,
    actualInventoryCost: money,
    actualProfit: money,
    paidAmount: { ...money, default: undefined },
    refundedAmount: { ...money, default: undefined },
    balanceDue: money,
    costCompleteness: { type: String, enum: ['COMPLETE', 'PARTIAL'], required: true },
    currency: { type: String, required: true, default: 'EGP' },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'COLLECTED', 'SETTLED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
      required: true,
      default: 'PENDING'
    },
    customerReceiptStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'LOCKED', 'AVAILABLE', 'CONFIRMED', 'ADMIN_CONFIRMED'],
      required: true,
      default: 'NOT_APPLICABLE'
    },
    assignedDelegateId: mongoose.Schema.Types.ObjectId,
    currentDeliveryAssignmentId: mongoose.Schema.Types.ObjectId,
    tableGuestSessionId: mongoose.Schema.Types.ObjectId,
    eventSequence: { type: Number, required: true, default: 0 },
    invoiceRevision: { type: Number, required: true, default: 1 },
    cancellationReason: String,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
orderSchema.index({ status: 1, fulfillmentType: 1, createdAt: -1, _id: -1 });
orderSchema.index({ customerPhone: 1, createdAt: -1, _id: -1 });
orderSchema.index({ tableSessionId: 1, createdAt: -1 });
orderSchema.index({ operationRequestId: 1 }, { unique: true, sparse: true });

const itemSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    lineNo: { type: Number, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productSizeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    typeName: { type: String, required: true },
    sizeName: { type: String, required: true },
    unitSellingPrice: money,
    addonNames: [String],
    addonSellingPrice: optionalMoney,
    recipeSnapshot: [
      {
        materialId: mongoose.Schema.Types.ObjectId,
        quantitySmall: mongoose.Schema.Types.Decimal128,
        materialName: String,
        unitName: String
      }
    ],
    quantity: { type: Number, required: true, min: 1 },
    lineSubtotal: money,
    actualInventoryCost: money,
    actualProfit: money,
    allocationIds: [mongoose.Schema.Types.ObjectId],
    notes: String,
    status: {
      type: String,
      enum: ['PREPARING', 'READY', 'CANCELLED'],
      required: true,
      default: 'PREPARING'
    },
    cancellationReason: String,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
itemSchema.index({ orderId: 1, lineNo: 1 }, { unique: true });
itemSchema.index({ orderId: 1, status: 1, _id: 1 });

const immutableHooks = (schema, name) => {
  for (const hook of [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete'
  ])
    schema.pre(hook, () => {
      throw new Error(`${name}_IMMUTABLE`);
    });
  schema.pre('save', function preventMutation() {
    if (!this.isNew) throw new Error(`${name}_IMMUTABLE`);
  });
};

const orderEventSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    fromStatus: String,
    toStatus: { type: String, required: true },
    reasonCode: String,
    notes: String,
    actorType: String,
    actorId: mongoose.Schema.Types.ObjectId,
    sequence: { type: Number, required: true },
    requestId: String
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
orderEventSchema.index({ orderId: 1, sequence: 1 }, { unique: true });
immutableHooks(orderEventSchema, 'ORDER_STATUS_EVENT');

const itemEventSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    fromStatus: String,
    toStatus: { type: String, required: true },
    reasonCode: String,
    notes: String,
    actorType: String,
    actorId: mongoose.Schema.Types.ObjectId,
    sequence: { type: Number, required: true },
    requestId: String
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
itemEventSchema.index({ orderItemId: 1, sequence: 1 });
immutableHooks(itemEventSchema, 'ORDER_ITEM_STATUS_EVENT');

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);
export const OrderItem = mongoose.models.OrderItem ?? mongoose.model('OrderItem', itemSchema);
export const OrderStatusEvent =
  mongoose.models.OrderStatusEvent ?? mongoose.model('OrderStatusEvent', orderEventSchema);
export const OrderItemStatusEvent =
  mongoose.models.OrderItemStatusEvent ?? mongoose.model('OrderItemStatusEvent', itemEventSchema);
