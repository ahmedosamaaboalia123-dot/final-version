import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Order } from '../orders/order.models.js';
import { cancelWholeOrder } from '../orders/order.public-service.js';
import { completePendingCashRefund } from '../payments/payment.public-service.js';
import { CashRefund } from '../payments/payment.models.js';
import { OrderCancellationRequest } from '../customer-experience/customer-experience.models.js';

const defaults = { Order, OrderCancellationRequest, CashRefund };

async function record(kind, requestId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'order-cases',
      action: kind,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'OrderCancellationRequest', id: requestId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'OrderCancellationRequest',
      aggregateId: String(requestId),
      eventType: kind,
      payload,
      sequence: payload.sequence ?? 1
    },
    context
  );
}

export async function approveCancellationRequest(requestId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderCaseModels ?? defaults;
      const request = await models.OrderCancellationRequest.findOne({
        _id: requestId,
        version: input.expectedVersion,
        status: 'PENDING'
      }).session(tx.session);
      if (!request)
        throw new ApiError({
          code: 'CASE_APPROVE_CONFLICT',
          status: 409,
          messageAr: 'طلب الإلغاء غير معلق أو تغير'
        });
      const orderModels = context.caseOrderModels ?? { Order };
      const order = await orderModels.Order.findById(request.orderId).session(tx.session);
      if (!order)
        throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
      if (order.status === 'OUT_FOR_DELIVERY')
        throw new ApiError({
          code: 'ORDER_RETURN_REQUIRED',
          status: 409,
          messageAr: 'أعد الطلب للمحل أولًا قبل إلغائه'
        });
      const cancel = context.caseOrderModule?.cancelWhole ?? cancelWholeOrder;
      const cancelled = await cancel(
        order._id,
        { reason: request.reason, expectedVersion: order.version },
        { ...context, ...tx }
      );
      request.status = 'EXECUTED';
      request.decidedAt = context.now ?? new Date();
      request.decidedBy = context.actorId;
      await request.save({ session: tx.session });
      await record(
        'cancellation.approved',
        request._id,
        { requestId: String(request._id), orderId: String(order._id) },
        { ...context, ...tx }
      );
      return { request, order: cancelled.order, refundCase: cancelled.refundCase };
    },
    context,
    context.transactionOptions
  );
}

export async function rejectCancellationRequest(requestId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderCaseModels ?? defaults;
      const request = await models.OrderCancellationRequest.findOne({
        _id: requestId,
        version: input.expectedVersion,
        status: 'PENDING'
      }).session(tx.session);
      if (!request)
        throw new ApiError({
          code: 'CASE_REJECT_CONFLICT',
          status: 409,
          messageAr: 'طلب الإلغاء غير معلق أو تغير'
        });
      request.status = 'REJECTED';
      request.decidedAt = context.now ?? new Date();
      request.decidedBy = context.actorId;
      await request.save({ session: tx.session });
      await record(
        'cancellation.rejected',
        request._id,
        { requestId: String(request._id), orderId: String(request.orderId) },
        { ...context, ...tx }
      );
      return { request };
    },
    context,
    context.transactionOptions
  );
}

export async function retryPendingCashRefund(refundId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderCaseModels ?? defaults;
      const refund = await models.CashRefund.findOne({
        _id: refundId,
        version: input.expectedRefundVersion,
        status: 'PENDING_CASH_REFUND'
      }).session(tx.session);
      if (!refund)
        throw new ApiError({
          code: 'REFUND_RETRY_CONFLICT',
          status: 409,
          messageAr: 'طلب الرد غير معلق أو تغير'
        });
      const complete = context.casePaymentsModule?.complete ?? completePendingCashRefund;
      try {
        const done = await complete(
          refund._id,
          { expectedRefundVersion: refund.version },
          { ...context, ...tx }
        );
        await record(
          'refund.recovered',
          refund._id,
          { refundId: String(refund._id) },
          { ...context, ...tx }
        );
        return { ...done, recovered: true };
      } catch (error) {
        if (!['OPEN_DRAWER_REQUIRED', 'DRAWER_INSUFFICIENT_CASH'].includes(error?.code))
          throw error;
        return { refund, recovered: false, outstandingCash: null };
      }
    },
    context,
    context.transactionOptions
  );
}

export async function sweepPendingCashRefunds(context = {}) {
  const models = context.orderCaseModels ?? defaults;
  const pending = await models.CashRefund.find({ status: 'PENDING_CASH_REFUND' })
    .sort({ createdAt: 1, _id: 1 })
    .limit(50)
    .lean();
  let recovered = 0;
  let stillPending = 0;
  for (const refund of pending) {
    try {
      const result = await retryPendingCashRefund(
        refund._id,
        { expectedRefundVersion: refund.version ?? 0 },
        context
      );
      if (result.recovered) recovered += 1;
      else stillPending += 1;
    } catch {
      stillPending += 1;
    }
  }
  return { attempted: pending.length, recovered, stillPending };
}
