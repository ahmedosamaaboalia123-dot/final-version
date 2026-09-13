import { sendSuccess } from '../../platform/http/response.js';
import { chatWithBarista } from './customer-ai.service.js';

const ctx = (r, d) => ({
  ...d.serviceContext,
  actorType: 'CUSTOMER',
  requestId: r.requestId,
  clientIp: r.ip
});

export function createCustomerAiController(d) {
  return {
    chat: async (r, s) => sendSuccess(s, await chatWithBarista(r.validated.body, ctx(r, d)))
  };
}
