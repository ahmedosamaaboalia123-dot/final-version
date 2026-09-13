import { Router } from 'express';
import { sendSuccess, sendServiceUnavailable } from '../platform/http/response.js';

export function createHealthRouter({ healthProbe, buildInfo }) {
  const router = Router();
  router.get('/health/live', (_req, res) => sendSuccess(res, { status: 'UP' }));
  router.get('/health/ready', async (_req, res, next) => {
    try {
      const dependencies = await healthProbe();
      const ready = Object.values(dependencies).every(
        (item) => item.status === 'UP' || item.required === false
      );
      const data = { status: ready ? 'UP' : 'DOWN', dependencies };
      return ready
        ? sendSuccess(res, data)
        : sendServiceUnavailable(res, {
            code: 'SERVICE_NOT_READY',
            messageAr: 'الخدمة غير جاهزة',
            retryable: true,
            details: data
          });
    } catch (error) {
      return next(error);
    }
  });
  router.get('/system/version', (_req, res) => sendSuccess(res, buildInfo));
  return router;
}
