import { ApiError } from '../../platform/http/api-error.js';

function getPort(context) {
  if (!context.drawerPort)
    throw new ApiError({
      code: 'DRAWER_SERVICE_UNAVAILABLE',
      status: 503,
      messageAr: 'خدمة الدرج غير متاحة حاليًا',
      retryable: true
    });
  return context.drawerPort;
}
export async function createSupplierCashEffect({ kind, amount, supplierId, entryId }, context) {
  const port = getPort(context);
  if (typeof port.createSupplierSettlement !== 'function')
    throw new ApiError({
      code: 'DRAWER_SERVICE_UNAVAILABLE',
      status: 503,
      messageAr: 'خدمة تسوية المورد غير متاحة',
      retryable: true
    });
  return port.createSupplierSettlement(
    {
      direction: kind === 'DEBT_PAYMENT' ? 'OUT' : 'IN',
      amount,
      supplierId,
      sourceId: entryId,
      sourceType: 'SUPPLIER_ACCOUNT_ENTRY'
    },
    context
  );
}
export async function reverseSupplierCashEffect({ originalEntry, reversalEntryId }, context) {
  const port = getPort(context);
  if (typeof port.reverseSupplierSettlement !== 'function')
    throw new ApiError({
      code: 'DRAWER_SERVICE_UNAVAILABLE',
      status: 503,
      messageAr: 'خدمة عكس تسوية المورد غير متاحة',
      retryable: true
    });
  return port.reverseSupplierSettlement(
    {
      originalTransactionId: originalEntry.drawerTransactionId,
      sourceId: reversalEntryId,
      sourceType: 'SUPPLIER_ACCOUNT_ENTRY_REVERSAL'
    },
    context
  );
}
