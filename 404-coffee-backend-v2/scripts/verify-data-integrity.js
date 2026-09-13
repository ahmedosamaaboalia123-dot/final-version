import mongoose from 'mongoose';
import { compare, subtract, toApiString } from '../src/platform/database/decimal.js';
import { loadEnv } from '../src/config/env.js';
import { Order } from '../src/modules/orders/order.models.js';
import { DeliveryAssignment } from '../src/modules/delivery/delivery.models.js';
import { TableSession } from '../src/modules/tables/tables.models.js';
import { InventoryAllocation } from '../src/modules/inventory/inventory.models.js';
import { OrderItem } from '../src/modules/orders/order.models.js';
import { OutboxEvent } from '../src/platform/events/outbox-event.model.js';

const SAMPLE_LIMIT = 1000;

export async function checkOrderBalances(models = { Order }, limit = SAMPLE_LIMIT) {
  const orders = await models.Order.find({}).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  const failures = [];
  for (const order of orders) {
    const netPaid = subtract(
      toApiString(order.paidAmount ?? '0'),
      toApiString(order.refundedAmount ?? '0')
    );
    const expected = subtract(toApiString(order.total), netPaid);
    if (compare(toApiString(order.balanceDue), expected) !== 0)
      failures.push({ orderId: String(order._id), orderNumber: order.orderNumber });
    if (failures.length >= 20) break;
  }
  return { checked: orders.length, failures };
}

export async function checkAssignmentLinks(models = { DeliveryAssignment, Order }) {
  const assignments = await models.DeliveryAssignment.find({
    status: { $in: ['ASSIGNED', 'IN_PROGRESS'] }
  })
    .select({ orderId: 1, status: 1 })
    .lean();
  const failures = [];
  for (const assignment of assignments) {
    const order = await models.Order.findById(assignment.orderId).select({ status: 1 }).lean();
    if (!order || ['CANCELLED', 'COMPLETED'].includes(order.status))
      failures.push({ assignmentId: String(assignment._id) });
    if (failures.length >= 20) break;
  }
  return { checked: assignments.length, failures };
}

export async function checkSessionLinks(models = { TableSession, Order }) {
  const sessions = await models.TableSession.find({ status: { $in: ['OPEN', 'CLOSING'] } })
    .select({ activeOrderId: 1, tableId: 1 })
    .lean();
  const failures = [];
  for (const session of sessions) {
    if (!session.activeOrderId) {
      failures.push({ sessionId: String(session._id), reason: 'missing-order' });
      continue;
    }
    const order = await models.Order.findById(session.activeOrderId).select({ status: 1 }).lean();
    if (!order) failures.push({ sessionId: String(session._id), reason: 'orphan-order' });
    if (failures.length >= 20) break;
  }
  return { checked: sessions.length, failures };
}

export async function checkAllocationLinks(models = { InventoryAllocation, OrderItem }) {
  const allocations = await models.InventoryAllocation.find({ status: 'CONSUMED' })
    .select({ orderItemId: 1 })
    .limit(SAMPLE_LIMIT)
    .lean();
  const failures = [];
  for (const allocation of allocations) {
    const item = await models.OrderItem.findById(allocation.orderItemId).select({ _id: 1 }).lean();
    if (!item) failures.push({ allocationId: String(allocation._id) });
    if (failures.length >= 20) break;
  }
  return { checked: allocations.length, failures };
}

export async function checkOutboxHealth(models = { OutboxEvent }) {
  const [dead, oldestPending] = await Promise.all([
    models.OutboxEvent.countDocuments({ status: 'DEAD' }),
    models.OutboxEvent.findOne({ status: { $in: ['PENDING', 'PROCESSING'] } })
      .sort({ createdAt: 1 })
      .select({ createdAt: 1 })
      .lean()
  ]);
  return { dead, oldestPendingAt: oldestPending?.createdAt ?? null };
}

export async function verifyDataIntegrity(context = {}) {
  const models = context.models ?? {
    Order,
    DeliveryAssignment,
    TableSession,
    InventoryAllocation,
    OrderItem,
    OutboxEvent
  };
  const [balances, assignments, sessions, allocations, outbox] = await Promise.all([
    checkOrderBalances(models),
    checkAssignmentLinks(models),
    checkSessionLinks(models),
    checkAllocationLinks(models),
    checkOutboxHealth(models)
  ]);
  const failures = [
    ...balances.failures.map((row) => ({ check: 'order-balances', ...row })),
    ...assignments.failures.map((row) => ({ check: 'assignment-links', ...row })),
    ...sessions.failures.map((row) => ({ check: 'session-links', ...row })),
    ...allocations.failures.map((row) => ({ check: 'allocation-links', ...row }))
  ];
  return {
    failures,
    warnings: outbox.dead > 0 ? [{ check: 'outbox-dead', count: outbox.dead }] : [],
    outbox,
    ok: failures.length === 0
  };
}

async function main() {
  const config = loadEnv();
  await mongoose.connect(config.mongo.uri, {
    serverSelectionTimeoutMS: config.mongo.connectTimeoutMs
  });
  try {
    const result = await verifyDataIntegrity({});
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } finally {
    await mongoose.disconnect();
  }
}

const invoked = process.argv[1]?.endsWith('verify-data-integrity.js') ?? false;
if (invoked) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(2);
  });
}
