export class ApiError extends Error {
  constructor({ code, status = 500, messageAr, fieldErrors = [], details = null, retryable = false, cause }) {
    super(messageAr, { cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.messageAr = messageAr;
    this.fieldErrors = fieldErrors;
    this.details = details;
    this.retryable = retryable;
  }
}

export function assertOrThrow(condition, errorFactory) {
  if (!condition) throw typeof errorFactory === 'function' ? errorFactory() : errorFactory;
}
