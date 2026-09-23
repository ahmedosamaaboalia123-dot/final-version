import crypto from 'node:crypto';
import {
  add,
  compare,
  divide,
  multiply,
  roundMoney,
  subtract,
  toApiString,
  toDecimal128
} from '../../platform/database/decimal.js';
import { nextSequence } from '../../platform/database/sequence.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { writeAudit } from '../../platform/audit/audit-writer.js';
import { enqueueDomainEvent } from '../../platform/events/outbox-writer.js';
import { ApiError } from '../../platform/http/api-error.js';
import { allocateRecipeRequirements, restoreAllocations } from '../inventory/inventory.service.js';
import { collectCash } from '../payments/payment.service.js';
import { finalizeInvoice } from '../invoices/invoice.service.js';
import { Order, OrderItem, OrderItemStatusEvent, OrderStatusEvent } from './order.models.js';
import {
  calculateBalanceDue,
  calculateOrderTotals,
  priceOrderItems
} from './order-pricing.service.js';

const defaults = { Order, OrderItem, OrderStatusEvent, OrderItemStatusEvent };
const ZERO = '0';

async function record(kind, orderId, payload, context) {
  await writeAudit(
    {
      eventType: kind.toUpperCase().replaceAll('.', '_').replaceAll('-', '_'),
      category: 'BUSINESS',
      module: 'orders',
      action: kind,
      actor: { type: context.actorType, id: context.actorId },
      entity: { type: 'Order', id: orderId },
      result: 'SUCCESS',
      severity: 'INFO',
      metadataSafe: payload,
      requestId: context.requestId
    },
    context
  );
  await enqueueDomainEvent(
    {
      aggregateType: 'Order',
      aggregateId: String(orderId),
      eventType: kind,
      payload,
      sequence: payload.sequence
    },
    context
  );
}

function progressOf(items) {
  const active = items.filter((item) => item.status !== 'CANCELLED');
  return {
    ready: active.filter((item) => item.status === 'READY').length,
    total: active.length
  };
}

function paymentProjection(order) {
  const paid = toApiString(order.paidAmount ?? ZERO);
  const refunded = toApiString(order.refundedAmount ?? ZERO);
  const net = subtract(paid, refunded);
  const due = toApiString(subtract(toApiString(order.total), net));
  let paymentStatus = 'PENDING';
  if (compare(refunded, ZERO) > 0)
    paymentStatus = compare(net, ZERO) <= 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  else if (compare(paid, ZERO) > 0)
    paymentStatus = compare(due, ZERO) <= 0 ? 'SETTLED' : 'COLLECTED';
  return { paid, refunded, due, paymentStatus };
}

async function statusEvent(models, order, toStatus, reasonCode, context, tx) {
  order.eventSequence += 1;
  const [event] = await models.OrderStatusEvent.create(
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
  await record(
    toStatus === 'CANCELLED'
      ? 'order.cancelled'
      : toStatus === 'COMPLETED'
        ? 'order.completed'
        : toStatus === 'READY'
          ? 'order.ready'
          : 'order.updated',
    order._id,
    {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      fromStatus: event.fromStatus,
      toStatus,
      sequence: order.eventSequence
    },
    { ...context, ...tx }
  );
  return event;
}

async function itemEvent(models, order, item, toStatus, reasonCode, context, tx) {
  order.eventSequence += 1;
  await models.OrderItemStatusEvent.create(
    [
      {
        orderId: order._id,
        orderItemId: item._id,
        fromStatus: item.status,
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
  item.status = toStatus;
  await item.save({ session: tx.session });
  await order.save({ session: tx.session });
}

async function refreshTotals(models, order, context, tx) {
  const items = await models.OrderItem.find({ orderId: order._id }).session(tx.session);
  const active = items.filter((item) => item.status !== 'CANCELLED');
  const subtotal = active.reduce((sum, item) => add(sum, item.lineSubtotal), ZERO);
  const cost = active.reduce((sum, item) => add(sum, item.actualInventoryCost), ZERO);
  const discount = toApiString(order.discount ?? ZERO);
  const taxRate = order.taxRateSnapshot
    ? toApiString(order.taxRateSnapshot)
    : compare(order.subtotal ?? ZERO, ZERO) > 0
      ? toApiString(divide(order.tax ?? ZERO, order.subtotal, 12))
      : String(context.businessConfig?.taxRate ?? ZERO);
  const tax = roundMoney(multiply(subtotal, taxRate));
  const deliveryFee = toApiString(order.deliveryFee ?? ZERO);
  const total = add(add(subtract(subtotal, discount), tax), deliveryFee);
  order.subtotal = toDecimal128(subtotal);
  order.taxRateSnapshot = toDecimal128(taxRate);
  order.tax = toDecimal128(tax);
  order.total = toDecimal128(total);
  order.actualInventoryCost = toDecimal128(cost);
  order.actualProfit = toDecimal128(subtract(subtract(subtotal, discount), cost));
  const projection = paymentProjection(order);
  order.balanceDue = toDecimal128(projection.due);
  order.paymentStatus = projection.paymentStatus;
  await order.save({ session: tx.session });
  return { items, active, progress: progressOf(items) };
}

export async function confirmNewOrder(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const now = context.now ?? new Date();
      const { priced } = await priceOrderItems(input.items, input.fulfillmentType, {
        ...context,
        ...tx
      });
      const businessConfig = context.businessConfig ?? {};
      const totals = calculateOrderTotals(
        priced.map((item) => item),
        input.fulfillmentType,
        businessConfig
      );
      const sequence = await nextSequence('order', { ...context, ...tx });
      const trackingCode = crypto.randomBytes(8).toString('hex');
      const [order] = await models.Order.create(
        [
          {
            orderNumber: `ORD-${String(sequence).padStart(8, '0')}`,
            publicOrderNumber: `ORD-${String(sequence).padStart(8, '0')}`,
            trackingCode,
            barcodeValue: trackingCode,
            channel: input.channel ?? 'ADMIN',
            fulfillmentType: input.fulfillmentType,
            customerName: input.customer.name,
            customerPhone: input.customer.phone,
            customerAddress: input.customer.address,
            tableSessionId: input.tableSessionId,
            subtotal: toDecimal128(totals.subtotal),
            discount: toDecimal128(totals.discount),
            tax: toDecimal128(totals.tax),
            taxRateSnapshot: toDecimal128(businessConfig.taxRate ?? ZERO),
            deliveryFee: toDecimal128(totals.deliveryFee),
            total: toDecimal128(totals.total),
            actualInventoryCost: toDecimal128(ZERO),
            actualProfit: toDecimal128(ZERO),
            paidAmount: toDecimal128(ZERO),
            refundedAmount: toDecimal128(ZERO),
            balanceDue: toDecimal128(totals.total),
            costCompleteness: priced.some((item) => item.hasAddons) ? 'PARTIAL' : 'COMPLETE',
            customerReceiptStatus:
              input.fulfillmentType === 'DELIVERY' ? 'LOCKED' : 'NOT_APPLICABLE',
            operationRequestId: context.operationRequestId
          }
        ],
        { session: tx.session }
      );
      const allocate = context.inventoryPort?.allocate ?? allocateRecipeRequirements;
      const createdItems = [];
      let orderCost = ZERO;
      for (const [index, pricedItem] of priced.entries()) {
        const [item] = await models.OrderItem.create(
          [
            {
              orderId: order._id,
              lineNo: index + 1,
              productId: pricedItem.input.productId,
              productSizeId: pricedItem.input.productSizeId,
              productName: pricedItem.snapshot.product.name,
              typeName: pricedItem.snapshot.type.name,
              sizeName: pricedItem.snapshot.size.name,
              unitSellingPrice: toDecimal128(pricedItem.unitSellingPrice),
              addonNames: pricedItem.snapshot.addons.map((addon) => addon.name),
              recipeSnapshot: pricedItem.snapshot.recipe.map((ingredient) => ({
                materialId: ingredient.materialId,
                quantitySmall: toDecimal128(ingredient.quantitySmall),
                materialName: ingredient.materialName,
                unitName: ingredient.unitName
              })),
              quantity: pricedItem.input.quantity,
              lineSubtotal: toDecimal128(pricedItem.lineSubtotal),
              actualInventoryCost: toDecimal128(ZERO),
              actualProfit: toDecimal128(ZERO),
              notes: pricedItem.input.notes,
              operationRequestId: context.operationRequestId
            }
          ],
          { session: tx.session }
        );
        const { allocations } = await allocate(
          pricedItem.requirements,
          {
            type: 'ORDER_ITEM',
            id: item._id,
            orderItemId: item._id,
            occurredOn: now,
            reason: `تأكيد الطلب ${order.orderNumber}`
          },
          { ...context, ...tx }
        );
        const itemCost = allocations.reduce(
          (sum, allocation) => add(sum, allocation.inventoryValue),
          ZERO
        );
        item.actualInventoryCost = toDecimal128(itemCost);
        item.actualProfit = toDecimal128(subtract(pricedItem.lineSubtotal, itemCost));
        item.allocationIds = allocations.map((allocation) => allocation._id);
        await item.save({ session: tx.session });
        orderCost = add(orderCost, itemCost);
        createdItems.push(item);
      }
      order.actualInventoryCost = toDecimal128(orderCost);
      order.actualProfit = toDecimal128(
        subtract(subtract(totals.subtotal, totals.discount), orderCost)
      );
      const linkCustomer = context.customersPort?.upsertForOrder;
      if (linkCustomer && input.fulfillmentType !== 'DINE_IN') {
        const customer = await linkCustomer(
          {
            name: input.customer.name,
            phone: input.customer.phone,
            address: input.customer.address
          },
          { orderTotal: totals.total, orderCreatedAt: now },
          { ...context, ...tx }
        );
        order.customerId = customer._id;
      }
      await order.save({ session: tx.session });
      await statusEvent(models, order, 'CONFIRMED', 'ORDER_CONFIRMED', context, tx);
      return {
        order,
        items: createdItems,
        totals,
        allocationsSummary: {
          items: createdItems.length,
          cost: toApiString(orderCost)
        },
        tracking: {
          publicOrderNumber: order.publicOrderNumber,
          barcodeValue: order.barcodeValue
        },
        customer: {
          name: order.customerName,
          phone: order.customerPhone
        }
      };
    },
    context,
    context.transactionOptions
  );
}

export async function appendOrderItems(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const now = context.now ?? new Date();
      const order = await models.Order.findOne({
        _id: orderId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!order || !['CONFIRMED', 'PREPARING', 'READY'].includes(order.status))
        throw new ApiError({
          code: 'ORDER_APPEND_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير متاح للإضافة أو تغير'
        });
      const { priced } = await priceOrderItems(input.items, order.fulfillmentType, {
        ...context,
        ...tx
      });
      const existingCount = await models.OrderItem.countDocuments({ orderId }).session(tx.session);
      const allocate = context.inventoryPort?.allocate ?? allocateRecipeRequirements;
      const addedItems = [];
      for (const [index, pricedItem] of priced.entries()) {
        const [item] = await models.OrderItem.create(
          [
            {
              orderId: order._id,
              lineNo: existingCount + index + 1,
              productId: pricedItem.input.productId,
              productSizeId: pricedItem.input.productSizeId,
              productName: pricedItem.snapshot.product.name,
              typeName: pricedItem.snapshot.type.name,
              sizeName: pricedItem.snapshot.size.name,
              unitSellingPrice: toDecimal128(pricedItem.unitSellingPrice),
              addonNames: pricedItem.snapshot.addons.map((addon) => addon.name),
              recipeSnapshot: pricedItem.snapshot.recipe.map((ingredient) => ({
                materialId: ingredient.materialId,
                quantitySmall: toDecimal128(ingredient.quantitySmall),
                materialName: ingredient.materialName,
                unitName: ingredient.unitName
              })),
              quantity: pricedItem.input.quantity,
              lineSubtotal: toDecimal128(pricedItem.lineSubtotal),
              actualInventoryCost: toDecimal128(ZERO),
              actualProfit: toDecimal128(ZERO),
              notes: pricedItem.input.notes,
              operationRequestId: context.operationRequestId
            }
          ],
          { session: tx.session }
        );
        const { allocations } = await allocate(
          pricedItem.requirements,
          {
            type: 'ORDER_ITEM',
            id: item._id,
            orderItemId: item._id,
            occurredOn: now,
            reason: `إضافة للطلب ${order.orderNumber}`
          },
          { ...context, ...tx }
        );
        const itemCost = allocations.reduce(
          (sum, allocation) => add(sum, allocation.inventoryValue),
          ZERO
        );
        item.actualInventoryCost = toDecimal128(itemCost);
        item.actualProfit = toDecimal128(subtract(pricedItem.lineSubtotal, itemCost));
        item.allocationIds = allocations.map((allocation) => allocation._id);
        await item.save({ session: tx.session });
        addedItems.push(item);
      }
      if (priced.some((item) => item.hasAddons)) order.costCompleteness = 'PARTIAL';
      const refreshed = await refreshTotals(models, order, context, tx);
      if (order.status === 'READY')
        await statusEvent(models, order, 'PREPARING', 'ITEMS_APPENDED', context, tx);
      else {
        order.eventSequence += 1;
        await order.save({ session: tx.session });
        await record(
          'order.updated',
          order._id,
          {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            toStatus: order.status,
            sequence: order.eventSequence
          },
          { ...context, ...tx }
        );
      }
      return {
        order,
        addedItems,
        totals: {
          subtotal: toApiString(order.subtotal),
          total: toApiString(order.total),
          balanceDue: toApiString(order.balanceDue)
        },
        progress: refreshed.progress
      };
    },
    context,
    context.transactionOptions
  );
}

export async function cancelOrderItem(orderId, itemId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const order = await models.Order.findOne({
        _id: orderId,
        version: input.expectedOrderVersion
      }).session(tx.session);
      if (!order || !['CONFIRMED', 'PREPARING', 'READY'].includes(order.status))
        throw new ApiError({
          code: 'ORDER_CANCEL_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير متاح للإلغاء أو تغير'
        });
      const item = await models.OrderItem.findOne({
        _id: itemId,
        orderId,
        version: input.expectedItemVersion,
        status: 'PREPARING'
      }).session(tx.session);
      if (!item)
        throw new ApiError({
          code: 'ORDER_ITEM_CANCEL_CONFLICT',
          status: 409,
          messageAr: 'الصنف غير متاح للإلغاء أو تغير'
        });
      const restore = context.inventoryPort?.restore ?? restoreAllocations;
      const restored = await restore(item.allocationIds ?? [], input.reason, { ...context, ...tx });
      await itemEvent(models, order, item, 'CANCELLED', 'ITEM_CANCELLED', context, tx);
      item.cancellationReason = input.reason;
      await item.save({ session: tx.session });
      const refreshed = await refreshTotals(models, order, context, tx);
      if (refreshed.progress.total === 0) {
        await statusEvent(models, order, 'CANCELLED', 'ALL_ITEMS_CANCELLED', context, tx);
        const closeAssignments = context.orderCasesDeliveryPort?.closeForCancelledOrder;
        if (closeAssignments)
          await closeAssignments(order._id, input.reason, { ...context, ...tx });
      }
      const netPaid = subtract(
        toApiString(order.paidAmount ?? ZERO),
        toApiString(order.refundedAmount ?? ZERO)
      );
      return {
        order,
        item,
        restoredAllocations: restored.filter((entry) => !entry.alreadyRestored).length,
        refundImpact:
          compare(netPaid, ZERO) > 0
            ? { suggestedAmount: toApiString(netPaid), note: 'طلب مدفوع ملغي' }
            : null,
        totals: {
          subtotal: toApiString(order.subtotal),
          total: toApiString(order.total),
          balanceDue: toApiString(order.balanceDue)
        },
        progress: refreshed.progress
      };
    },
    context,
    context.transactionOptions
  );
}

export async function cancelWholeOrder(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const order = await models.Order.findOne({
        _id: orderId,
        version: input.expectedVersion
      }).session(tx.session);
      if (!order || !['CONFIRMED', 'PREPARING', 'READY'].includes(order.status))
        throw new ApiError({
          code: 'ORDER_CANCEL_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير متاح للإلغاء أو تغير'
        });
      const items = await models.OrderItem.find({
        orderId,
        status: { $in: ['PREPARING', 'READY'] }
      }).session(tx.session);
      const restore = context.inventoryPort?.restore ?? restoreAllocations;
      let restoredCount = 0;
      for (const item of items) {
        const restored = await restore(item.allocationIds ?? [], input.reason, {
          ...context,
          ...tx
        });
        restoredCount += restored.filter((entry) => !entry.alreadyRestored).length;
        await itemEvent(models, order, item, 'CANCELLED', 'ORDER_CANCELLED', context, tx);
        item.cancellationReason = input.reason;
        await item.save({ session: tx.session });
      }
      await refreshTotals(models, order, context, tx);
      order.cancellationReason = input.reason;
      await statusEvent(models, order, 'CANCELLED', 'ORDER_CANCELLED', context, tx);
      const closeAssignments = context.orderCasesDeliveryPort?.closeForCancelledOrder;
      if (closeAssignments) await closeAssignments(order._id, input.reason, { ...context, ...tx });
      const netPaid = subtract(
        toApiString(order.paidAmount ?? ZERO),
        toApiString(order.refundedAmount ?? ZERO)
      );
      return {
        order,
        restoredAllocations: restoredCount,
        refundCase:
          compare(netPaid, ZERO) > 0
            ? { suggestedAmount: toApiString(netPaid), reason: input.reason }
            : null
      };
    },
    context,
    context.transactionOptions
  );
}

export async function markOrderItemReady(itemId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const item = await models.OrderItem.findOne({
        _id: itemId,
        version: input.expectedItemVersion,
        status: 'PREPARING'
      }).session(tx.session);
      if (!item)
        throw new ApiError({
          code: 'ORDER_ITEM_READY_CONFLICT',
          status: 409,
          messageAr: 'الصنف غير متاح للتحضير أو تغير'
        });
      const order = await models.Order.findOne({
        _id: item.orderId,
        version: input.expectedOrderVersion
      }).session(tx.session);
      if (!order || !['CONFIRMED', 'PREPARING', 'READY'].includes(order.status))
        throw new ApiError({
          code: 'ORDER_READY_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير متاح للتحضير أو تغير'
        });
      await itemEvent(models, order, item, 'READY', 'ITEM_READY', context, tx);
      const items = await models.OrderItem.find({ orderId: order._id }).session(tx.session);
      const progress = progressOf(items);
      if (progress.total > 0 && progress.ready === progress.total)
        await statusEvent(models, order, 'READY', 'ALL_ITEMS_READY', context, tx);
      else
        await record(
          'order.updated',
          order._id,
          {
            orderId: String(order._id),
            orderNumber: order.orderNumber,
            toStatus: order.status,
            sequence: order.eventSequence
          },
          { ...context, ...tx }
        );
      return {
        item,
        order: {
          id: String(order._id),
          status: order.status,
          progress,
          eventSequence: order.eventSequence
        }
      };
    },
    context,
    context.transactionOptions
  );
}

export async function completeTakeawayOrder(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const order = await models.Order.findOne({
        _id: orderId,
        version: input.expectedVersion,
        fulfillmentType: 'TAKEAWAY',
        status: 'READY'
      }).session(tx.session);
      if (!order)
        throw new ApiError({
          code: 'ORDER_COMPLETE_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير جاهز للإتمام أو تغير'
        });
      let payment = null,
        drawerTransaction = null;
      if (compare(toApiString(order.balanceDue), ZERO) > 0) {
        if (!input.payment)
          throw new ApiError({
            code: 'ORDER_PAYMENT_REQUIRED',
            status: 409,
            messageAr: 'يوجد مبلغ متبق على الطلب'
          });
        const collect = context.paymentsPort?.collect ?? collectCash;
        const collected = await collect(
          orderId,
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
      const finalize = context.invoicesPort?.finalize ?? finalizeInvoice;
      const { invoice } = await finalize(orderId, { ...context, ...tx });
      const live = await models.Order.findById(orderId).session(tx.session);
      await refreshTotals(models, live, context, tx);
      await statusEvent(models, live, 'COMPLETED', 'TAKEAWAY_COMPLETED', context, tx);
      const recordCompletion = context.customersPort?.recordCompletion;
      if (recordCompletion && live.customerId)
        await recordCompletion(live.customerId, { ...context, ...tx });
      return { order: live, payment, drawerTransaction, invoice };
    },
    context,
    context.transactionOptions
  );
}

export async function completeTableOrder(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const order = await models.Order.findOne({
        _id: orderId,
        version: input.expectedVersion,
        fulfillmentType: 'DINE_IN',
        status: 'READY'
      }).session(tx.session);
      if (!order)
        throw new ApiError({
          code: 'ORDER_COMPLETE_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير جاهز للإتمام أو تغير'
        });
      if (!context.tablesPort?.closeSession)
        throw new ApiError({
          code: 'TABLE_PORT_UNAVAILABLE',
          status: 503,
          messageAr: 'خدمة الطاولات غير متاحة'
        });
      return context.tablesPort.closeSession(orderId, input, { ...context, ...tx });
    },
    context,
    context.transactionOptions
  );
}

export async function completeDeliveredOrder(orderId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const order = await models.Order.findOne({
        _id: orderId,
        version: input.expectedVersion,
        fulfillmentType: 'DELIVERY',
        status: { $in: ['READY', 'OUT_FOR_DELIVERY'] }
      }).session(tx.session);
      if (!order)
        throw new ApiError({
          code: 'ORDER_COMPLETE_CONFLICT',
          status: 409,
          messageAr: 'الطلب غير جاهز للإتمام أو تغير'
        });
      if (!context.deliveryPort?.confirmReceipt)
        throw new ApiError({
          code: 'DELIVERY_PORT_UNAVAILABLE',
          status: 503,
          messageAr: 'خدمة التوصيل غير متاحة'
        });
      return context.deliveryPort.confirmReceipt(orderId, input, { ...context, ...tx });
    },
    context,
    context.transactionOptions
  );
}

export async function getOrderForPayment(orderId, expectedVersion, context = {}) {
  const models = context.orderModels ?? defaults;
  const order = await models.Order.findById(orderId).lean();
  if (!order)
    throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  if (
    expectedVersion !== undefined &&
    expectedVersion !== null &&
    order.version !== expectedVersion
  )
    throw new ApiError({
      code: 'ORDER_VERSION_CONFLICT',
      status: 409,
      messageAr: 'الطلب تغير، أعد تحميل الصفحة'
    });
  return {
    orderNumber: order.orderNumber,
    balanceDue: toApiString(order.balanceDue),
    deliveryAssignmentId: order.currentDeliveryAssignmentId
      ? String(order.currentDeliveryAssignmentId)
      : null,
    assignedDelegateId: order.assignedDelegateId ? String(order.assignedDelegateId) : null
  };
}

export async function applyOrderPaymentSummary(orderId, deltas, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.orderModels ?? defaults;
      const query = { _id: orderId };
      if (deltas.expectedVersion !== undefined && deltas.expectedVersion !== null)
        query.version = deltas.expectedVersion;
      const order = await models.Order.findOne(query).session(tx.session);
      if (!order)
        throw new ApiError({
          code: 'ORDER_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الطلب تغير، أعد تحميل الصفحة'
        });
      if (deltas.paidDelta)
        order.paidAmount = toDecimal128(
          add(toApiString(order.paidAmount ?? ZERO), deltas.paidDelta)
        );
      if (deltas.refundedDelta)
        order.refundedAmount = toDecimal128(
          add(toApiString(order.refundedAmount ?? ZERO), deltas.refundedDelta)
        );
      const projection = paymentProjection(order);
      order.balanceDue = toDecimal128(projection.due);
      order.paymentStatus = projection.paymentStatus;
      await order.save({ session: tx.session });
      return {
        id: String(order._id),
        orderNumber: order.orderNumber,
        balanceDue: projection.due,
        total: toApiString(order.total),
        paymentStatus: projection.paymentStatus,
        version: order.version
      };
    },
    context,
    context.transactionOptions
  );
}

export async function getOrderPaymentSummary(orderId, context = {}) {
  const models = context.orderModels ?? defaults;
  const order = await models.Order.findById(orderId).lean();
  if (!order)
    throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  return { total: toApiString(order.total) };
}

export async function getOrderInvoicePayload(orderId, context = {}) {
  const models = context.orderModels ?? defaults;
  const order = await models.Order.findById(orderId).lean();
  if (!order)
    throw new ApiError({ code: 'ORDER_NOT_FOUND', status: 404, messageAr: 'الطلب غير موجود' });
  const items = await models.OrderItem.find({ orderId }).lean();
  return {
    order: {
      id: String(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
      channel: order.channel,
      fulfillmentType: order.fulfillmentType,
      tableSessionId: order.tableSessionId ? String(order.tableSessionId) : null,
      invoiceRevision: order.invoiceRevision
    },
    items: items.map((item) => ({
      productName: item.productName,
      sizeName: item.sizeName,
      quantity: item.quantity,
      unitSellingPrice: toApiString(item.unitSellingPrice),
      lineSubtotal: toApiString(item.lineSubtotal)
    })),
    totals: {
      subtotal: toApiString(order.subtotal),
      discount: toApiString(order.discount),
      tax: toApiString(order.tax),
      deliveryFee: toApiString(order.deliveryFee),
      total: toApiString(order.total)
    },
    customer: { name: order.customerName, phone: order.customerPhone },
    balanceDue: calculateBalanceDue(toApiString(order.total), {
      netPaid: subtract(
        toApiString(order.paidAmount ?? ZERO),
        toApiString(order.refundedAmount ?? ZERO)
      )
    })
  };
}
