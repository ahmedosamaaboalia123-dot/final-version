import { sendCreated, sendSuccess } from '../../platform/http/response.js';
import { reviewDto } from '../reviews/review.mapper.js';
import {
  bootstrapGuestSession,
  cancelProposal,
  confirmProposal,
  getCurrentProposal,
  reviewProposal,
  submitGuestReview,
  submitProposal
} from './table-experience.service.js';
import { getProposalDetails, listProposals, proposalDto } from './table-experience.queries.js';

const ctx = (r, d) => ({
  ...d.serviceContext,
  actorType: r.auth?.actorType ?? 'GUEST',
  actorId: r.auth?.actorId,
  requestId: r.requestId,
  clientIp: r.ip
});

export function createTableGuestController(d) {
  return {
    bootstrap: async (r, s) => {
      const result = await bootstrapGuestSession(r.validated.body, ctx(r, d));
      return sendCreated(s, {
        session: {
          id: String(result.session._id),
          guestSessionNumber: result.session.guestSessionNumber,
          tableNumber: result.table.tableNumber,
          expiresAt: result.expiresAt
        },
        table: result.table,
        tableToken: result.tableToken
      });
    },
    propose: async (r, s) => {
      const result = await submitProposal(r.guestSession, r.validated.body, ctx(r, d));
      return sendCreated(s, {
        proposal: proposalDto(result.proposal),
        serviceRequest: result.serviceRequest
          ? {
              id: String(result.serviceRequest._id),
              type: result.serviceRequest.type,
              purpose: result.serviceRequest.purpose,
              status: result.serviceRequest.status
            }
          : null
      });
    },
    current: async (r, s) => {
      const proposal = await getCurrentProposal(r.guestSession, ctx(r, d));
      return sendSuccess(s, { proposal: proposal ? proposalDto(proposal) : null });
    },
    cancel: async (r, s) =>
      sendSuccess(s, {
        proposal: proposalDto(await cancelProposal(r.guestSession, null, ctx(r, d)))
      }),
    review: async (r, s) =>
      sendCreated(s, {
        review: reviewDto(
          await submitGuestReview(
            r.guestSession,
            r.validated.params.id,
            r.validated.body,
            ctx(r, d)
          )
        )
      })
  };
}

export function createTableProposalController(d) {
  return {
    screen: async (r, s) => sendSuccess(s, await listProposals(r.validated.query, ctx(r, d))),
    details: async (r, s) =>
      sendSuccess(s, await getProposalDetails(r.validated.params.id, ctx(r, d))),
    startReview: async (r, s) =>
      sendSuccess(s, {
        proposal: proposalDto(
          await reviewProposal(
            r.validated.params.id,
            { to: 'UNDER_REVIEW', expectedVersion: r.validated.body.expectedVersion },
            ctx(r, d)
          )
        )
      }),
    requestChanges: async (r, s) =>
      sendSuccess(s, {
        proposal: proposalDto(
          await reviewProposal(
            r.validated.params.id,
            {
              to: 'NEEDS_CHANGES',
              note: r.validated.body.note,
              expectedVersion: r.validated.body.expectedVersion
            },
            ctx(r, d)
          )
        )
      }),
    reject: async (r, s) =>
      sendSuccess(s, {
        proposal: proposalDto(
          await reviewProposal(
            r.validated.params.id,
            {
              to: 'REJECTED',
              note: r.validated.body.note,
              expectedVersion: r.validated.body.expectedVersion
            },
            ctx(r, d)
          )
        )
      }),
    confirm: async (r, s) => {
      const result = await confirmProposal(r.validated.params.id, r.validated.body, ctx(r, d));
      return sendSuccess(s, {
        proposal: proposalDto(result.proposal),
        order: { id: String(result.order._id), status: result.order.status },
        session: { id: String(result.session._id), status: result.session.status }
      });
    }
  };
}
