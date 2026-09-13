import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    checksum: { type: String, required: true },
    status: {
      type: String,
      enum: ['APPLIED', 'FAILED'],
      required: true,
      default: 'APPLIED'
    },
    startedAt: Date,
    completedAt: Date,
    error: String,
    runner: String,
    leaseUntil: Date
  },
  { timestamps: true, versionKey: false }
);

export const Migration = mongoose.models.Migration ?? mongoose.model('Migration', schema);
