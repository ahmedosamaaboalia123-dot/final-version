import { ApiError } from '../http/api-error.js';

export function parsePage(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new ApiError({
      code: 'INVALID_PAGINATION',
      status: 422,
      messageAr: 'قيم الصفحات غير صحيحة'
    });
  }
  return Object.freeze({ page, limit });
}

export function buildSkipLimit({ page, limit }) {
  return Object.freeze({ skip: (page - 1) * limit, limit });
}

export function appendStableTieBreaker(sort = { createdAt: -1 }) {
  return Object.freeze({ ...sort, _id: sort._id ?? -1 });
}

export function buildPageMeta({ page, limit, totalItems, sort }) {
  return Object.freeze({
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
    hasNextPage: page * limit < totalItems,
    hasPreviousPage: page > 1,
    sort: appendStableTieBreaker(sort)
  });
}
