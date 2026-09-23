export const reviewDto = (review) => ({
  id: String(review._id),
  orderId: String(review.orderId),
  customerId: review.customerId ? String(review.customerId) : null,
  tableGuestSessionId: review.tableGuestSessionId ? String(review.tableGuestSessionId) : null,
  fulfillmentType: review.fulfillmentType,
  rating: review.rating,
  comment: review.comment ?? null,
  displayName: review.displayName ?? null,
  status: review.status,
  submittedAt: review.createdAt ?? null,
  version: review.version ?? 0
});
