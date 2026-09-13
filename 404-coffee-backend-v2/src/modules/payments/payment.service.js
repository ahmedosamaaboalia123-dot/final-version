import {
  add,
  compare,
  subtract,
  toApiString,
  toDecimal128
} from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { CashRefund, OrderPayment } from './payment.models.js';

const defaults = { CashRefund, OrderPayment };
const requireOrderPort = (context) => {
  if (!context.ordersPort?.getForPayment || !context.ordersPort?.applyPaymentSummary)
    throw new ApiError({
      code: 'ORDERS_PORT_UNAVAILABLE',
      status: 503,
      messageAr: 'خدمة الطلبات غير متاحة'
    });
  return context.ordersPort;
};
async function record(kind, aggregateId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_'),
      category: 'FINANCIAL',
      module: 'payments',
      action: kind,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'OrderPayment', id: aggregateId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'OrderPayment',
      aggregateId: String(aggregateId),
      eventType: kind,
      payload,
      sequence: payload.sequence
    },
    context
  );
}
export async function calculateOrderPaymentSummary(orderId, context = {}) {
  const models = context.paymentModels ?? defaults;
  const rows = await models.OrderPayment.find({ orderId }).lean();
  const paid = rows
    .filter((p) => ['COLLECTED', 'SETTLED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status))
    .reduce((s, p) => add(s, p.amount), '0');
  const refunded = rows.reduce((s, p) => add(s, p.refundedAmount ?? '0'), '0');
  const netPaid = subtract(paid, refunded);
  const order = context.ordersPort?.getSummary
    ? await context.ordersPort.getSummary(orderId, context)
    : null;
  return {
    paid: toApiString(paid),
    refunded: toApiString(refunded),
    netPaid: toApiString(netPaid),
    balanceDue: order ? toApiString(subtract(order.total, netPaid)) : null
  };
}
export async function collectCash(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.paymentModels ?? defaults,
        orders = requireOrderPort(context);
      const order = await orders.getForPayment(orderId, input.expectedOrderVersion, {
        ...context,
        ...tx
      });
      if (compare(input.amount, order.balanceDue) > 0)
        throw new ApiError({
          code: 'PAYMENT_EXCEEDS_BALANCE',
          status: 409,
          messageAr: 'المبلغ أكبر من المتبقي على الطلب'
        });
      if (input.collectionMode === 'COD' && !order.deliveryAssignmentId)
        throw new ApiError({
          code: 'COD_ASSIGNMENT_REQUIRED',
          status: 409,
          messageAr: 'تحصيل المندوب يتطلب إسناد توصيل نشط'
        });
      const sequence = await nextSequence('order-payment', { ...context, ...tx });
      const [payment] = await models.OrderPayment.create(
        [
          {
            orderId,
            paymentNo: `PAY-${String(sequence).padStart(8, '0')}`,
            method: 'CASH',
            collectionMode: input.collectionMode,
            status: input.collectionMode === 'DIRECT' ? 'SETTLED' : 'COLLECTED',
            amount: toDecimal128(input.amount),
            refundedAmount: toDecimal128('0'),
            collectedByType: input.collectionMode === 'COD' ? 'DELEGATE' : 'EMPLOYEE',
            collectedById:
              input.collectionMode === 'COD' ? order.assignedDelegateId : context.actorId,
            collectedAt: context.now ?? new Date(),
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      let drawerTransaction = null;
      if (input.collectionMode === 'DIRECT') {
        if (!context.drawerPort?.createSourceCashTransaction)
          throw new ApiError({
            code: 'DRAWER_PORT_UNAVAILABLE',
            status: 503,
            messageAr: 'خدمة الدرج غير متاحة'
          });
        const movement = await context.drawerPort.createSourceCashTransaction(
          {
            direction: 'IN',
            amount: input.amount,
            accountingClass: 'ORDER_CASH_SALE',
            description: `تحصيل الطلب ${order.orderNumber}`,
            sourceType: 'ORDER_PAYMENT',
            sourceId: payment._id,
            snapshots: { orderId: String(orderId), paymentNo: payment.paymentNo }
          },
          { ...context, ...tx }
        );
        drawerTransaction = movement.transaction;
        payment.cashDrawerTransactionId = drawerTransaction._id;
        payment.settledAt = context.now ?? new Date();
        payment.settledBy = context.actorId;
        await payment.save({ session: tx.session });
      }
      const updatedOrder = await orders.applyPaymentSummary(
        orderId,
        { paidDelta: input.amount, expectedVersion: input.expectedOrderVersion },
        { ...context, ...tx }
      );
      await record(
        'payment.collected',
        payment._id,
        {
          paymentId: String(payment._id),
          orderId: String(orderId),
          collectionMode: input.collectionMode,
          sequence: (payment.version ?? 0) + 1
        },
        { ...context, ...tx }
      );
      return { payment, order: updatedOrder, drawerTransaction };
    },
    context,
    context.transactionOptions
  );
}
export async function settleCodPayment(paymentId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.paymentModels ?? defaults;
      const payment = await models.OrderPayment.findOne({
        _id: paymentId,
        version: input.expectedPaymentVersion,
        collectionMode: 'COD',
        status: 'COLLECTED'
      }).session(tx.session);
      if (!payment)
        throw new ApiError({
          code: 'COD_SETTLEMENT_CONFLICT',
          status: 409,
          messageAr: 'الدفعة مسواة أو تغيرت'
        });
      if (!context.drawerPort?.createSourceCashTransaction)
        throw new ApiError({
          code: 'DRAWER_PORT_UNAVAILABLE',
          status: 503,
          messageAr: 'خدمة الدرج غير متاحة'
        });
      const movement = await context.drawerPort.createSourceCashTransaction(
        {
          direction: 'IN',
          amount: payment.amount,
          accountingClass: 'COD_SETTLEMENT',
          description: `تسوية ${payment.paymentNo}`,
          sourceType: 'COD_PAYMENT_SETTLEMENT',
          sourceId: payment._id,
          snapshots: { orderId: String(payment.orderId) }
        },
        { ...context, ...tx }
      );
      payment.status = 'SETTLED';
      payment.settledAt = context.now ?? new Date();
      payment.settledBy = context.actorId;
      payment.cashDrawerTransactionId = movement.transaction._id;
      await payment.save({ session: tx.session });
      await record(
        'payment.settled',
        payment._id,
        {
          paymentId: String(payment._id),
          orderId: String(payment.orderId),
          sequence: (payment.version ?? 0) + 1
        },
        { ...context, ...tx }
      );
      return { payment, drawerTransaction: movement.transaction };
    },
    context,
    context.transactionOptions
  );
}
export async function createCashRefund(paymentId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.paymentModels ?? defaults,
        orders = requireOrderPort(context);
      const payment = await models.OrderPayment.findOne({
        _id: paymentId,
        version: input.expectedPaymentVersion
      }).session(tx.session);
      if (!payment)
        throw new ApiError({
          code: 'PAYMENT_REFUND_CONFLICT',
          status: 409,
          messageAr: 'الدفعة غير موجودة أو تغيرت'
        });
      const refundable = subtract(payment.amount, payment.refundedAmount);
      if (compare(input.amount, refundable) > 0)
        throw new ApiError({
          code: 'REFUND_EXCEEDS_PAYMENT',
          status: 409,
          messageAr: 'قيمة الرد أكبر من المتاح'
        });
      const sequence = await nextSequence('cash-refund', { ...context, ...tx });
      let movement = null,
        status = 'COMPLETED';
      try {
        if (!context.drawerPort?.createSourceCashTransaction)
          throw new ApiError({
            code: 'DRAWER_PORT_UNAVAILABLE',
            status: 503,
            messageAr: 'خدمة الدرج غير متاحة'
          });
        movement = await context.drawerPort.createSourceCashTransaction(
          {
            direction: 'OUT',
            amount: input.amount,
            accountingClass: 'ORDER_CASH_REFUND',
            description: `رد من ${payment.paymentNo}`,
            sourceType: 'CASH_REFUND',
            sourceId: `REF-${String(sequence).padStart(8, '0')}`,
            snapshots: { paymentId: String(payment._id), orderId: String(payment.orderId) }
          },
          { ...context, ...tx }
        );
      } catch (error) {
        if (!['OPEN_DRAWER_REQUIRED', 'DRAWER_INSUFFICIENT_CASH'].includes(error.code)) throw error;
        status = 'PENDING_CASH_REFUND';
      }
      const [refund] = await models.CashRefund.create(
        [
          {
            paymentId: payment._id,
            orderId: payment.orderId,
            refundNo: `REF-${String(sequence).padStart(8, '0')}`,
            amount: toDecimal128(input.amount),
            status,
            reason: input.reason,
            drawerTransactionId: movement?.transaction?._id,
            requestedBy: context.actorId,
            completedAt: status === 'COMPLETED' ? (context.now ?? new Date()) : null,
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      let updatedOrder = null;
      if (status === 'COMPLETED') {
        payment.refundedAmount = toDecimal128(add(payment.refundedAmount, input.amount));
        payment.status =
          compare(payment.refundedAmount, payment.amount) === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        if (movement?.transaction) payment.refundTransactionIds.push(movement.transaction._id);
        await payment.save({ session: tx.session });
        updatedOrder = await orders.applyPaymentSummary(
          payment.orderId,
          { refundedDelta: input.amount },
          { ...context, ...tx }
        );
      } else updatedOrder = await orders.getSummary(payment.orderId, { ...context, ...tx });
      await record(
        status === 'COMPLETED' ? 'payment.refunded' : 'payment.refund-pending',
        payment._id,
        {
          paymentId: String(payment._id),
          refundId: String(refund._id),
          orderId: String(payment.orderId),
          status,
          sequence: (payment.version ?? 0) + 1
        },
        { ...context, ...tx }
      );
      return {
        payment,
        refund,
        drawerTransaction: movement?.transaction ?? null,
        order: updatedOrder
      };
    },
    context,
    context.transactionOptions
  );
}

export async function completePendingCashRefund(refundId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.paymentModels ?? defaults;
      const refund = await models.CashRefund.findOne({
        _id: refundId,
        version: input.expectedRefundVersion,
        status: 'PENDING_CASH_REFUND'
      }).session(tx.session);
      if (!refund)
        throw new ApiError({
          code: 'REFUND_COMPLETION_CONFLICT',
          status: 409,
          messageAr: 'طلب الرد تم تنفيذه أو تغير'
        });
      const payment = await models.OrderPayment.findById(refund.paymentId).session(tx.session);
      if (!payment)
        throw new ApiError({
          code: 'PAYMENT_NOT_FOUND',
          status: 404,
          messageAr: 'الدفعة غير موجودة'
        });
      if (!context.drawerPort?.createSourceCashTransaction)
        throw new ApiError({
          code: 'DRAWER_PORT_UNAVAILABLE',
          status: 503,
          messageAr: 'خدمة الدرج غير متاحة'
        });
      const movement = await context.drawerPort.createSourceCashTransaction(
        {
          direction: 'OUT',
          amount: refund.amount,
          accountingClass: 'ORDER_CASH_REFUND',
          description: `تنفيذ ${refund.refundNo}`,
          sourceType: 'CASH_REFUND',
          sourceId: refund.refundNo,
          snapshots: { paymentId: String(payment._id), orderId: String(payment.orderId) }
        },
        { ...context, ...tx }
      );
      refund.status = 'COMPLETED';
      refund.drawerTransactionId = movement.transaction._id;
      refund.completedAt = context.now ?? new Date();
      await refund.save({ session: tx.session });
      payment.refundedAmount = toDecimal128(add(payment.refundedAmount, refund.amount));
      payment.status =
        compare(payment.refundedAmount, payment.amount) === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      payment.refundTransactionIds.push(movement.transaction._id);
      await payment.save({ session: tx.session });
      const order = await requireOrderPort(context).applyPaymentSummary(
        payment.orderId,
        { refundedDelta: toApiString(refund.amount) },
        { ...context, ...tx }
      );
      await record(
        'payment.refunded',
        payment._id,
        {
          paymentId: String(payment._id),
          refundId: String(refund._id),
          orderId: String(payment.orderId),
          status: 'COMPLETED',
          sequence: (payment.version ?? 0) + 1
        },
        { ...context, ...tx }
      );
      return { payment, refund, drawerTransaction: movement.transaction, order };
    },
    context,
    context.transactionOptions
  );
}
