import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import { TableOrderProposal } from './table-experience.models.js';

export const proposalDto = (proposal) => ({
  id: String(proposal._id),
  proposalNumber: proposal.proposalNumber,
  tableNumber: proposal.tableNumber,
  status: proposal.status,
  items: (proposal.items ?? []).map((item) => ({
    productName: item.productName,
    sizeName: item.sizeName,
    quantity: item.quantity,
    lineSubtotal: toApiString(item.lineSubtotal ?? '0')
  })),
  subtotal: toApiString(proposal.subtotal ?? '0'),
  reviewNote: proposal.reviewNote ?? null,
  confirmedOrderId: proposal.confirmedOrderId ? String(proposal.confirmedOrderId) : null,
  version: proposal.version ?? 0
});

export async function listProposals(filters = {}, context = {}) {
  const models = context.tableGuestModels ?? { TableOrderProposal };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.tableNumber) query.tableNumber = filters.tableNumber;
  const [rows, totalItems, waiting] = await Promise.all([
    models.TableOrderProposal.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.TableOrderProposal.countDocuments(query),
    models.TableOrderProposal.countDocuments({ ...query, status: 'WAITING_WAITER' })
  ]);
  return {
    summary: { total: totalItems, waiting },
    proposals: rows.map(proposalDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function getProposalDetails(id, context = {}) {
  const models = context.tableGuestModels ?? { TableOrderProposal };
  const proposal = await models.TableOrderProposal.findById(id).lean();
  if (!proposal)
    throw new ApiError({ code: 'PROPOSAL_NOT_FOUND', status: 404, messageAr: 'المقترح غير موجود' });
  return { proposal: proposalDto(proposal) };
}
