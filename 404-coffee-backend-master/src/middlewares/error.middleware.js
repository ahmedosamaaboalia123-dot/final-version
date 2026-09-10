const logger = require("../lib/logger");
const { nodeEnv } = require("../config/env");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error(
      { err, method: req.method, url: req.originalUrl },
      "Unhandled error"
    );
  } else {
    logger.warn(
      { err, method: req.method, url: req.originalUrl },
      "Request error"
    );
  }

  let message;

  if (nodeEnv === "production") {
    if (statusCode >= 500) {
      // Never leak internal details in production
      message = "Internal server error";
    } else {
      // For 4xx: keep business error messages (e.g. "Invalid credentials"),
      // but sanitize messages that look like internal/DB errors
      const rawMsg = err.message || "Bad request";
      const isInternalPattern =
        /prisma|database|query|constraint|column|table|sequence|ECONNREFUSED/i.test(rawMsg);
      message = isInternalPattern ? "Bad request" : rawMsg;
    }
  } else {
    // Development: show full error messages
    message = err.message || "Internal server error";
  }

  const response = { success: false, message };
  if (err.code) response.code = err.code;

  res.status(statusCode).json(response);
};

module.exports = errorHandler;