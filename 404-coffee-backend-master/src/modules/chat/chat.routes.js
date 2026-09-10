const express = require("express");
const rateLimit = require("express-rate-limit");

const { chat } = require("./chat.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const { nodeEnv } = require("../../config/env");

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => nodeEnv === "test",
});

router.post("/", authMiddleware, chatLimiter, chat);

module.exports = router;