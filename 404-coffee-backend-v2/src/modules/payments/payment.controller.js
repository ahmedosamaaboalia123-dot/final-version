import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { paymentDto, refundDto } from './payment.mapper.js';
import {
  collectCash,
  completePendingCashRefund,
  createCashRefund,
  settleCodPayment
} from './payment.service.js';
import { listOrderPayments } from './payment.queries.js';
import { transactionDto } from '../drawer/drawer.service.js';
const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });
const resultDto = (x) => ({
  payment: paymentDto(x.payment),
  order: x.order,
  drawerTransaction: x.drawerTransaction ? transactionDto(x.drawerTransaction) : null
});
export function createPaymentController(d) {
  return {
    collect: async (r, s) =>
      sendCreated(
        s,
        resultDto(await collectCash(r.validated.params.id, r.validated.body, ctx(r, d)))
      ),
    settle: async (r, s) =>
      sendSuccess(
        s,
        resultDto(await settleCodPayment(r.validated.params.id, r.validated.body, ctx(r, d)))
      ),
    refund: async (r, s) => {
      const x = await createCashRefund(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendCreated(s, { ...resultDto(x), refund: refundDto(x.refund) });
    },
    completeRefund: async (r, s) => {
      const x = await completePendingCashRefund(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, { ...resultDto(x), refund: refundDto(x.refund) });
    },
    list: async (r, s) =>
      sendSuccess(s, await listOrderPayments(r.validated.params.id, r.validated.query, ctx(r, d)))
  };
}
