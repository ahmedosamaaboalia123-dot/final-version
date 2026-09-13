import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { assignmentDto, delegateDto } from './delivery.mapper.js';
import {
  adminConfirmDelivery,
  assignDelegate,
  createDelegate,
  handoverAssignment,
  reassignDelivery,
  recordFailedAttempt,
  recordWhatsappShare,
  returnDeliveryToStore,
  settleAssignmentCash,
  updateDelegate
} from './delivery.service.js';
import {
  getAssignmentDetails,
  getDelegateDetails,
  getDelegatesScreen
} from './delivery.queries.js';

const ctx = (r, d) => ({ ...r.auth, ...d.serviceContext });

const parseInclude = (value) =>
  Object.fromEntries(
    String(value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => [part, true])
  );

export function createDeliveryController(d) {
  return {
    screen: async (r, s) => sendSuccess(s, await getDelegatesScreen(r.validated.query, ctx(r, d))),
    create: async (r, s) =>
      sendCreated(s, { delegate: delegateDto(await createDelegate(r.validated.body, ctx(r, d))) }),
    details: async (r, s) =>
      sendSuccess(
        s,
        await getDelegateDetails(
          r.validated.params.id,
          parseInclude(r.validated.query.include),
          ctx(r, d)
        )
      ),
    update: async (r, s) =>
      sendSuccess(s, {
        delegate: delegateDto(
          await updateDelegate(r.validated.params.id, r.validated.body, ctx(r, d))
        )
      }),
    assign: async (r, s) => {
      const result = await assignDelegate(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendCreated(s, {
        assignment: assignmentDto(result.assignment),
        order: { id: String(result.order._id), status: result.order.status }
      });
    },
    assignment: async (r, s) =>
      sendSuccess(s, await getAssignmentDetails(r.validated.params.id, ctx(r, d))),
    handover: async (r, s) => {
      const result = await handoverAssignment(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        assignment: assignmentDto(result.assignment),
        order: { id: String(result.order._id), status: result.order.status }
      });
    },
    reassign: async (r, s) => {
      const result = await reassignDelivery(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, { assignment: assignmentDto(result.assignment) });
    },
    failed: async (r, s) => {
      const result = await recordFailedAttempt(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, { assignment: assignmentDto(result.assignment) });
    },
    returned: async (r, s) => {
      const result = await returnDeliveryToStore(
        r.validated.params.id,
        r.validated.body,
        ctx(r, d)
      );
      return sendSuccess(s, { assignment: assignmentDto(result.assignment) });
    },
    override: async (r, s) => {
      const result = await adminConfirmDelivery(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        order: { id: String(result.order._id), status: result.order.status },
        confirmation: { id: String(result.confirmation._id), source: result.confirmation.source }
      });
    },
    settle: async (r, s) => {
      const result = await settleAssignmentCash(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        assignment: assignmentDto(result.assignment),
        settledPayments: result.payments.length,
        outstandingCash: result.outstandingCash
      });
    },
    whatsapp: async (r, s) => {
      const result = await recordWhatsappShare(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, result);
    }
  };
}
