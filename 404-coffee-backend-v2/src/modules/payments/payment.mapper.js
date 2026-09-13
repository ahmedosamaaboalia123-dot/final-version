import { toApiString } from '../../platform/database/decimal.js';
export const paymentDto = (p) => ({
  id: String(p._id),
  orderId: String(p.orderId),
  paymentNo: p.paymentNo,
  method: p.method,
  collectionMode: p.collectionMode,
  status: p.status,
  amount: toApiString(p.amount),
  refundedAmount: toApiString(p.refundedAmount),
  collectedByType: p.collectedByType,
  collectedById: String(p.collectedById),
  collectedAt: p.collectedAt,
  settledAt: p.settledAt ?? null,
  cashDrawerTransactionId: p.cashDrawerTransactionId ? String(p.cashDrawerTransactionId) : null,
  version: p.version ?? 0
});
export const refundDto = (r) => ({
  id: String(r._id),
  paymentId: String(r.paymentId),
  orderId: String(r.orderId),
  refundNo: r.refundNo,
  amount: toApiString(r.amount),
  status: r.status,
  reason: r.reason,
  drawerTransactionId: r.drawerTransactionId ? String(r.drawerTransactionId) : null,
  requestedAt: r.requestedAt,
  completedAt: r.completedAt ?? null,
  version: r.version ?? 0
});
