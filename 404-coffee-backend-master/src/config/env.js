require("dotenv").config();

// --- Hard requirements: app must NOT start without both secrets ---
if (!process.env.ACCESS_TOKEN_SECRET) {
  console.error("[FATAL] ACCESS_TOKEN_SECRET is not set. The application cannot start without it.");
  process.exit(1);
}
if (!process.env.REFRESH_TOKEN_SECRET) {
  console.error("[FATAL] REFRESH_TOKEN_SECRET is not set. The application cannot start without it.");
  process.exit(1);
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.ACCESS_TOKEN_SECRET,
  jwtRefreshSecret: process.env.REFRESH_TOKEN_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "86400s",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "86400s",
  aiApiKey: process.env.DEEPSEEK_API_KEY,
  aiModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
};