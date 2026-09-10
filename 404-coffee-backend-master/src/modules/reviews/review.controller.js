const reviewService = require("./review.service");
const { logAudit } = require("../../utils/audit");

const createReview = async (req, res, next) => {
  try {
    const review = await reviewService.createReview(req.body);
    await logAudit(req, "reviews", "create_review", "Review created successfully");
    res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

const getReviews = async (req, res, next) => {
  try {
    const result = await reviewService.getReviews(req.query);
    res.status(200).json({
      success: true,
      data: result.items,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getReviewById = async (req, res, next) => {
  try {
    const review = await reviewService.getReviewById(req.params.id);
    res.status(200).json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
};

const deleteReview = async (req, res, next) => {
  try {
    const review = await reviewService.deleteReview(req.params.id);
    await logAudit(req, "reviews", "delete_review", "Review deleted successfully");
    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
      data: review,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReview,
  getReviews,
  getReviewById,
  deleteReview,
};
