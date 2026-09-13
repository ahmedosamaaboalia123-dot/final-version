import { logger } from '../observability/logger.js';

export function requestPerformance({ slowMs = 500 } = {}) {
  return function measureRequest(req, res, next) {
    const started = process.hrtime.bigint();
    const originalWriteHead = res.writeHead;
    res.writeHead = function measuredWriteHead(...args) {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${durationMs.toFixed(1)}ms`);
        res.setHeader('Server-Timing', `app;dur=${durationMs.toFixed(1)}`);
      }
      return originalWriteHead.apply(this, args);
    };
    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      if (durationMs >= slowMs)
        logger.warn('slow_request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Number(durationMs.toFixed(1))
        });
    });
    next();
  };
}
