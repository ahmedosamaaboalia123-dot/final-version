import { ApiError } from './api-error.js';

export function responseTimeout(timeoutMs) {
  return function responseDeadline(req, res, next) {
    const timer = setTimeout(() => {
      if (!res.headersSent)
        next(
          new ApiError({
            code: 'REQUEST_TIMEOUT',
            status: 503,
            messageAr: 'استغرق الطلب وقتًا أطول من المسموح',
            retryable: true
          })
        );
    }, timeoutMs);
    timer.unref?.();
    const clear = () => clearTimeout(timer);
    res.once('finish', clear);
    res.once('close', clear);
    next();
  };
}
