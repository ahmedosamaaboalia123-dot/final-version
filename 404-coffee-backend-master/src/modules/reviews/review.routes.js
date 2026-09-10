const express = require("express");
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const reviewController = require("./review.controller");
const { nodeEnv } = require("../../config/env");

const router = express.Router();

// Rate limit for public review creation: 5 per 15 minutes per IP
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many reviews submitted. Please try again later." },
  skip: () => nodeEnv === "test",
});

// Create review (public - for customers, rate limited)
router.post("/", reviewLimiter, reviewController.createReview);

// Get all reviews (admin only)
router.get(
  "/",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  reviewController.getReviews
);

// Get review by ID (admin only)
router.get(
  "/:id",
  authMiddleware,
  requirePermission("customers", "view_customers"),
  reviewController.getReviewById
);

// Delete review (admin only)
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("customers", "delete_customer"),
  reviewController.deleteReview
);

module.exports = router;
