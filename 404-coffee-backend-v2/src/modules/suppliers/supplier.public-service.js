import { ApiError } from '../../platform/http/api-error.js';
import { Supplier } from './supplier.models.js';
import { listSupplierSummaries } from './supplier.queries.js';

export async function assertSupplierExists(supplierId, context = {}) {
  const model = context.supplierModels?.Supplier ?? context.models?.Supplier ?? Supplier;
  const supplier = await model
    .findById(supplierId)
    .session(context.session);
  if (!supplier)
    throw new ApiError({
      code: 'SUPPLIER_NOT_FOUND',
      status: 409,
      messageAr: 'المورد غير موجود'
    });
  return supplier;
}

export { listSupplierSummaries };
