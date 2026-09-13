import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { ApiError } from '../../platform/http/api-error.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createMediaController, uploadSingleImage } from './media.controller.js';
import { contentQuery, deleteBody, idParams, listQuery } from './media.validation.js';

function handleMulterUpload(req, res, next) {
  uploadSingleImage(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_UNEXPECTED_FILE')
      return next(
        new ApiError({
          code: 'MEDIA_TOO_LARGE',
          status: 413,
          messageAr: 'حجم الصورة أكبر من المسموح'
        })
      );
    return next(
      new ApiError({ code: 'MEDIA_UPLOAD_FAILED', status: 422, messageAr: 'تعذر استلام الصورة' })
    );
  });
}

export function createMediaRouter(d) {
  const r = Router(),
    c = createMediaController(d);
  r.get(
    '/media/:id/content',
    validate({ params: idParams, query: contentQuery }),
    asyncHandler(c.content)
  );
  r.use(employeeAuth(d.config, d.authDependencies));
  r.post(
    '/media/uploads',
    requirePermission(AUTH_PERMISSIONS.MEDIA_UPLOAD),
    handleMulterUpload,
    validate({}),
    asyncHandler(c.upload)
  );
  r.get(
    '/media',
    requirePermission(AUTH_PERMISSIONS.MEDIA_READ),
    validate({ query: listQuery }),
    asyncHandler(c.list)
  );
  r.get(
    '/media/:id',
    requirePermission(AUTH_PERMISSIONS.MEDIA_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.delete(
    '/media/:id',
    requirePermission(AUTH_PERMISSIONS.MEDIA_UPLOAD),
    validate({ params: idParams, body: deleteBody }),
    asyncHandler(c.remove)
  );
  return r;
}
