import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createReviewController } from './review.controller.js';
import {
  idParams,
  listQuery,
  moderationBody,
  submitBody,
  updateBody
} from './review.validation.js';

export function createReviewRouter(d) {
  const r = Router(),
    c = createReviewController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/reviews',
    requirePermission(AUTH_PERMISSIONS.REVIEWS_READ),
    validate({ query: listQuery }),
    asyncHandler(c.list)
  );
  r.post(
    '/orders/:id/reviews',
    requirePermission(AUTH_PERMISSIONS.REVIEWS_SUBMIT),
    validate({ params: idParams, body: submitBody }),
    asyncHandler(c.submit)
  );
  r.get(
    '/orders/:id/reviews',
    requirePermission(AUTH_PERMISSIONS.REVIEWS_READ),
    validate({ params: idParams }),
    asyncHandler(c.byOrder)
  );
  r.patch(
    '/reviews/:id',
    requirePermission(AUTH_PERMISSIONS.REVIEWS_SUBMIT),
    validate({ params: idParams, body: updateBody }),
    asyncHandler(c.update)
  );
  r.post(
    '/reviews/:id/moderation',
    requirePermission(AUTH_PERMISSIONS.REVIEWS_MODERATE),
    validate({ params: idParams, body: moderationBody }),
    asyncHandler(c.moderate)
  );
  return r;
}
