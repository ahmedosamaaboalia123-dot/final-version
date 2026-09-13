import { add, subtract, toApiString, toDecimal128 } from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { normalizeName } from '../../shared/utils/normalize-name.js';
import { normalizePhone } from '../../shared/utils/normalize-phone.js';
import { Order, OrderStatusEvent } from '../orders/order.models.js';
import { finalizeInvoice } from '../invoices/invoice.public-service.js';
import { listOrderPayments, settleCodPayment } from '../payments/payment.public-service.js';
import { Delegate, DeliveryAssignment, DeliveryConfirmation } from './delivery.models.js';

const defaults = { Delegate, DeliveryAssignment, DeliveryConfirmation };
const orderDefaults = { Order, OrderStatusEvent };
const ZERO = '0';

async function record(kind, assignmentId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'delivery',
      action: kind,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'DeliveryAssignment', id: assignmentId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'DeliveryAssignment',
      aggregateId: String(assignmentId),
      eventType: kind,
      payload,
      sequence: payload.sequence ?? 1
    },
    context
  );
}

async function orderEvent(orderModels, order, toStatus, reasonCode, context, tx) {
  order.eventSequence += 1;
  await orderModels.OrderStatusEvent.create(
    [
      {
        orderId: order._id,
        fromStatus: order.status,
        toStatus,
        reasonCode,
        actorType: context.actorType,
        actorId: context.actorId,
        sequence: order.eventSequence,
        requestId: context.requestId
      }
    ],
    { session: tx.session }
  );
  order.status = toStatus;
  await order.save({ session: tx.session });
}

async function loadDelegate(models, delegateId, tx) {
  const delegate = await models.Delegate.findById(delegateId).session(tx.session);
  if (!delegate || delegate.status !== 'ACTIVE')
    throw new ApiError({
      code: 'DELEGATE_UNAVAILABLE',
      status: 409,
      messageAr: 'المندوب غير متاح للإسناد'
    });
  if (delegate.activeOrderCount >= delegate.maxActiveOrders)
    throw new ApiError({
      code: 'DELEGATE_AT_CAPACITY',
      status: 409,
      messageAr: 'المندوب وصل للحد الأقصى من الطلبات'
    });
  return delegate;
}

export async function createDelegate(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const phoneNormalized = normalizePhone(input.phone);
      const existing = await models.Delegate.findOne({ phoneNormalized }).session(tx.session);
      if (existing)
        throw new ApiError({
          code: 'DELEGATE_PHONE_EXISTS',
          status: 409,
          messageAr: 'يوجد مندوب بهذا الهاتف بالفعل'
        });
      const [delegate] = await models.Delegate.create(
        [
          {
            name: input.name,
            normalizedName: normalizeName(input.name),
            phone: input.phone,
            phoneNormalized,
            maxActiveOrders: input.maxActiveOrders ?? 5,
            activeOrderCount: 0,
            deliveredCount: 0,
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      await record(
        'delegate.created',
        delegate._id,
        { delegateId: String(delegate._id) },
        { ...context, ...tx }
      );
      return delegate;
    },
    context,
    context.transactionOptions
  );
}

export async function updateDelegate(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const delegate = await models.Delegate.findOne({
        _id: id,
        version: input.expectedVersion
      }).session(tx.session);
      if (!delegate)
        throw new ApiError({
          code: 'DELEGATE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'المندوب غير موجود أو تغير'
        });
      if (input.name !== undefined) {
        delegate.name = input.name;
        delegate.normalizedName = normalizeName(input.name);
      }
      if (input.maxActiveOrders !== undefined) delegate.maxActiveOrders = input.maxActiveOrders;
      if (input.status !== undefined) {
        delegate.status = input.status;
        delegate.statusReason = input.status === 'INACTIVE' ? input.reason : undefined;
      }
      await delegate.save({ session: tx.session });
      await record(
        'delegate.updated',
        delegate._id,
        { delegateId: String(delegate._id) },
        { ...context, ...tx }
      );
      return delegate;
    },
    context,
    context.transactionOptions
  );
}

export async function assignDelegate(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const orderModels = context.deliveryOrderModels ?? orderDefaults;
      const order = await orderModels.Order.findOne({
        _id: orderId,
        version: input.expectedOrderVersion,
        fulfillmentType: 'DELIVERY',
        status: 'READY'
      }).session(tx.session);
      if (!order)
        throw new ApiError({
          code: 'ORDER_ASSIGN_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير جاهز للإسناد أو تغير'
        });
      const active = await models.DeliveryAssignment.findOne({
        orderId,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
      }).session(tx.session);
      if (active)
        throw new ApiError({
          code: 'ORDER_ALREADY_ASSIGNED',
          status: 409,
          messageAr: 'الطلب مسند بالفعل لمندوب نشط'
        });
      const delegate = await loadDelegate(models, input.delegateId, tx);
      const sequence = await nextSequence('delivery-assignment', { ...context, ...tx });
      const [assignment] = await models.DeliveryAssignment.create(
        [
          {
            assignmentNo: `DA-${String(sequence).padStart(8, '0')}`,
            orderId: order._id,
            delegateId: delegate._id,
            cashExpected: toDecimal128(toApiString(order.balanceDue)),
            cashSettledTotal: toDecimal128(ZERO),
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      order.assignedDelegateId = delegate._id;
      order.currentDeliveryAssignmentId = assignment._id;
      await order.save({ session: tx.session });
      delegate.activeOrderCount += 1;
      await delegate.save({ session: tx.session });
      await record(
        'delivery.assigned',
        assignment._id,
        {
          assignmentId: String(assignment._id),
          orderId: String(order._id),
          delegateId: String(delegate._id)
        },
        { ...context, ...tx }
      );
      return { assignment, order };
    },
    context,
    context.transactionOptions
  );
}

export async function handoverAssignment(assignmentId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const orderModels = context.deliveryOrderModels ?? orderDefaults;
      const assignment = await models.DeliveryAssignment.findOne({
        _id: assignmentId,
        version: input.expectedVersion,
        status: 'ASSIGNED'
      }).session(tx.session);
      if (!assignment)
        throw new ApiError({
          code: 'ASSIGNMENT_HANDOVER_CONFLICT',
          status: 409,
          messageAr: 'الإسناد غير متاح للتسليم أو تغير'
        });
      const order = await orderModels.Order.findById(assignment.orderId).session(tx.session);
      if (!order || order.status !== 'READY')
        throw new ApiError({
          code: 'ORDER_HANDOVER_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير جاهز للتسليم للمندوب'
        });
      assignment.status = 'IN_PROGRESS';
      await assignment.save({ session: tx.session });
      order.customerReceiptStatus = 'AVAILABLE';
      await orderEvent(orderModels, order, 'OUT_FOR_DELIVERY', 'DELEGATE_HANDOVER', context, tx);
      await record(
        'delivery.handed-over',
        assignment._id,
        { assignmentId: String(assignment._id), orderId: String(order._id) },
        { ...context, ...tx }
      );
      return { assignment, order };
    },
    context,
    context.transactionOptions
  );
}

export async function reassignDelivery(assignmentId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const orderModels = context.deliveryOrderModels ?? orderDefaults;
      const previous = await models.DeliveryAssignment.findOne({
        _id: assignmentId,
        version: input.expectedVersion,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
      }).session(tx.session);
      if (!previous)
        throw new ApiError({
          code: 'ASSIGNMENT_REASSIGN_CONFLICT',
          status: 409,
          messageAr: 'الإسناد غير متاح للنقل أو تغير'
        });
      const delegate = await loadDelegate(models, input.delegateId, tx);
      if (String(delegate._id) === String(previous.delegateId))
        throw new ApiError({
          code: 'ASSIGNMENT_SAME_DELEGATE',
          status: 409,
          messageAr: 'المندوب الجديد هو نفسه الحالي'
        });
      const sequence = await nextSequence('delivery-assignment', { ...context, ...tx });
      const [assignment] = await models.DeliveryAssignment.create(
        [
          {
            assignmentNo: `DA-${String(sequence).padStart(8, '0')}`,
            orderId: previous.orderId,
            delegateId: delegate._id,
            status: previous.status,
            cashExpected: previous.cashExpected,
            cashSettledTotal: toDecimal128(ZERO),
            reason: input.reason,
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      previous.status = 'REASSIGNED';
      previous.supersededBy = assignment._id;
      previous.reason = input.reason;
      await previous.save({ session: tx.session });
      const order = await orderModels.Order.findById(previous.orderId).session(tx.session);
      if (order) {
        order.assignedDelegateId = delegate._id;
        order.currentDeliveryAssignmentId = assignment._id;
        await order.save({ session: tx.session });
      }
      const oldDelegate = await models.Delegate.findById(previous.delegateId).session(tx.session);
      if (oldDelegate) {
        oldDelegate.activeOrderCount = Math.max(0, oldDelegate.activeOrderCount - 1);
        await oldDelegate.save({ session: tx.session });
      }
      delegate.activeOrderCount += 1;
      await delegate.save({ session: tx.session });
      await record(
        'delivery.reassigned',
        assignment._id,
        {
          assignmentId: String(assignment._id),
          previousAssignmentId: String(previous._id),
          delegateId: String(delegate._id)
        },
        { ...context, ...tx }
      );
      return { assignment, previousAssignment: previous, order };
    },
    context,
    context.transactionOptions
  );
}

export async function recordFailedAttempt(assignmentId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const orderModels = context.deliveryOrderModels ?? orderDefaults;
      const assignment = await models.DeliveryAssignment.findOne({
        _id: assignmentId,
        version: input.expectedVersion,
        status: 'IN_PROGRESS'
      }).session(tx.session);
      if (!assignment)
        throw new ApiError({
          code: 'ASSIGNMENT_FAILED_CONFLICT',
          status: 409,
          messageAr: 'الإسناد غير متاح لتسجيل التعذر أو تغير'
        });
      assignment.status = 'FAILED';
      assignment.reason = input.reason;
      await assignment.save({ session: tx.session });
      const order = await orderModels.Order.findById(assignment.orderId).session(tx.session);
      await record(
        'delivery.failed',
        assignment._id,
        { assignmentId: String(assignment._id), orderId: String(assignment.orderId) },
        { ...context, ...tx }
      );
      return { assignment, order };
    },
    context,
    context.transactionOptions
  );
}

export async function returnDeliveryToStore(assignmentId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const orderModels = context.deliveryOrderModels ?? orderDefaults;
      const assignment = await models.DeliveryAssignment.findOne({
        _id: assignmentId,
        version: input.expectedVersion,
        status: { $in: ['IN_PROGRESS', 'FAILED'] }
      }).session(tx.session);
      if (!assignment)
        throw new ApiError({
          code: 'ASSIGNMENT_RETURN_CONFLICT',
          status: 409,
          messageAr: 'الإسناد غير متاح للإعادة للمحل أو تغير'
        });
      assignment.status = 'RETURNED';
      assignment.reason = input.reason;
      await assignment.save({ session: tx.session });
      const order = await orderModels.Order.findById(assignment.orderId).session(tx.session);
      if (order && order.status === 'OUT_FOR_DELIVERY') {
        order.customerReceiptStatus = 'LOCKED';
        await orderEvent(orderModels, order, 'READY', 'DELIVERY_RETURNED', context, tx);
      }
      const delegate = await models.Delegate.findById(assignment.delegateId).session(tx.session);
      if (delegate) {
        delegate.activeOrderCount = Math.max(0, delegate.activeOrderCount - 1);
        await delegate.save({ session: tx.session });
      }
      await record(
        'delivery.returned',
        assignment._id,
        { assignmentId: String(assignment._id), orderId: String(assignment.orderId) },
        { ...context, ...tx }
      );
      return { assignment, order };
    },
    context,
    context.transactionOptions
  );
}

export async function confirmDeliveryReceipt(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const orderModels = context.deliveryOrderModels ?? orderDefaults;
      const receivedBy = input.receivedBy ?? 'CUSTOMER';
      if (receivedBy === 'ADMIN_OVERRIDE' && !input.reason)
        throw new ApiError({
          code: 'ADMIN_OVERRIDE_REASON_REQUIRED',
          status: 422,
          messageAr: 'التأكيد الإداري يتطلب سببًا'
        });
      const order = await orderModels.Order.findOne({
        _id: orderId,
        version: input.expectedVersion,
        status: 'OUT_FOR_DELIVERY',
        customerReceiptStatus: 'AVAILABLE'
      }).session(tx.session);
      if (!order)
        throw new ApiError({
          code: 'ORDER_RECEIPT_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير متاح للاستلام أو تغير'
        });
      const assignment = await models.DeliveryAssignment.findById(
        order.currentDeliveryAssignmentId
      ).session(tx.session);
      if (!assignment || assignment.status !== 'IN_PROGRESS')
        throw new ApiError({
          code: 'ASSIGNMENT_RECEIPT_CONFLICT',
          status: 409,
          messageAr: 'لا يوجد إسناد نشط لهذا الطلب'
        });
      const [confirmation] = await models.DeliveryConfirmation.create(
        [
          {
            orderId: order._id,
            assignmentId: assignment._id,
            source: receivedBy,
            customerCredentialId: receivedBy === 'CUSTOMER' ? input.credentialId : undefined,
            confirmedByEmployeeId: receivedBy === 'ADMIN_OVERRIDE' ? context.actorId : undefined,
            overrideReason: receivedBy === 'ADMIN_OVERRIDE' ? input.reason : undefined,
            confirmedAt: context.now ?? new Date(),
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      order.customerReceiptStatus = receivedBy === 'CUSTOMER' ? 'CONFIRMED' : 'ADMIN_CONFIRMED';
      order.customerReceivedAt = context.now ?? new Date();
      order.customerReceivedBy = receivedBy;
      await order.save({ session: tx.session });
      await orderEvent(orderModels, order, 'COMPLETED', 'DELIVERY_RECEIVED', context, tx);
      assignment.status = 'DELIVERED';
      await assignment.save({ session: tx.session });
      const delegate = await models.Delegate.findById(assignment.delegateId).session(tx.session);
      if (delegate) {
        delegate.activeOrderCount = Math.max(0, delegate.activeOrderCount - 1);
        delegate.deliveredCount += 1;
        await delegate.save({ session: tx.session });
      }
      const finalize = context.invoicesPort?.finalize ?? finalizeInvoice;
      const { invoice } = await finalize(order._id, { ...context, ...tx });
      const recordCompletion = context.customersPort?.recordCompletion;
      if (recordCompletion && order.customerId)
        await recordCompletion(order.customerId, { ...context, ...tx });
      await record(
        'delivery.confirmed',
        assignment._id,
        {
          assignmentId: String(assignment._id),
          orderId: String(order._id),
          source: receivedBy
        },
        { ...context, ...tx }
      );
      return { order, assignment, confirmation, invoice };
    },
    context,
    context.transactionOptions
  );
}

export async function adminConfirmDelivery(assignmentId, input, context = {}) {
  const models = context.deliveryModels ?? defaults;
  const assignment = await models.DeliveryAssignment.findOne({
    _id: assignmentId,
    version: input.expectedVersion,
    status: 'IN_PROGRESS'
  });
  if (!assignment)
    throw new ApiError({
      code: 'ASSIGNMENT_OVERRIDE_CONFLICT',
      status: 409,
      messageAr: 'الإسناد غير متاح للتأكيد الإداري أو تغير'
    });
  const orderModels = context.deliveryOrderModels ?? orderDefaults;
  const order = await orderModels.Order.findById(assignment.orderId);
  if (!order)
    throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  return confirmDeliveryReceipt(
    order._id,
    { expectedVersion: order.version, receivedBy: 'ADMIN_OVERRIDE', reason: input.reason },
    context
  );
}

export async function settleAssignmentCash(assignmentId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const assignment = await models.DeliveryAssignment.findOne({
        _id: assignmentId,
        version: input.expectedVersion,
        status: 'DELIVERED'
      }).session(tx.session);
      if (!assignment)
        throw new ApiError({
          code: 'SETTLEMENT_CONFLICT',
          status: 409,
          messageAr: 'التسوية متاحة بعد التوصيل فقط أو تغير الإسناد'
        });
      const list = context.deliveryPaymentsPort?.list ?? listOrderPayments;
      const settle = context.deliveryPaymentsPort?.settle ?? settleCodPayment;
      const { items } = await list(
        assignment.orderId,
        { page: 1, limit: 10 },
        { ...context, ...tx }
      );
      const targets = items.filter(
        (payment) => payment.collectionMode === 'COD' && payment.status === 'COLLECTED'
      );
      if (targets.length === 0)
        throw new ApiError({
          code: 'CASH_NOTHING_TO_SETTLE',
          status: 409,
          messageAr: 'لا توجد عهدة نقدية معلقة لهذا الإسناد'
        });
      const payments = [];
      const drawerTransactions = [];
      let settled = ZERO;
      for (const payment of targets) {
        const result = await settle(
          payment.id,
          { expectedPaymentVersion: payment.version },
          { ...context, ...tx }
        );
        payments.push(result.payment);
        drawerTransactions.push(result.drawerTransaction);
        settled = add(settled, payment.amount);
      }
      assignment.cashSettledTotal = toDecimal128(
        add(toApiString(assignment.cashSettledTotal ?? ZERO), settled)
      );
      await assignment.save({ session: tx.session });
      const outstandingCash = toApiString(
        subtract(
          toApiString(assignment.cashExpected ?? ZERO),
          toApiString(assignment.cashSettledTotal)
        )
      );
      await record(
        'delivery.cash-settled',
        assignment._id,
        {
          assignmentId: String(assignment._id),
          settled,
          outstandingCash
        },
        { ...context, ...tx }
      );
      return { assignment, payments, drawerTransactions, outstandingCash };
    },
    context,
    context.transactionOptions
  );
}

export async function closeCancelledAssignments(orderId, reason, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.deliveryModels ?? defaults;
      const active = await models.DeliveryAssignment.find({
        orderId,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
      }).session(tx.session);
      let closed = 0;
      for (const assignment of active) {
        assignment.status = 'CANCELLED';
        assignment.reason = reason;
        await assignment.save({ session: tx.session });
        const delegate = await models.Delegate.findById(assignment.delegateId).session(tx.session);
        if (delegate) {
          delegate.activeOrderCount = Math.max(0, delegate.activeOrderCount - 1);
          await delegate.save({ session: tx.session });
        }
        closed += 1;
      }
      return { closed };
    },
    context,
    context.transactionOptions
  );
}

export async function recordWhatsappShare(assignmentId, input, context = {}) {
  const models = context.deliveryModels ?? defaults;
  const assignment = await models.DeliveryAssignment.findOne({
    _id: assignmentId,
    version: input.expectedVersion
  });
  if (!assignment)
    throw new ApiError({
      code: 'ASSIGNMENT_VERSION_CONFLICT',
      status: 409,
      messageAr: 'الإسناد غير موجود أو تغير'
    });
  await record(
    'delivery.whatsapp-opened',
    assignment._id,
    { assignmentId: String(assignment._id), orderId: String(assignment.orderId) },
    context
  );
  return {
    recorded: true,
    openedAt: context.now ?? new Date(),
    assignmentId: String(assignment._id)
  };
}
