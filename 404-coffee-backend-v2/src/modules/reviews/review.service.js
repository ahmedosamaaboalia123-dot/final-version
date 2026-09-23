import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Order } from '../orders/order.models.js';
import { OrderReview, OrderReviewRevision } from './review.models.js';

const defaults = { Order, OrderReview, OrderReviewRevision };

async function record(kind, reviewId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'reviews',
      action: kind,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'OrderReview', id: reviewId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'OrderReview',
      aggregateId: String(reviewId),
      eventType: kind,
      payload,
      sequence: (payload.version ?? 0) + 1
    },
    context
  );
}

async function loadCompletedOrder(models, orderId, input, context, tx) {
  const order = await models.Order.findById(orderId).session(tx.session);
  if (!order)
    throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  if (order.status !== 'COMPLETED')
    throw new ApiError({
      code: 'REVIEW_ORDER_NOT_COMPLETED',
      status: 409,
      messageAr: 'التقييم متاح بعد اكتمال الطلب فقط'
    });
  const owner = input.owner ?? { type: 'CUSTOMER' };
  if (order.fulfillmentType === 'DINE_IN') {
    if (owner.type !== 'GUEST' || !owner.guestSessionId)
      throw new ApiError({
        code: 'REVIEW_FULFILLMENT_DEFERRED',
        status: 409,
        messageAr: 'تقييم الصالة يتم من جلسة الطاولة'
      });
  } else if (owner.type !== 'CUSTOMER')
    throw new ApiError({
      code: 'REVIEW_OWNER_CONFLICT',
      status: 409,
      messageAr: 'مالك التقييم غير متطابق مع قناة الطلب'
    });
  return { order, owner };
}

export async function submitOrderReview(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.reviewModels ?? defaults;
      const { order, owner } = await loadCompletedOrder(models, orderId, input, context, tx);
      if (input.expectedOrderVersion !== undefined && order.version !== input.expectedOrderVersion)
        throw new ApiError({
          code: 'ORDER_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الطلب تغير، أعد تحميل الصفحة'
        });
      try {
        const [review] = await models.OrderReview.create(
          [
            {
              orderId: order._id,
              customerId: owner.type === 'CUSTOMER' ? order.customerId : undefined,
              tableGuestSessionId: owner.type === 'GUEST' ? owner.guestSessionId : undefined,
              fulfillmentType: order.fulfillmentType,
              rating: input.rating,
              comment: input.comment,
              displayName: input.displayName,
              operationRequestId: context.operationRequestId
            }
          ],
          { session: tx.session }
        );
        await record(
          'review.submitted',
          review._id,
          { reviewId: String(review._id), orderId: String(order._id), version: review.version },
          { ...context, ...tx }
        );
        return review;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        throw new ApiError({
          code: 'REVIEW_ALREADY_EXISTS',
          status: 409,
          messageAr: 'تم تقييم هذا الطلب من قبل'
        });
      }
    },
    context,
    context.transactionOptions
  );
}

export async function updateOrderReview(reviewId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.reviewModels ?? defaults;
      const review = await models.OrderReview.findOne({
        _id: reviewId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!review)
        throw new ApiError({
          code: 'REVIEW_VERSION_CONFLICT',
          status: 409,
          messageAr: 'التقييم غير موجود أو تغير'
        });
      const [revision] = await models.OrderReviewRevision.create(
        [
          {
            reviewId: review._id,
            orderId: review.orderId,
            previousRating: review.rating,
            previousComment: review.comment,
            newRating: input.rating ?? review.rating,
            newComment: input.comment !== undefined ? input.comment : review.comment,
            changeSource: 'OWNER_EDIT',
            actorId: context.actorId,
            reason: 'تعديل المالك'
          }
        ],
        { session: tx.session }
      );
      if (input.rating !== undefined) review.rating = input.rating;
      if (input.comment !== undefined) review.comment = input.comment;
      await review.save({ session: tx.session });
      await record(
        'review.updated',
        review._id,
        { reviewId: String(review._id), version: review.version },
        { ...context, ...tx }
      );
      return { review, revision };
    },
    context,
    context.transactionOptions
  );
}

export async function moderateReview(reviewId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.reviewModels ?? defaults;
      const review = await models.OrderReview.findOne({
        _id: reviewId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!review)
        throw new ApiError({
          code: 'REVIEW_VERSION_CONFLICT',
          status: 409,
          messageAr: 'التقييم غير موجود أو تغير'
        });
      const [revision] = await models.OrderReviewRevision.create(
        [
          {
            reviewId: review._id,
            orderId: review.orderId,
            previousRating: review.rating,
            previousComment: review.comment,
            newRating: review.rating,
            newComment: review.comment,
            changeSource: 'MODERATION',
            actorId: context.actorId,
            reason: input.reason
          }
        ],
        { session: tx.session }
      );
      review.status = input.status;
      if (input.status === 'HIDDEN') {
        review.hiddenAt = context.now ?? new Date();
        review.hiddenBy = context.actorId;
        review.moderationReason = input.reason;
      } else {
        review.hiddenAt = undefined;
        review.hiddenBy = undefined;
        review.moderationReason = undefined;
      }
      await review.save({ session: tx.session });
      await record(
        'review.moderated',
        review._id,
        { reviewId: String(review._id), status: input.status, version: review.version },
        { ...context, ...tx }
      );
      return { review, revision };
    },
    context,
    context.transactionOptions
  );
}
