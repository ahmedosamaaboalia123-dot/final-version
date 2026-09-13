import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { TableSession } from '../tables/tables.models.js';
import { TableServiceRequest, TableServiceStatusEvent } from './table-services.models.js';

const defaults = { TableServiceRequest, TableServiceStatusEvent };
const sessionDefaults = { TableSession };

async function record(kind, requestId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'table-services',
      action: kind,
      actor: { type: context.actorType ?? 'GUEST', id: context.actorId },
      entity: { type: 'TableServiceRequest', id: requestId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'TableServiceRequest',
      aggregateId: String(requestId),
      eventType: kind,
      payload,
      sequence: payload.sequence ?? 1
    },
    context
  );
}

async function statusEvent(models, request, toStatus, context, tx, note) {
  await models.TableServiceStatusEvent.create(
    [
      {
        serviceRequestId: request._id,
        fromStatus: request.status,
        toStatus,
        actorType: context.actorType,
        actorId: context.actorId,
        note
      }
    ],
    { session: tx.session }
  );
  request.status = toStatus;
  await request.save({ session: tx.session });
}

async function ownerScope(sessionModels, guestSession) {
  const active = await sessionModels.TableSession.findOne({
    tableId: guestSession.tableId,
    status: { $in: ['OPEN', 'CLOSING'] }
  });
  if (active)
    return {
      requestOwnerKey: `SESSION:${active._id}`,
      tableSessionId: active._id,
      activeOrderId: active.activeOrderId ?? null
    };
  return {
    requestOwnerKey: `GUEST:${guestSession._id}`,
    tableSessionId: null,
    activeOrderId: null
  };
}

export async function createServiceRequest(guestSession, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableServiceModels ?? defaults;
      const sessionModels = context.serviceSessionModels ?? sessionDefaults;
      const scope = await ownerScope(sessionModels, guestSession);
      if (input.type === 'BILL_REQUEST' && !scope.activeOrderId)
        throw new ApiError({
          code: 'BILL_NO_ACTIVE_ORDER',
          status: 409,
          messageAr: 'طلب الحساب يتطلب طلبًا نشطًا على الطاولة'
        });
      const duplicate = await models.TableServiceRequest.findOne({
        requestOwnerKey: scope.requestOwnerKey,
        type: input.type,
        status: 'OPEN'
      }).session(tx.session);
      if (duplicate) return { serviceRequest: duplicate, alreadyOpen: true };
      const sequence = await nextSequence('table-service-request', { ...context, ...tx });
      try {
        const [serviceRequest] = await models.TableServiceRequest.create(
          [
            {
              serviceRequestNumber: `SR-${String(sequence).padStart(8, '0')}`,
              tableId: guestSession.tableId,
              tableNumberSnapshot: guestSession.tableNumber,
              tableSessionId: scope.tableSessionId,
              guestSessionId: guestSession._id,
              purpose: 'GENERAL',
              requestOwnerKey: scope.requestOwnerKey,
              type: input.type,
              details: input.details,
              problemCategory: input.problemCategory,
              requestedQuantity: input.requestedQuantity,
              priority: input.type === 'REPORT_PROBLEM' ? 'HIGH' : 'NORMAL',
              source: 'GUEST',
              requestedAt: context.now ?? new Date(),
              operationRequestId: context.operationRequestId
            }
          ],
          { session: tx.session }
        );
        await models.TableServiceStatusEvent.create(
          [
            {
              serviceRequestId: serviceRequest._id,
              fromStatus: null,
              toStatus: 'OPEN',
              actorType: context.actorType,
              actorId: context.actorId
            }
          ],
          { session: tx.session }
        );
        await record(
          'table-service.created',
          serviceRequest._id,
          {
            serviceRequestId: String(serviceRequest._id),
            type: input.type,
            tableNumber: guestSession.tableNumber
          },
          { ...context, ...tx }
        );
        return { serviceRequest, alreadyOpen: false };
      } catch (error) {
        if (error?.code !== 11000) throw error;
        const existing = await models.TableServiceRequest.findOne({
          requestOwnerKey: scope.requestOwnerKey,
          type: input.type,
          status: 'OPEN'
        }).session(tx.session);
        if (!existing) throw error;
        return { serviceRequest: existing, alreadyOpen: true };
      }
    },
    context,
    context.transactionOptions
  );
}

export async function createOrderReviewRequest(proposal, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableServiceModels ?? defaults;
      const sessionModels = context.serviceSessionModels ?? sessionDefaults;
      const active = await sessionModels.TableSession.findOne({
        tableId: proposal.tableId,
        status: { $in: ['OPEN', 'CLOSING'] }
      });
      const requestOwnerKey = active ? `SESSION:${active._id}` : `GUEST:${proposal.guestSessionId}`;
      const duplicate = await models.TableServiceRequest.findOne({
        requestOwnerKey,
        type: 'CALL_WAITER',
        status: 'OPEN'
      }).session(tx.session);
      if (duplicate) return { serviceRequest: duplicate, alreadyOpen: true };
      const sequence = await nextSequence('table-service-request', { ...context, ...tx });
      const [serviceRequest] = await models.TableServiceRequest.create(
        [
          {
            serviceRequestNumber: `SR-${String(sequence).padStart(8, '0')}`,
            tableId: proposal.tableId,
            tableNumberSnapshot: proposal.tableNumber,
            tableSessionId: active ? active._id : null,
            guestSessionId: proposal.guestSessionId,
            proposalId: proposal._id,
            purpose: 'ORDER_REVIEW',
            requestOwnerKey,
            type: 'CALL_WAITER',
            source: 'GUEST',
            requestedAt: context.now ?? new Date(),
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      await models.TableServiceStatusEvent.create(
        [
          {
            serviceRequestId: serviceRequest._id,
            fromStatus: null,
            toStatus: 'OPEN',
            actorType: context.actorType,
            actorId: context.actorId
          }
        ],
        { session: tx.session }
      );
      await record(
        'table-service.created',
        serviceRequest._id,
        {
          serviceRequestId: String(serviceRequest._id),
          type: 'CALL_WAITER',
          purpose: 'ORDER_REVIEW',
          proposalId: String(proposal._id)
        },
        { ...context, ...tx }
      );
      return { serviceRequest, alreadyOpen: false };
    },
    context,
    context.transactionOptions
  );
}

export async function resolveServiceRequest(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableServiceModels ?? defaults;
      const request = await models.TableServiceRequest.findOne({
        _id: id,
        version: input.expectedVersion,
        status: 'OPEN'
      }).session(tx.session);
      if (!request)
        throw new ApiError({
          code: 'SERVICE_RESOLVE_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير متاح للتعامل أو تغير'
        });
      const now = context.now ?? new Date();
      request.handledAt = now;
      request.handledBy = context.actorId;
      request.resolutionNote = input.resolutionNote;
      request.resultCode = input.resultCode;
      request.responseDurationSeconds = Math.max(
        0,
        Math.round((now.getTime() - request.requestedAt.getTime()) / 1000)
      );
      await statusEvent(models, request, 'RESOLVED', context, tx, input.resolutionNote);
      await record(
        'table-service.resolved',
        request._id,
        {
          serviceRequestId: String(request._id),
          type: request.type,
          responseDurationSeconds: request.responseDurationSeconds
        },
        { ...context, ...tx }
      );
      return request;
    },
    context,
    context.transactionOptions
  );
}

export async function cancelServiceRequest(guestSession, id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableServiceModels ?? defaults;
      const request = await models.TableServiceRequest.findOne({
        _id: id,
        guestSessionId: guestSession._id,
        version: input.expectedVersion,
        status: 'OPEN'
      }).session(tx.session);
      if (!request)
        throw new ApiError({
          code: 'SERVICE_CANCEL_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير متاح للإلغاء أو تغير'
        });
      const now = context.now ?? new Date();
      request.cancelledAt = now;
      request.cancelledBy = context.actorId;
      request.cancelReason = input.reason;
      await statusEvent(models, request, 'CANCELLED', context, tx, input.reason);
      await record(
        'table-service.cancelled',
        request._id,
        { serviceRequestId: String(request._id), type: request.type },
        { ...context, ...tx }
      );
      return request;
    },
    context,
    context.transactionOptions
  );
}

export async function resolveProposalServices(proposalId, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableServiceModels ?? defaults;
      const open = await models.TableServiceRequest.find({
        proposalId,
        status: 'OPEN'
      }).session(tx.session);
      for (const request of open) {
        request.resolutionNote = 'تم تأكيد المقترح';
        request.resultCode = 'HANDLED';
        request.handledAt = context.now ?? new Date();
        request.handledBy = context.actorId;
        await statusEvent(models, request, 'RESOLVED', context, tx, 'تم تأكيد المقترح');
      }
      return { resolved: open.length };
    },
    context,
    context.transactionOptions
  );
}

export async function closeSessionServices(tableSessionId, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tableServiceModels ?? defaults;
      const now = context.now ?? new Date();
      const open = await models.TableServiceRequest.find({
        tableSessionId,
        status: 'OPEN'
      }).session(tx.session);
      let resolved = 0;
      let cancelled = 0;
      for (const request of open) {
        if (request.type === 'BILL_REQUEST') {
          request.resolutionNote = 'إغلاق الجلسة';
          request.resultCode = 'HANDLED';
          request.handledAt = now;
          request.handledBy = context.actorId;
          await statusEvent(models, request, 'RESOLVED', context, tx, 'إغلاق الجلسة');
          resolved += 1;
        } else {
          request.cancelledAt = now;
          request.cancelledBy = context.actorId;
          request.cancelReason = 'إغلاق الجلسة';
          await statusEvent(models, request, 'CANCELLED', context, tx, 'إغلاق الجلسة');
          cancelled += 1;
        }
      }
      return { resolved, cancelled };
    },
    context,
    context.transactionOptions
  );
}
