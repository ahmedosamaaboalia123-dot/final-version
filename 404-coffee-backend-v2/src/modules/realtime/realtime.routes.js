import { Router } from 'express';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { createRealtimeController } from './realtime.controller.js';
import { syncQuery } from './realtime.validation.js';

export function createRealtimeRouter(d) {
  const r = Router(),
    c = createRealtimeController(d);
  r.get('/realtime/sync', validate({ query: syncQuery }), asyncHandler(c.sync));
  return r;
}
