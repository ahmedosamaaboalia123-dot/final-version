import { add, multiply, toDecimal128 } from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { createOpaqueToken, hashToken } from '../../shared/utils/hash-token.js';
import { Order } from '../orders/order.models.js';
import { appendOrderItems } from '../orders/order.public-service.js';
import { openTableOrder } from '../tables/tables.public-service.js';
import { Table } from '../tables/tables.models.js';
import { TableSession } from '../tables/tables.models.js';
import { TableGuestSession, TableOrderProposal } from './table-experience.models.js';

const defaults = { Table, TableGuestSession, TableOrderProposal };
const orderDefaults = { Order };
const ZERO = '0';
const GUEST_SESSION_HOURS = 12;

async function record(kind, entityId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'table-experience',
      action: kind,
      actor: { type: context.actorType ?? 'GUEST', id: context.actorId },
      entity: { type: 'TableOrderProposal', id: entityId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'TableOrderProposal',
      aggregateId: String(entityId),
      eventType: kind,
      payload,
      sequence: payload.sequence ?? 1
    },
    context
  );
}

export async function bootstrapGuestSession(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableGuestModels ?? defaults;
      const now = context.now ?? new Date();
      const table = await models.Table.findOne({ tableNumber: input.tableNumber });
      if (!table || table.outOfService)
        throw new ApiError({
          code: 'TABLE_NOT_FOUND',
          status: 404,
          messageAr: 'الطاولة غير موجودة'
        });
      const sequence = await nextSequence('table-guest-session', { ...context, ...tx });
      const tableToken = createOpaqueToken();
      const [session] = await models.TableGuestSession.create(
        [
          {
            guestSessionNumber: `GS-${String(sequence).padStart(8, '0')}`,
            tableId: table._id,
            tableNumber: table.tableNumber,
            tokenHash: hashToken(tableToken),
            qrVersion: table.qrVersion,
            expiresAt: new Date(now.getTime() + GUEST_SESSION_HOURS * 60 * 60 * 1000),
            lastSeenAt: now,
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      return {
        session,
        table: { id: String(table._id), tableNumber: table.tableNumber },
        tableToken,
        expiresAt: session.expiresAt
      };
    },
    context,
    context.transactionOptions
  );
}

export async function submitProposal(guestSession, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableGuestModels ?? defaults;
      const snapshot = context.guestProductsPort?.snapshot;
      if (!snapshot)
        throw new ApiError({
          code: 'PRODUCTS_PORT_UNAVAILABLE',
          status: 503,
          messageAr: 'خدمة المنتجات غير متاحة'
        });
      const open = await models.TableOrderProposal.findOne({
        guestSessionId: guestSession._id,
        status: { $in: ['WAITING_WAITER', 'UNDER_REVIEW', 'NEEDS_CHANGES'] }
      }).session(tx.session);
      if (open)
        throw new ApiError({
          code: 'PROPOSAL_ALREADY_OPEN',
          status: 409,
          messageAr: 'يوجد مقترح نشط بالفعل لهذه الجلسة'
        });
      const items = [];
      let subtotal = ZERO;
      for (const entry of input.items) {
        const snap = await snapshot(
          {
            productId: entry.productId,
            productSizeId: entry.productSizeId,
            addonIds: entry.addonIds
          },
          { ...context, ...tx }
        );
        const addonTotal = snap.addons.reduce((sum, addon) => add(sum, addon.price), ZERO);
        const lineSubtotal = multiply(
          add(snap.unitSellingPrice, addonTotal),
          String(entry.quantity)
        );
        subtotal = add(subtotal, lineSubtotal);
        items.push({
          productId: entry.productId,
          productSizeId: entry.productSizeId,
          addonIds: entry.addonIds ?? [],
          productName: snap.product.name,
          typeName: snap.type.name,
          sizeName: snap.size.name,
          unitSellingPrice: toDecimal128(add(snap.unitSellingPrice, addonTotal)),
          quantity: entry.quantity,
          lineSubtotal: toDecimal128(lineSubtotal),
          notes: entry.notes
        });
      }
      const sequence = await nextSequence('table-order-proposal', { ...context, ...tx });
      const [proposal] = await models.TableOrderProposal.create(
        [
          {
            proposalNumber: `PO-${String(sequence).padStart(8, '0')}`,
            guestSessionId: guestSession._id,
            tableId: guestSession.tableId,
            tableNumber: guestSession.tableNumber,
            items,
            subtotal: toDecimal128(subtotal),
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      await record(
        'proposal.created',
        proposal._id,
        {
          proposalId: String(proposal._id),
          proposalNumber: proposal.proposalNumber,
          tableNumber: guestSession.tableNumber
        },
        { ...context, ...tx }
      );
      const notify = context.tableServicesPort?.notifyProposal;
      const serviceCall = notify
        ? await notify(proposal, { ...context, ...tx })
        : { serviceRequest: null, alreadyOpen: false };
      return { proposal, serviceRequest: serviceCall.serviceRequest };
    },
    context,
    context.transactionOptions
  );
}

export async function getCurrentProposal(guestSession, context = {}) {
  const models = context.tableGuestModels ?? defaults;
  return models.TableOrderProposal.findOne({
    guestSessionId: guestSession._id,
    status: { $in: ['WAITING_WAITER', 'UNDER_REVIEW', 'NEEDS_CHANGES'] }
  }).lean();
}

export async function cancelProposal(guestSession, proposalId, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableGuestModels ?? defaults;
      const query = {
        guestSessionId: guestSession._id,
        status: { $in: ['WAITING_WAITER', 'UNDER_REVIEW', 'NEEDS_CHANGES'] }
      };
      if (proposalId) query._id = proposalId;
      const proposal = await models.TableOrderProposal.findOne(query).session(tx.session);
      if (!proposal)
        throw new ApiError({
          code: 'PROPOSAL_CANCEL_CONFLICT',
          status: 409,
          messageAr: 'لا يوجد مقترح نشط للإلغاء'
        });
      proposal.status = 'CANCELLED';
      await proposal.save({ session: tx.session });
      await record(
        'proposal.cancelled',
        proposal._id,
        { proposalId: String(proposal._id) },
        { ...context, ...tx }
      );
      return proposal;
    },
    context,
    context.transactionOptions
  );
}

export async function reviewProposal(proposalId, transition, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableGuestModels ?? defaults;
      const proposal = await models.TableOrderProposal.findOne({
        _id: proposalId,
        version: transition.expectedVersion
      }).session(tx.session);
      if (!proposal)
        throw new ApiError({
          code: 'PROPOSAL_VERSION_CONFLICT',
          status: 409,
          messageAr: 'المقترح غير موجود أو تغير'
        });
      const from = ['WAITING_WAITER', 'UNDER_REVIEW', 'NEEDS_CHANGES'];
      if (transition.to === 'UNDER_REVIEW' && proposal.status !== 'WAITING_WAITER')
        throw new ApiError({
          code: 'PROPOSAL_REVIEW_CONFLICT',
          status: 409,
          messageAr: 'المقترح غير متاح للمراجعة'
        });
      if (['NEEDS_CHANGES', 'REJECTED'].includes(transition.to) && !from.includes(proposal.status))
        throw new ApiError({
          code: 'PROPOSAL_REVIEW_CONFLICT',
          status: 409,
          messageAr: 'المقترح غير متاح لهذا الإجراء'
        });
      proposal.status = transition.to;
      if (transition.note !== undefined) proposal.reviewNote = transition.note;
      await proposal.save({ session: tx.session });
      await record(
        `proposal.${transition.to.toLowerCase().replaceAll('_', '-')}`,
        proposal._id,
        { proposalId: String(proposal._id), status: transition.to },
        { ...context, ...tx }
      );
      return proposal;
    },
    context,
    context.transactionOptions
  );
}

export async function confirmProposal(proposalId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableGuestModels ?? defaults;
      const orderModels = context.guestOrderModels ?? orderDefaults;
      const proposal = await models.TableOrderProposal.findOne({
        _id: proposalId,
        version: input.expectedVersion,
        status: { $in: ['WAITING_WAITER', 'UNDER_REVIEW', 'NEEDS_CHANGES'] }
      }).session(tx.session);
      if (!proposal)
        throw new ApiError({
          code: 'PROPOSAL_CONFIRM_CONFLICT',
          status: 409,
          messageAr: 'المقترح غير متاح للتأكيد أو تغير'
        });
      const table = await models.Table.findOne({
        _id: proposal.tableId,
        version: input.expectedTableVersion
      }).session(tx.session);
      if (!table || table.outOfService)
        throw new ApiError({
          code: 'TABLE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الطاولة غير متاحة أو تغيرت'
        });
      const entries = proposal.items.map((item) => ({
        productId: String(item.productId),
        productSizeId: String(item.productSizeId),
        quantity: item.quantity,
        addonIds: (item.addonIds ?? []).map(String),
        notes: item.notes
      }));
      const open = context.tablesModule?.open ?? openTableOrder;
      const append = context.orderModule?.append ?? appendOrderItems;
      const sessionModels = context.tablesModels ?? { TableSession };
      const active = await sessionModels.TableSession.findOne({
        tableId: table._id,
        status: { $in: ['OPEN', 'CLOSING'] }
      }).session(tx.session);
      let order;
      let session;
      if (active?.activeOrderId) {
        const appended = await append(
          active.activeOrderId,
          { items: entries, expectedVersion: input.expectedOrderVersion },
          { ...context, ...tx }
        );
        order = appended.order;
        session = active;
      } else {
        const opened = await open(
          table._id,
          { items: entries, expectedTableVersion: table.version },
          { ...context, ...tx }
        );
        order = opened.order;
        session = opened.session;
      }
      const full = await orderModels.Order.findById(order._id).session(tx.session);
      if (full) {
        full.tableGuestSessionId = proposal.guestSessionId;
        await full.save({ session: tx.session });
      }
      proposal.status = 'CONFIRMED';
      proposal.tableSessionId = session._id;
      proposal.confirmedOrderId = order._id;
      await proposal.save({ session: tx.session });
      const resolveCalls = context.tableServicesPort?.resolveProposalCalls;
      if (resolveCalls) await resolveCalls(proposal._id, { ...context, ...tx });
      await record(
        'proposal.confirmed',
        proposal._id,
        {
          proposalId: String(proposal._id),
          orderId: String(order._id),
          sessionId: String(session._id)
        },
        { ...context, ...tx }
      );
      return { proposal, order, session };
    },
    context,
    context.transactionOptions
  );
}

export async function submitGuestReview(guestSession, orderId, input, context = {}) {
  const models = context.tableGuestModels ?? defaults;
  const orderModels = context.guestOrderModels ?? orderDefaults;
  const order = await orderModels.Order.findById(orderId).lean();
  if (!order || order.fulfillmentType !== 'DINE_IN' || order.status !== 'COMPLETED')
    throw new ApiError({
      code: 'REVIEW_ORDER_NOT_COMPLETED',
      status: 409,
      messageAr: 'التقييم متاح بعد اكتمال طلب الصالة فقط'
    });
  const link = await models.TableOrderProposal.findOne({
    guestSessionId: guestSession._id,
    confirmedOrderId: order._id,
    status: 'CONFIRMED'
  }).lean();
  if (!link)
    throw new ApiError({
      code: 'REVIEW_GUEST_NOT_LINKED',
      status: 403,
      messageAr: 'هذا الطلب غير مرتبط بجلستك'
    });
  const submit = context.guestReviewModule?.submit;
  if (!submit)
    throw new ApiError({
      code: 'REVIEW_PORT_UNAVAILABLE',
      status: 503,
      messageAr: 'خدمة التقييمات غير متاحة'
    });
  return submit(
    order._id,
    {
      rating: input.rating,
      comment: input.comment,
      expectedOrderVersion: input.expectedOrderVersion,
      owner: { type: 'GUEST', guestSessionId: guestSession._id }
    },
    context
  );
}

export { GUEST_SESSION_HOURS };
