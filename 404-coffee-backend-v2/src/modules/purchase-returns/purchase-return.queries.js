import { add, toApiString } from '../../platform/database/decimal.js';
import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { PurchaseReturn, PurchaseReturnItem } from './purchase-return.models.js';
import { returnDto, returnItemDto } from './purchase-return.service.js';
const defaults = { PurchaseReturn, PurchaseReturnItem };
export async function getPurchaseReturnsScreen(filters = {}, context = {}) {
  const m = context.returnModels ?? defaults,
    { page, limit } = parsePage(filters),
    { skip } = buildSkipLimit({ page, limit });
  const match = {
    ...(filters.from || filters.to
      ? {
          returnDate: {
            ...(filters.from ? { $gte: filters.from } : {}),
            ...(filters.to ? { $lte: filters.to } : {})
          }
        }
      : {})
  };
  let allowedReturnIds = null;
  if (filters.supplierId) {
    allowedReturnIds = await m.PurchaseReturnItem.distinct('returnId', {
      'supplierSnapshot.id': String(filters.supplierId)
    });
    match._id = { $in: allowedReturnIds };
  }
  const [items, totalItems, totals] = await Promise.all([
    m.PurchaseReturn.find(match).sort({ returnDate: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    m.PurchaseReturn.countDocuments(match),
    m.PurchaseReturn.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalInventoryValue: { $sum: '$totalInventoryValue' }
        }
      }
    ])
  ]);
  const summary = totals[0] ?? { count: 0, totalInventoryValue: '0' };
  return {
    summary: {
      count: summary.count,
      totalInventoryValue: toApiString(summary.totalInventoryValue)
    },
    returns: items.map(returnDto),
    filters: { supplierId: filters.supplierId ?? null },
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { returnDate: -1 } })
  };
}
export async function getPurchaseReturnDetails(id, context = {}) {
  const m = context.returnModels ?? defaults;
  const header = await m.PurchaseReturn.findById(id).lean();
  if (!header)
    throw new ApiError({
      code: 'PURCHASE_RETURN_NOT_FOUND',
      status: 404,
      messageAr: 'فاتورة المرتجع غير موجودة'
    });
  const items = await m.PurchaseReturnItem.find({ returnId: id }).sort({ _id: 1 }).lean();
  return {
    return: returnDto(header),
    items: items.map(returnItemDto),
    totals: {
      itemCount: items.length,
      totalInventoryValue: toApiString(
        items.reduce((sum, item) => add(sum, item.totalInventoryValue), '0')
      ),
      currency: header.currency
    },
    actors: {
      createdBy: header.createdBy ? String(header.createdBy) : null,
      returnedBy: header.returnedBy ? String(header.returnedBy) : null
    }
  };
}
export async function getPurchaseReturnPrintData(id, context = {}) {
  const data = await getPurchaseReturnDetails(id, context);
  return {
    documentType: 'PURCHASE_RETURN',
    number: data.return.returnNo,
    status: data.return.status,
    dates: { returnDate: data.return.returnDate, createdAt: data.return.createdAt },
    items: data.items,
    totals: data.totals,
    actors: data.actors,
    generatedAt: new Date().toISOString()
  };
}
