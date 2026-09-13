import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { serviceRequestDto } from './table-services.mapper.js';
import {
  cancelServiceRequest,
  createServiceRequest,
  resolveServiceRequest
} from './table-services.service.js';
import { getServiceRequestDetails, getServicesScreen } from './table-services.queries.js';

const ctx = (r, d) => ({
  ...d.serviceContext,
  actorType: r.auth?.actorType ?? 'GUEST',
  actorId: r.auth?.actorId,
  requestId: r.requestId,
  clientIp: r.ip
});

export function createTableServiceGuestController(d) {
  return {
    create: async (r, s) => {
      const result = await createServiceRequest(r.guestSession, r.validated.body, ctx(r, d));
      const send = result.alreadyOpen ? sendSuccess : sendCreated;
      return send(s, {
        serviceRequest: serviceRequestDto(result.serviceRequest),
        alreadyOpen: result.alreadyOpen
      });
    },
    cancel: async (r, s) =>
      sendSuccess(s, {
        serviceRequest: serviceRequestDto(
          await cancelServiceRequest(
            r.guestSession,
            r.validated.params.id,
            r.validated.body,
            ctx(r, d)
          )
        )
      })
  };
}

export function createTableServiceAdminController(d) {
  const adminCtx = (r) => ({ ...r.auth, ...d.serviceContext });
  return {
    screen: async (r, s) => sendSuccess(s, await getServicesScreen(r.validated.query, adminCtx(r))),
    details: async (r, s) =>
      sendSuccess(s, await getServiceRequestDetails(r.validated.params.id, adminCtx(r))),
    resolve: async (r, s) =>
      sendSuccess(s, {
        serviceRequest: serviceRequestDto(
          await resolveServiceRequest(r.validated.params.id, r.validated.body, adminCtx(r))
        )
      })
  };
}
