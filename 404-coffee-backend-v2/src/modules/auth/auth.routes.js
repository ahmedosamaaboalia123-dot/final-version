import { Router } from 'express';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { createAuthController } from './auth.controller.js';
import { loginBody, logoutBody, refreshBody } from './auth.validation.js';

export function createAuthRouter(dependencies) {
  const router = Router();
  const controller = createAuthController(dependencies);
  router.post('/login', validate({ body: loginBody }), asyncHandler(controller.login));
  router.post('/refresh', validate({ body: refreshBody }), asyncHandler(controller.refresh));
  router.post('/logout', validate({ body: logoutBody }), asyncHandler(controller.logout));
  return router;
}
