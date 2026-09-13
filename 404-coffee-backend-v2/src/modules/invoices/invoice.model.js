import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    tableSessionId: mongoose.Schema.Types.ObjectId,
    revision: { type: Number, required: true, default: 1 },
    channel: { type: String, enum: ['ADMIN', 'CUSTOMER_WEB', 'TABLE'], required: true },
    fulfillmentType: { type: String, enum: ['TAKEAWAY', 'DELIVERY', 'DINE_IN'], required: true },
    status: { type: String, enum: ['FINAL', 'CANCELLED'], default: 'FINAL' },
    payloadSafe: { type: mongoose.Schema.Types.Mixed, required: true },
    totals: { type: mongoose.Schema.Types.Mixed, required: true },
    finalizedAt: { type: Date, required: true, default: Date.now },
    finalizedBy: mongoose.Schema.Types.ObjectId,
    checksum: { type: String, required: true },
    printCount: { type: Number, default: 0, min: 0 },
    lastPrintedAt: Date,
    lastPrintedBy: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
schema.index({ channel: 1, status: 1, finalizedAt: -1, _id: -1 });
schema.index({ tableSessionId: 1, finalizedAt: -1 });
export const InvoiceSnapshot =
  mongoose.models.InvoiceSnapshot ?? mongoose.model('InvoiceSnapshot', schema);
