import { Router } from 'express';
import { employeeAuth } from '../../platform/auth/employee-auth.middleware.js';
import { requirePermission } from '../../platform/auth/permission.middleware.js';
import { asyncHandler } from '../../platform/http/async-handler.js';
import { idempotentAsyncHandler } from '../../platform/http/idempotent-handler.js';
import { validate } from '../../platform/http/validate.middleware.js';
import { AUTH_PERMISSIONS } from '../../shared/constants/auth.constants.js';
import { createPaymentController } from './payment.controller.js';
import {
  collectBody,
  completeRefundBody,
  idParams,
  paymentListQuery,
  refundBody,
  settleBody
} from './payment.validation.js';
export function createPaymentRouter(d) {
  const r = Router(),
    c = createPaymentController(d);
  r.use(employeeAuth(d.config, d.authDependencies));
  r.post(
    '/orders/:id/payments',
    requirePermission(AUTH_PERMISSIONS.PAYMENTS_COLLECT),
    validate({ params: idParams, body: collectBody }),
    idempotentAsyncHandler('payments.collect', c.collect)
  );
  r.get(
    '/orders/:id/payments',
    requirePermission(AUTH_PERMISSIONS.PAYMENTS_READ),
    validate({ params: idParams, query: paymentListQuery }),
    asyncHandler(c.list)
  );
  r.post(
    '/order-payments/:id/settle',
    requirePermission(AUTH_PERMISSIONS.PAYMENTS_SETTLE),
    validate({ params: idParams, body: settleBody }),
    idempotentAsyncHandler('payments.settle', c.settle)
  );
  r.post(
    '/order-payments/:id/refunds',
    requirePermission(AUTH_PERMISSIONS.PAYMENTS_REFUND),
    validate({ params: idParams, body: refundBody }),
    idempotentAsyncHandler('payments.refund', c.refund)
  );
  r.post(
    '/cash-refunds/:id/complete',
    requirePermission(AUTH_PERMISSIONS.PAYMENTS_REFUND),
    validate({ params: idParams, body: completeRefundBody }),
    idempotentAsyncHandler('payments.complete-refund', c.completeRefund)
  );
  return r;
}
