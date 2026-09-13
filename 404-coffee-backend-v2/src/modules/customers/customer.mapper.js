import { toApiString } from '../../platform/database/decimal.js';

export const customerDto = (customer) => ({
  id: String(customer._id),
  name: customer.name,
  phone: customer.phone,
  address: customer.address ?? null,
  status: customer.status,
  orderCount: customer.orderCount,
  completedOrderCount: customer.completedOrderCount,
  lifetimeValue: toApiString(customer.lifetimeValue ?? '0'),
  lastOrderAt: customer.lastOrderAt ?? null,
  version: customer.version ?? 0
});
