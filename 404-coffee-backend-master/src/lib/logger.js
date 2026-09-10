const pino = require("pino");

const { nodeEnv } = require("../config/env");

const logger = pino({
  level: nodeEnv === "test" ? "silent" : "info",
});

module.exports = logger;