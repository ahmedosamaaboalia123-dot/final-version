import { Router } from 'express';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { createCustomerAiController } from './customer-ai.controller.js';
import { chatBody } from './customer-ai.validation.js';

export function createCustomerAiRouter(d) {
  const r = Router(),
    c = createCustomerAiController(d);
  r.post('/customer-ai/chat', validate({ body: chatBody }), asyncHandler(c.chat));
  return r;
}
