import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import { Supplier, SupplierAccount, SupplierAccountEntry } from './supplier.models.js';
import { toAccountDto, toEntryDto, toSupplierDto } from './supplier.mapper.js';

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function getSuppliersScreen(filters = {}, context = {}) {
  const models = context.models ?? { Supplier, SupplierAccount };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const match = {};
  if (filters.search)
    match.$or = [
      { name: { $regex: escaped(filters.search), $options: 'i' } },
      { contactPerson: { $regex: escaped(filters.search), $options: 'i' } },
      { phoneNormalized: { $regex: escaped(filters.search) } }
    ];
  const [rows, totalItems, balances, cities] = await Promise.all([
    models.Supplier.aggregate([
      { $match: match },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'supplieraccounts',
          localField: '_id',
          foreignField: 'supplierId',
          as: 'account'
        }
      },
      { $set: { account: { $first: '$account' } } }
    ]),
    models.Supplier.countDocuments(match),
    models.SupplierAccount.aggregate([
      {
        $group: {
          _id: null,
          totalDebt: { $sum: '$debtBalance' },
          totalReceivable: { $sum: '$receivableBalance' }
        }
      }
    ]),
    models.Supplier.distinct('city')
  ]);
  const totals = balances[0] ?? { totalDebt: '0', totalReceivable: '0' };
  return {
    summary: {
      totalSuppliers: totalItems,
      totalDebt: toApiString(totals.totalDebt),
      totalReceivable: toApiString(totals.totalReceivable)
    },
    filters: { cities: cities.sort() },
    suppliers: rows.map((row) => ({
      ...toSupplierDto(row),
      debtBalance: toApiString(row.account?.debtBalance ?? '0'),
      receivableBalance: toApiString(row.account?.receivableBalance ?? '0')
    })),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function getSupplierDetails(id, includes = [], context = {}) {
  const models = context.models ?? { Supplier, SupplierAccount, SupplierAccountEntry };
  const supplier = await models.Supplier.findById(id).lean();
  if (!supplier)
    throw new ApiError({ code: 'SUPPLIER_NOT_FOUND', status: 404, messageAr: 'المورد غير موجود' });
  const result = { supplier: toSupplierDto(supplier) };
  if (includes.includes('account')) {
    const account = await models.SupplierAccount.findOne({ supplierId: id }).lean();
    result.account = toAccountDto(account);
  }
  if (includes.includes('recentEntries')) {
    const entries = await models.SupplierAccountEntry.find({ supplierId: id })
      .sort({ occurredOn: -1, sequenceNo: -1 })
      .limit(10)
      .lean();
    result.recentEntries = {
      items: entries.map(toEntryDto),
      pageMeta: buildPageMeta({
        page: 1,
        limit: 10,
        totalItems: entries.length,
        sort: { occurredOn: -1, sequenceNo: -1 }
      })
    };
  }
  if (includes.includes('materials')) {
    if (typeof context.materialsPort?.listBySupplier !== 'function')
      throw new ApiError({
        code: 'MATERIALS_SERVICE_UNAVAILABLE',
        status: 503,
        messageAr: 'خدمة المواد الخام غير متاحة حاليًا',
        retryable: true
      });
    result.materials = await context.materialsPort.listBySupplier(
      id,
      { page: 1, limit: 10 },
      context
    );
  }
  return result;
}

export async function listSupplierEntries(supplierId, filters = {}, context = {}) {
  const models = context.models ?? { SupplierAccount, SupplierAccountEntry };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const match = { supplierId };
  if (filters.kind) match.kind = filters.kind;
  if (filters.from || filters.to)
    match.occurredOn = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {})
    };
  const [entries, totalItems, account] = await Promise.all([
    models.SupplierAccountEntry.find(match)
      .sort({ occurredOn: -1, sequenceNo: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.SupplierAccountEntry.countDocuments(match),
    models.SupplierAccount.findOne({ supplierId }).lean()
  ]);
  if (!account)
    throw new ApiError({
      code: 'SUPPLIER_ACCOUNT_NOT_FOUND',
      status: 404,
      messageAr: 'حساب المورد غير موجود'
    });
  const reversals = entries.length ? await models.SupplierAccountEntry.find({ reversesEntryId: { $in: entries.map((entry) => entry._id) } }).select({ _id: 1, reversesEntryId: 1 }).lean() : [];
  const reversedBy = new Map(reversals.map((entry) => [String(entry.reversesEntryId), entry._id]));
  return {
    items: entries.map((entry) => toEntryDto({ ...entry, reversedByEntryId: reversedBy.get(String(entry._id)) ?? entry.reversedByEntryId })),
    account: toAccountDto(account),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { occurredOn: -1, sequenceNo: -1 } })
  };
}

export async function listSupplierSummaries(context = {}) {
  const model = context.supplierModels?.Supplier ?? Supplier;
  const suppliers = await model
    .find({})
    .select({ name: 1, contactPerson: 1, phone: 1 })
    .sort({ name: 1, _id: 1 })
    .limit(10)
    .lean();
  return suppliers.map((supplier) => ({
    id: String(supplier._id),
    name: supplier.name,
    contactPerson: supplier.contactPerson ?? '',
    phone: supplier.phone ?? ''
  }));
}
