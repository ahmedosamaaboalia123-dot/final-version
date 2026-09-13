import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { customerDto } from './customer.mapper.js';
import { createCustomer, updateCustomerProfile } from './customer.service.js';
import { getCustomerDetails, getCustomersScreen } from './customer.queries.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

const parseInclude = (value) =>
  Object.fromEntries(
    String(value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => [part, { page: 1, limit: 10 }])
  );

export function createCustomerController(d) {
  return {
    screen: async (r, s) => sendSuccess(s, await getCustomersScreen(r.validated.query, ctx(r, d))),
    create: async (r, s) =>
      sendCreated(s, { customer: customerDto(await createCustomer(r.validated.body, ctx(r, d))) }),
    details: async (r, s) =>
      sendSuccess(
        s,
        await getCustomerDetails(
          r.validated.params.id,
          parseInclude(r.validated.query.include),
          ctx(r, d)
        )
      ),
    update: async (r, s) =>
      sendSuccess(s, {
        customer: customerDto(
          await updateCustomerProfile(r.validated.params.id, r.validated.body, ctx(r, d))
        )
      })
  };
}
