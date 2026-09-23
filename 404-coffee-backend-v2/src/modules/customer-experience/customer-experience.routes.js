import { Router } from 'express';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { createPublicGuards } from './customer-experience.middleware.js';
import { createCustomerExperienceController } from './customer-experience.controller.js';
import {
  accessSessionBody,
  cancellationBody,
  checkoutBody,
  historyQuery,
  lookupBody,
  orderNumberParams,
  publicAppendBody,
  publicReviewBody,
  receiveBody
} from './customer-experience.validation.js';

export function createCustomerExperienceRouter(d) {
  const r = Router(),
    c = createCustomerExperienceController(d),
    guards = createPublicGuards(d);
  r.post(
    '/public-orders',
    validate({ body: checkoutBody }),
    idempotentAsyncHandler('public-orders.create', c.checkout, { publicActor: true })
  );
  r.post('/public-orders/lookup', validate({ body: lookupBody }), asyncHandler(c.lookup));
  r.get(
    '/public-orders/:orderNumber/tracking',
    validate({ params: orderNumberParams }),
    guards.tracking,
    asyncHandler(c.tracking)
  );
  r.post(
    '/public-orders/:orderNumber/items',
    validate({ params: orderNumberParams, body: publicAppendBody }),
    guards.action,
    idempotentAsyncHandler('public-orders.append', c.append, { publicActor: true })
  );
  r.post(
    '/public-orders/:orderNumber/cancellation-request',
    validate({ params: orderNumberParams, body: cancellationBody }),
    guards.action,
    idempotentAsyncHandler('public-orders.cancel', c.cancel, { publicActor: true })
  );
  r.post(
    '/public-orders/:orderNumber/receive',
    validate({ params: orderNumberParams, body: receiveBody }),
    guards.action,
    idempotentAsyncHandler('public-orders.receive', c.receive, { publicActor: true })
  );
  r.post(
    '/public-orders/:orderNumber/reviews',
    validate({ params: orderNumberParams, body: publicReviewBody }),
    guards.action,
    idempotentAsyncHandler('public-orders.review', c.review, { publicActor: true })
  );
  r.post(
    '/customer-access-sessions',
    validate({ body: accessSessionBody }),
    asyncHandler(c.accessSession)
  );
  r.get(
    '/customer/orders',
    validate({ query: historyQuery }),
    guards.session,
    asyncHandler(c.history)
  );
  return r;
}
