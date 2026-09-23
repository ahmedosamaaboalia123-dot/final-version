import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    customerId: mongoose.Schema.Types.ObjectId,
    tableGuestSessionId: mongoose.Schema.Types.ObjectId,
    fulfillmentType: {
      type: String,
      enum: ['TAKEAWAY', 'DELIVERY', 'DINE_IN'],
      required: true
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: String,
    displayName: { type: String, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: ['VISIBLE', 'HIDDEN'],
      required: true,
      default: 'VISIBLE'
    },
    hiddenAt: Date,
    hiddenBy: mongoose.Schema.Types.ObjectId,
    moderationReason: String,
    operationRequestId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true, versionKey: 'version', optimisticConcurrency: true }
);
reviewSchema.index({ customerId: 1, createdAt: -1, _id: -1 });
reviewSchema.index({ status: 1, rating: 1, createdAt: -1, _id: -1 });

const revisionSchema = new mongoose.Schema(
  {
    reviewId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    previousRating: Number,
    previousComment: String,
    newRating: Number,
    newComment: String,
    changeSource: {
      type: String,
      enum: ['OWNER_EDIT', 'MODERATION'],
      required: true
    },
    actorId: mongoose.Schema.Types.ObjectId,
    reason: String
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
for (const hook of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
])
  revisionSchema.pre(hook, () => {
    throw new Error('REVIEW_REVISION_IMMUTABLE');
  });
revisionSchema.pre('save', function preventMutation() {
  if (!this.isNew) throw new Error('REVIEW_REVISION_IMMUTABLE');
});

export const OrderReview =
  mongoose.models.OrderReview ?? mongoose.model('OrderReview', reviewSchema);
export const OrderReviewRevision =
  mongoose.models.OrderReviewRevision ?? mongoose.model('OrderReviewRevision', revisionSchema);
