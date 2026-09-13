import { sendSuccess } from '../../platform/http/response.js';
import {
  approveCancellationRequest,
  rejectCancellationRequest,
  retryPendingCashRefund,
  sweepPendingCashRefunds
} from './order-cases.service.js';
import { getCancellationRequest, listCancellationRequests } from './order-cases.queries.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

export function createOrderCasesController(d) {
  return {
    list: async (r, s) =>
      sendSuccess(s, await listCancellationRequests(r.validated.query, ctx(r, d))),
    details: async (r, s) =>
      sendSuccess(s, await getCancellationRequest(r.validated.params.id, ctx(r, d))),
    approve: async (r, s) => {
      const result = await approveCancellationRequest(
        r.validated.params.id,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        request: { id: String(result.request._id), status: result.request.status },
        order: { id: String(result.order._id), status: result.order.status },
        refundCase: result.refundCase
      });
    },
    reject: async (r, s) => {
      const result = await rejectCancellationRequest(
        r.validated.params.id,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        request: { id: String(result.request._id), status: result.request.status }
      });
    },
    retry: async (r, s) => {
      const result = await retryPendingCashRefund(
        r.validated.params.id,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, {
        recovered: result.recovered,
        refund: { id: String(result.refund._id), status: result.refund.status },
        outstandingCash: result.outstandingCash ?? null
      });
    },
    sweep: async (r, s) => sendSuccess(s, await sweepPendingCashRefunds(ctx(r, d)))
  };
}
