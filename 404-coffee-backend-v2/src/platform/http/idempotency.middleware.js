import { ApiError } from './api-error.js';
import { hashCanonicalRequest } from '../idempotency/idempotency.service.js';

const VALID_KEY = /^[a-zA-Z0-9._:-]{8,128}$/;

export function readIdempotencyKey(req) {
  const key = req.get('idempotency-key');
  if (!key || !VALID_KEY.test(key))
    throw new ApiError({
      code: 'INVALID_IDEMPOTENCY_KEY',
      status: 422,
      messageAr: 'مفتاح العملية مطلوب أو صيغته غير صحيحة'
    });
  return key;
}

export function idempotencyContext(scope) {
  return function idempotencyMiddleware(req, _res, next) {
    try {
      req.idempotency = Object.freeze({
        key: readIdempotencyKey(req),
        scope,
        requestHash: hashCanonicalRequest({ params: req.params, query: req.query, body: req.body })
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}
