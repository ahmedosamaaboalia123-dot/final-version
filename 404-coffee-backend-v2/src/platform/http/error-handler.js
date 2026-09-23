import { logger } from '../observability/logger.js';
import { ApiError } from './api-error.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', messageAr: 'المسار غير موجود', retryable: false },
    meta: { requestId: res.locals.requestId, serverTime: new Date().toISOString() }
  });
}

export function errorHandler(error, req, res, _next) {
  if (res.headersSent || res.writableEnded) return;
  const mapped = mapMongoError(error);
  const status = Number.isInteger(mapped.status) ? mapped.status : 500;
  const code = mapped.code || 'INTERNAL_ERROR';
  if (status >= 500)
    logger.error('request_failed', {
      code,
      error: mapped.message,
      method: req.method,
      path: req.originalUrl
    });
  res.status(status).json({
    ok: false,
    error: {
      code,
      messageAr: status >= 500 ? 'حدث خطأ داخلي' : mapped.messageAr || mapped.message,
      fieldErrors: mapped.fieldErrors ?? [],
      ...(mapped.details ? { details: mapped.details } : {}),
      retryable: Boolean(mapped.retryable)
    },
    meta: { requestId: res.locals.requestId, serverTime: new Date().toISOString() }
  });
}

export function mapMongoError(error) {
  if (error?.name === 'VersionError') {
    return new ApiError({
      code: 'VERSION_CONFLICT',
      status: 409,
      messageAr: 'تغيرت البيانات أثناء تنفيذ العملية، أعد تحميل الصفحة وحاول مرة أخرى',
      retryable: true,
      cause: error
    });
  }
  if (error?.code === 11000) {
    return new ApiError({
      code: 'DUPLICATE_VALUE',
      status: 409,
      messageAr: 'القيمة مستخدمة بالفعل',
      details: {
        fields: Object.keys(error.keyPattern ?? {}),
        index:
          typeof error.message === 'string'
            ? (error.message.match(/index:\s+([^\s]+)\s+dup key/)?.[1] ?? null)
            : null
      }
    });
  }
  if (error?.hasErrorLabel?.('TransientTransactionError')) {
    return new ApiError({
      code: 'TRANSACTION_CONFLICT',
      status: 409,
      messageAr: 'حدث تعارض متزامن',
      retryable: true,
      cause: error
    });
  }
  if (error?.type === 'entity.too.large') {
    return new ApiError({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      messageAr: 'حجم الطلب أكبر من المسموح'
    });
  }
  return error;
}
