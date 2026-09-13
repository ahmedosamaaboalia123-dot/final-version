import mongoose from 'mongoose';

const money = { type: mongoose.Schema.Types.Decimal128, required: true };

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    normalizedName: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    phoneNormalized: { type: String, required: true, unique: true },
    address: String,
    socialLinks: [String],
    status: {
      type: String,
      enum: ['ACTIVE', 'ARCHIVED', 'BLOCKED'],
      required: true,
      default: 'ACTIVE'
    },
    blockReason: String,
    orderCount: { type: Number, required: true, default: 0, min: 0 },
    completedOrderCount: { type: Number, required: true, default: 0, min: 0 },
    lifetimeValue: { ...money, default: undefined },
    lastOrderAt: Date,
    lastProfileOrderAt: Date,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
customerSchema.index({ status: 1, createdAt: -1, _id: -1 });

export const Customer = mongoose.models.Customer ?? mongoose.model('Customer', customerSchema);
