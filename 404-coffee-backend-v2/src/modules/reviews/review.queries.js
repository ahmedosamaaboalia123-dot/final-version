import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { OrderReview } from './review.models.js';
import { reviewDto } from './review.mapper.js';

export async function listReviews(filters = {}, context = {}) {
  const models = context.reviewModels ?? { OrderReview };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.rating) query.rating = filters.rating;
  const [rows, totalItems, visible, hidden] = await Promise.all([
    models.OrderReview.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.OrderReview.countDocuments(query),
    models.OrderReview.countDocuments({ ...query, status: 'VISIBLE' }),
    models.OrderReview.countDocuments({ ...query, status: 'HIDDEN' })
  ]);
  return {
    items: rows.map(reviewDto),
    summary: { total: totalItems, visible, hidden },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function listCustomerReviews(customerId, filters = {}, context = {}) {
  const models = context.reviewModels ?? { OrderReview };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const [rows, totalItems] = await Promise.all([
    models.OrderReview.find({ customerId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.OrderReview.countDocuments({ customerId })
  ]);
  return {
    items: rows.map(reviewDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function getOrderReview(orderId, context = {}) {
  const models = context.reviewModels ?? { OrderReview };
  const review = await models.OrderReview.findOne({ orderId }).lean();
  return { review: review ? reviewDto(review) : null };
}
