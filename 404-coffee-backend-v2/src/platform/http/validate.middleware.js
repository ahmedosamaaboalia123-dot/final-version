import { ApiError } from './api-error.js';

export function formatValidationIssues(issues) {
  return issues.map((issue) => ({
    field: issue.path.join('.'),
    code: issue.code,
    message: issue.message
  }));
}

export function validate(schemas = {}) {
  return function validationMiddleware(req, _res, next) {
    try {
      const validated = {};
      for (const source of ['params', 'query', 'body']) {
        if (!schemas[source]) continue;
        const result = schemas[source].safeParse(req[source]);
        if (!result.success) {
          throw new ApiError({
            code: 'VALIDATION_ERROR',
            status: 400,
            messageAr: 'البيانات المدخلة غير صحيحة',
            fieldErrors: formatValidationIssues(result.error.issues)
          });
        }
        validated[source] = Object.freeze(result.data);
      }
      req.validated = Object.freeze(validated);
      next();
    } catch (error) {
      next(error);
    }
  };
}
