import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    assetNo: { type: String, required: true, unique: true },
    purpose: {
      type: String,
      enum: ['PRODUCT_IMAGE'],
      required: true,
      default: 'PRODUCT_IMAGE'
    },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    checksum: { type: String, required: true },
    storageKey: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['READY', 'QUARANTINED', 'DELETED'],
      required: true,
      default: 'READY'
    },
    quarantineReason: String,
    uploadedBy: mongoose.Schema.Types.ObjectId,
    uploadedAt: { type: Date, required: true, default: Date.now },
    deletedAt: Date,
    deleteReason: String,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
schema.index({ purpose: 1, status: 1, uploadedAt: -1, _id: -1 });

export const MediaAsset = mongoose.models.MediaAsset ?? mongoose.model('MediaAsset', schema);
