import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { reviewDto } from './review.mapper.js';
import { moderateReview, submitOrderReview, updateOrderReview } from './review.service.js';
import { getOrderReview, listReviews } from './review.queries.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createReviewController(d) {
  return {
    list: async (r, s) => sendSuccess(s, await listReviews(r.validated.query, ctx(r, d))),
    submit: async (r, s) =>
      sendCreated(s, {
        review: reviewDto(
          await submitOrderReview(r.validated.params.id, r.validated.body, ctx(r, d))
        )
      }),
    update: async (r, s) => {
      const result = await updateOrderReview(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        review: reviewDto(result.review),
        revisionId: String(result.revision._id)
      });
    },
    moderate: async (r, s) => {
      const result = await moderateReview(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        review: reviewDto(result.review),
        revisionId: String(result.revision._id)
      });
    },
    byOrder: async (r, s) => sendSuccess(s, await getOrderReview(r.validated.params.id, ctx(r, d)))
  };
}
