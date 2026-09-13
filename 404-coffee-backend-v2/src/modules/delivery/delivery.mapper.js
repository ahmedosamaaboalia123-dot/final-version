import { toApiString } from '../../platform/database/decimal.js';

export const delegateDto = (delegate) => ({
  id: String(delegate._id),
  name: delegate.name,
  phone: delegate.phone,
  status: delegate.status,
  maxActiveOrders: delegate.maxActiveOrders,
  activeOrderCount: delegate.activeOrderCount,
  deliveredCount: delegate.deliveredCount,
  version: delegate.version ?? 0
});

export const assignmentDto = (assignment) => ({
  id: String(assignment._id),
  assignmentNo: assignment.assignmentNo,
  orderId: String(assignment.orderId),
  delegateId: String(assignment.delegateId),
  status: assignment.status,
  cashExpected: toApiString(assignment.cashExpected ?? '0'),
  cashSettledTotal: toApiString(assignment.cashSettledTotal ?? '0'),
  reason: assignment.reason ?? null,
  version: assignment.version ?? 0
});
