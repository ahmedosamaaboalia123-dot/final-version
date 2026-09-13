import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { normalizePhone } from '../../shared/utils/normalize-phone.js';
import { normalizeName } from '../../shared/utils/normalize-name.js';
import { Customer } from './customer.models.js';
import { customerDto } from './customer.mapper.js';

export async function getCustomersScreen(filters = {}, context = {}) {
  const models = context.customerModels ?? { Customer };
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const conditions = [
      { normalizedName: { $regex: escape(normalizeName(filters.search)), $options: 'i' } }
    ];
    if (filters.search.replace(/\D/g, ''))
      conditions.push({
        phoneNormalized: {
          $regex: escape(normalizePhone(filters.search.replace(/\D/g, '')))
        }
      });
    query.$or = conditions;
  }
  const [rows, totalItems, active, blocked] = await Promise.all([
    models.Customer.find(query).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.Customer.countDocuments(query),
    models.Customer.countDocuments({ ...query, status: 'ACTIVE' }),
    models.Customer.countDocuments({ ...query, status: 'BLOCKED' })
  ]);
  return {
    summary: { total: totalItems, active, blocked },
    customers: rows.map(customerDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { createdAt: -1 } })
  };
}

export async function getCustomerDetails(id, include = {}, context = {}) {
  const models = context.customerModels ?? { Customer };
  const customer = await models.Customer.findById(id).lean();
  if (!customer)
    throw new ApiError({ code: 'CUSTOMER_NOT_FOUND', status: 404, messageAr: 'العميل غير موجود' });
  const result = { customer: customerDto(customer) };
  if (include.orders) {
    result.orders = context.customersOrdersPort?.listByCustomer
      ? await context.customersOrdersPort.listByCustomer(customer._id, include.orders, context)
      : null;
  }
  if (include.reviews) {
    result.reviews = context.customersReviewsPort?.listByCustomer
      ? await context.customersReviewsPort.listByCustomer(customer._id, include.reviews, context)
      : null;
  }
  return result;
}
