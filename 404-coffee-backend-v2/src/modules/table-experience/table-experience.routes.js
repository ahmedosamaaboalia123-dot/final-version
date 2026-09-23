import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createGuestGuards } from './table-experience.middleware.js';
import {
  createTableGuestController,
  createTableProposalController
} from './table-experience.controller.js';
import {
  bootstrapBody,
  confirmProposalBody,
  emptyBody,
  guestReviewBody,
  idParams,
  proposalBody,
  proposalScreenQuery,
  reviewChangeBody
} from './table-experience.validation.js';

export function createTableGuestRouter(d) {
  const r = Router(),
    c = createTableGuestController(d),
    guards = createGuestGuards(d);
  r.post(
    '/table-experience/bootstrap',
    validate({ body: bootstrapBody }),
    asyncHandler(c.bootstrap)
  );
  r.post(
    '/table-experience/order-proposals',
    validate({ body: proposalBody }),
    guards.guest,
    idempotentAsyncHandler('table-experience.propose', c.propose, { publicActor: true })
  );
  r.get('/table-experience/order-proposals/current', guards.guest, asyncHandler(c.current));
  r.post(
    '/table-experience/order-proposals/cancel',
    validate({ body: emptyBody }),
    guards.guest,
    idempotentAsyncHandler('table-experience.cancel', c.cancel, { publicActor: true })
  );
  r.post(
    '/table-experience/orders/:id/reviews',
    validate({ params: idParams, body: guestReviewBody }),
    guards.guest,
    idempotentAsyncHandler('table-experience.review', c.review, { publicActor: true })
  );
  return r;
}

export function createTableProposalRouter(d) {
  const r = Router(),
    c = createTableProposalController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.get(
    '/table-order-proposals',
    requirePermission(AUTH_PERMISSIONS.TABLE_PROPOSALS_READ),
    validate({ query: proposalScreenQuery }),
    asyncHandler(c.screen)
  );
  r.get(
    '/table-order-proposals/:id',
    requirePermission(AUTH_PERMISSIONS.TABLE_PROPOSALS_READ),
    validate({ params: idParams }),
    asyncHandler(c.details)
  );
  r.post(
    '/table-order-proposals/:id/start-review',
    requirePermission(AUTH_PERMISSIONS.TABLE_PROPOSALS_REVIEW),
    validate({ params: idParams, body: reviewChangeBody }),
    idempotentAsyncHandler('table-proposals.start-review', c.startReview)
  );
  r.post(
    '/table-order-proposals/:id/request-changes',
    requirePermission(AUTH_PERMISSIONS.TABLE_PROPOSALS_REVIEW),
    validate({ params: idParams, body: reviewChangeBody }),
    idempotentAsyncHandler('table-proposals.request-changes', c.requestChanges)
  );
  r.post(
    '/table-order-proposals/:id/reject',
    requirePermission(AUTH_PERMISSIONS.TABLE_PROPOSALS_REVIEW),
    validate({ params: idParams, body: reviewChangeBody }),
    idempotentAsyncHandler('table-proposals.reject', c.reject)
  );
  r.post(
    '/table-order-proposals/:id/confirm',
    requirePermission(AUTH_PERMISSIONS.TABLE_PROPOSALS_REVIEW),
    validate({ params: idParams, body: confirmProposalBody }),
    idempotentAsyncHandler('table-proposals.confirm', c.confirm)
  );
  return r;
}
