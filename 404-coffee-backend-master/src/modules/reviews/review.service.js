const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

const httpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const createReview = async ({ customerName, customerPhone, rating, comment }) => {
  if (!customerName || typeof customerName !== "string" || customerName.trim().length === 0) {
    throw httpError("customerName is required");
  }

  if (customerName.trim().length > 100) {
    throw httpError("customerName must be 100 characters or less");
  }

  if (!customerPhone || typeof customerPhone !== "string" || customerPhone.trim().length === 0) {
    throw httpError("customerPhone is required");
  }

  if (customerPhone.trim().length > 20) {
    throw httpError("customerPhone must be 20 characters or less");
  }

  const parsedRating = Number(rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    throw httpError("Rating must be an integer between 1 and 5");
  }

  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string") {
      throw httpError("comment must be a string");
    }
    if (comment.length > 1000) {
      throw httpError("comment must be 1000 characters or less");
    }
  }

  return prisma.review.create({
    data: {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      rating: parsedRating,
      comment: comment ? comment.trim() : null,
    },
  });
};

const getReviews = async (filters = {}) => {
  const { page, pageSize, skip, take } = parsePagination(filters);

  const where = {};

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.review.count({ where }),
  ]);

  return {
    items: reviews,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

const getReviewById = async (id) => {
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    throw httpError("Invalid review ID");
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
  });

  if (!review) {
    throw httpError("Review not found", 404);
  }

  return review;
};

const deleteReview = async (id) => {
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    throw httpError("Invalid review ID");
  }

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) {
    throw httpError("Review not found", 404);
  }

  await prisma.review.delete({ where: { id: reviewId } });
  return review;
};

module.exports = {
  createReview,
  getReviews,
  getReviewById,
  deleteReview,
};
