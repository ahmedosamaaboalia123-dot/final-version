import { toApiString } from '../../platform/database/decimal.js';
export const toSupplierDto = (supplier) => ({
  id: String(supplier._id),
  name: supplier.name,
  contactPerson: supplier.contactPerson,
  phone: supplier.phone,
  city: supplier.city,
  createdAt: supplier.createdAt,
  updatedAt: supplier.updatedAt,
  version: supplier.version ?? 0
});
export const toAccountDto = (account) => ({
  supplierId: String(account.supplierId),
  currency: account.currency,
  debtBalance: toApiString(account.debtBalance),
  receivableBalance: toApiString(account.receivableBalance),
  version: account.version ?? 0
});
export const toEntryDto = (entry) => ({
  id: String(entry._id),
  supplierId: String(entry.supplierId),
  sequenceNo: entry.sequenceNo,
  kind: entry.kind,
  originalKind: entry.originalKind ?? null,
  amount: toApiString(entry.amount),
  occurredOn: entry.occurredOn,
  recordedAt: entry.recordedAt,
  recordedBy: String(entry.recordedBy),
  notes: entry.notes ?? '',
  debtBalanceAfter: toApiString(entry.debtBalanceAfter),
  receivableBalanceAfter: toApiString(entry.receivableBalanceAfter),
  reversesEntryId: entry.reversesEntryId ? String(entry.reversesEntryId) : null,
  reversedByEntryId: entry.reversedByEntryId ? String(entry.reversedByEntryId) : null,
  replacesEntryId: entry.replacesEntryId ? String(entry.replacesEntryId) : null,
  drawerTransactionId: entry.drawerTransactionId ? String(entry.drawerTransactionId) : null
});
