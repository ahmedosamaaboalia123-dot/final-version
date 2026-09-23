import { compare, toApiString } from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { OutboxEvent } from '../../platform/events/outbox-event.model.js';
import { Order, OrderStatusEvent } from '../orders/order.models.js';
import {
  appendOrderItems,
  cancelWholeOrder,
  confirmNewOrder
} from '../orders/order.public-service.js';
import { collectCash } from '../payments/payment.public-service.js';
import { finalizeInvoice } from '../invoices/invoice.public-service.js';
import { Table, TableSession } from './tables.models.js';

const defaults = { Table, TableSession };
const orderDefaults = { Order, OrderStatusEvent };
const ZERO = '0';
const TABLE_COUNT = 20;

async function nextSessionSequence(session, context, tx) {
  const model = context.outboxModel ?? OutboxEvent;
  const last = await model
    .find({ aggregateType: 'TableSession', aggregateId: String(session._id) })
    .sort({ sequence: -1 })
    .limit(1)
    .session(tx.session)
    .lean();
  return Math.max(session.eventSequence ?? 0, last[0]?.sequence ?? 0) + 1;
}

async function record(kind, sessionId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'tables',
      action: kind,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'TableSession', id: sessionId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'TableSession',
      aggregateId: String(sessionId),
      eventType: kind,
      payload,
      sequence: payload.sequence ?? 1
    },
    context
  );
}
export async function ensureDefaultTables(context = {}) {
  const models = context.tablesModels ?? defaults;
  const existing = await models.Table.find({}).select({ tableNumber: 1 }).lean();
  const present = new Set(existing.map((row) => row.tableNumber));
  const missing = [];
  for (let number = 1; number <= TABLE_COUNT; number += 1)
    if (!present.has(number)) missing.push({ tableNumber: number, outOfService: false });
  if (missing.length > 0) await models.Table.insertMany(missing, { ordered: false });
  return { ensured: TABLE_COUNT, created: missing.length };
}

export async function setTableStatus(tableId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tablesModels ?? defaults;
      const table = await models.Table.findOne({
        _id: tableId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!table)
        throw new ApiError({
          code: 'TABLE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الطاولة غير موجودة أو تغيرت'
        });
      table.outOfService = input.outOfService;
      table.outOfServiceReason = input.outOfService ? input.reason : undefined;
      await table.save({ session: tx.session });
      return table;
    },
    context,
    context.transactionOptions
  );
}

export async function openTableOrder(tableId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tablesModels ?? defaults;
      const table = await models.Table.findOne({
        _id: tableId,
        version: input.expectedTableVersion
      }).session(tx.session);
      if (!table)
        throw new ApiError({
          code: 'TABLE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الطاولة غير موجودة أو تغيرت'
        });
      if (table.outOfService)
        throw new ApiError({
          code: 'TABLE_OUT_OF_SERVICE',
          status: 409,
          messageAr: 'الطاولة خارج الخدمة'
        });
      const occupied = await models.TableSession.findOne({
        tableId: table._id,
        status: { $in: ['OPEN', 'CLOSING'] }
      }).session(tx.session);
      if (occupied)
        throw new ApiError({
          code: 'TABLE_ALREADY_OCCUPIED',
          status: 409,
          messageAr: 'الطاولة مشغولة بجلسة نشطة'
        });
      const sequence = await nextSequence('table-session', { ...context, ...tx });
      const [session] = await models.TableSession.create(
        [
          {
            sessionNumber: `TS-${String(sequence).padStart(8, '0')}`,
            tableId: table._id,
            tableNumber: table.tableNumber,
            openedBy: context.actorId,
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      const confirm = context.tablesOrderModule?.confirm ?? confirmNewOrder;
      let confirmed;
      try {
        confirmed = await confirm(
          {
            fulfillmentType: 'DINE_IN',
            customer: { name: 'ضيف صالة', phone: '0000000000' },
            items: input.items,
            channel: 'TABLE',
            tableSessionId: session._id
          },
          { ...context, ...tx }
        );
      } catch (error) {
        if (error?.code === 11000) {
          const retry = await models.TableSession.findOne({
            tableId: table._id,
            status: { $in: ['OPEN', 'CLOSING'] }
          }).session(tx.session);
          if (retry)
            throw new ApiError({
              code: 'TABLE_ALREADY_OCCUPIED',
              status: 409,
              messageAr: 'الطاولة مشغولة بجلسة نشطة'
            });
        }
        throw error;
      }
      session.activeOrderId = confirmed.order._id;
      session.eventSequence = await nextSessionSequence(session, { ...context, ...tx }, tx);
      await session.save({ session: tx.session });
      await record(
        'table-session.opened',
        session._id,
        {
          sessionId: String(session._id),
          tableNumber: table.tableNumber,
          orderId: String(confirmed.order._id),
          sequence: session.eventSequence
        },
        { ...context, ...tx }
      );
      return {
        table,
        session,
        order: confirmed.order,
        items: confirmed.items,
        totals: confirmed.totals
      };
    },
    context,
    context.transactionOptions
  );
}

export async function addSessionItems(sessionId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tablesModels ?? defaults;
      const session = await models.TableSession.findOne({
        _id: sessionId,
        version: input.expectedSessionVersion,
        status: 'OPEN'
      }).session(tx.session);
      if (!session || !session.activeOrderId)
        throw new ApiError({
          code: 'SESSION_ITEMS_CONFLICT',
          status: 409,
          messageAr: 'الجلسة غير متاحة للإضافة أو تغيرت'
        });
      const append = context.tablesOrderModule?.append ?? appendOrderItems;
      const result = await append(
        session.activeOrderId,
        { items: input.items, expectedVersion: input.expectedOrderVersion },
        { ...context, ...tx }
      );
      session.eventSequence = await nextSessionSequence(session, { ...context, ...tx }, tx);
      await session.save({ session: tx.session });
      await record(
        'table-session.items-added',
        session._id,
        {
          sessionId: String(session._id),
          orderId: String(session.activeOrderId),
          sequence: session.eventSequence
        },
        { ...context, ...tx }
      );
      return { session, ...result };
    },
    context,
    context.transactionOptions
  );
}

export async function cancelTableSession(sessionId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tablesModels ?? defaults;
      const session = await models.TableSession.findOne({
        _id: sessionId,
        version: input.expectedVersion,
        status: 'OPEN'
      }).session(tx.session);
      if (!session || !session.activeOrderId)
        throw new ApiError({
          code: 'SESSION_CANCEL_CONFLICT',
          status: 409,
          messageAr: 'الجلسة غير متاحة للإلغاء أو تغيرت'
        });
      const cancel = context.tablesOrderModule?.cancelWhole ?? cancelWholeOrder;
      const orderModels = context.tablesOrderModels ?? orderDefaults;
      const order = await orderModels.Order.findById(session.activeOrderId).session(tx.session);
      const cancelled = await cancel(
        session.activeOrderId,
        { reason: input.reason, expectedVersion: order ? order.version : 0 },
        { ...context, ...tx }
      );
      session.status = 'CANCELLED';
      session.cancelReason = input.reason;
      session.closedAt = context.now ?? new Date();
      session.closedBy = context.actorId;
      session.eventSequence = await nextSessionSequence(session, { ...context, ...tx }, tx);
      await session.save({ session: tx.session });
      const closeServices = context.tableServicesPort?.closeSessionServices;
      if (closeServices) await closeServices(session._id, { ...context, ...tx });
      await record(
        'table-session.cancelled',
        session._id,
        { sessionId: String(session._id), sequence: session.eventSequence },
        { ...context, ...tx }
      );
      return { session, order: cancelled.order };
    },
    context,
    context.transactionOptions
  );
}

export async function closeTableSession(sessionId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.tablesModels ?? defaults;
      const orderModels = context.tablesOrderModels ?? orderDefaults;
      const session = await models.TableSession.findOne({
        _id: sessionId,
        version: input.expectedVersion,
        status: 'OPEN'
      }).session(tx.session);
      if (!session || !session.activeOrderId)
        throw new ApiError({
          code: 'SESSION_CLOSE_CONFLICT',
          status: 409,
          messageAr: 'الجلسة غير متاحة للإغلاق أو تغيرت'
        });
      const order = await orderModels.Order.findOne({
        _id: session.activeOrderId,
        fulfillmentType: 'DINE_IN',
        status: 'READY'
      }).session(tx.session);
      if (!order)
        throw new ApiError({
          code: 'SESSION_CLOSE_CONFLICT',
          status: 409,
          messageAr: 'طلب الجلسة غير جاهز للإغلاق'
        });
      let payment = null,
        drawerTransaction = null;
      if (compare(toApiString(order.balanceDue), ZERO) > 0) {
        if (!input.payment)
          throw new ApiError({
            code: 'ORDER_PAYMENT_REQUIRED',
            status: 409,
            messageAr: 'يوجد مبلغ متبق على طلب الجلسة'
          });
        const collect = context.tablesPaymentsPort?.collect ?? collectCash;
        const collected = await collect(
          order._id,
          {
            method: 'CASH',
            collectionMode: 'DIRECT',
            amount: toApiString(order.balanceDue),
            expectedOrderVersion: order.version
          },
          { ...context, ...tx }
        );
        payment = collected.payment;
        drawerTransaction = collected.drawerTransaction;
      }
      const current = await orderModels.Order.findById(order._id).session(tx.session);
      const finalize = context.tablesInvoicesPort?.finalize ?? finalizeInvoice;
      const { invoice } = await finalize(order._id, { ...context, ...tx });
      current.eventSequence += 1;
      await orderModels.OrderStatusEvent.create(
        [
          {
            orderId: current._id,
            fromStatus: 'READY',
            toStatus: 'COMPLETED',
            reasonCode: 'TABLE_SESSION_CLOSED',
            actorType: context.actorType,
            actorId: context.actorId,
            sequence: current.eventSequence,
            requestId: context.requestId
          }
        ],
        { session: tx.session }
      );
      current.status = 'COMPLETED';
      await current.save({ session: tx.session });
      session.status = 'CLOSED';
      session.closedAt = context.now ?? new Date();
      session.closedBy = context.actorId;
      session.eventSequence = await nextSessionSequence(session, { ...context, ...tx }, tx);
      await session.save({ session: tx.session });
      const table = await models.Table.findById(session.tableId).session(tx.session);
      const closeServices = context.tableServicesPort?.closeSessionServices;
      if (closeServices) await closeServices(session._id, { ...context, ...tx });
      await record(
        'table-session.closed',
        session._id,
        {
          sessionId: String(session._id),
          tableNumber: session.tableNumber,
          orderId: String(order._id),
          sequence: session.eventSequence
        },
        { ...context, ...tx }
      );
      return { table, session, order: current, payment, drawerTransaction, invoice };
    },
    context,
    context.transactionOptions
  );
}

export async function closeSessionForOrder(orderId, input, context = {}) {
  const models = context.tablesModels ?? defaults;
  const session = await models.TableSession.findOne({ activeOrderId: orderId });
  if (!session || session.status !== 'OPEN')
    throw new ApiError({
      code: 'TABLE_PORT_UNAVAILABLE',
      status: 503,
      messageAr: 'لا توجد جلسة نشطة لهذا الطلب'
    });
  return closeTableSession(
    session._id,
    { payment: input.payment, expectedVersion: session.version },
    context
  );
}
