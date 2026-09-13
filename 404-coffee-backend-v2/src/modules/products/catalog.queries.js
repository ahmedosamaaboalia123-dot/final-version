import { createHash } from 'node:crypto';
import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { toApiString } from '../../platform/database/decimal.js';
import {
  Product,
  ProductAddon,
  ProductCategory,
  ProductSize,
  ProductType
} from './product.models.js';

const defaults = { Product, ProductAddon, ProductCategory, ProductSize, ProductType };
const escaped = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export async function getCatalog(filters = {}, context = {}) {
  const m = context.productModels ?? defaults;
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const match = {
    status: 'ACTIVE',
    isVisibleInMenu: true,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.search ? { name: { $regex: escaped(filters.search), $options: 'i' } } : {})
  };
  const [products, totalItems, categories] = await Promise.all([
    m.Product.find(match).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    m.Product.countDocuments(match),
    m.ProductCategory.find({ isActive: true }).sort({ sortOrder: 1, _id: 1 }).lean()
  ]);
  const ids = products.map((p) => p._id);
  const types = await m.ProductType.find({
    productId: { $in: ids },
    isActive: true,
    ...(filters.typeId ? { _id: filters.typeId } : {})
  })
    .sort({ sortOrder: 1, _id: 1 })
    .lean();
  const typeIds = types.map((t) => t._id);
  const [sizes, addons] = await Promise.all([
    m.ProductSize.find({ productId: { $in: ids }, typeId: { $in: typeIds }, isActive: true })
      .sort({ sortOrder: 1, _id: 1 })
      .lean(),
    m.ProductAddon.find({ productId: { $in: ids }, isActive: true })
      .sort({ sortOrder: 1, _id: 1 })
      .lean()
  ]);
  const visibleProducts = filters.typeId
    ? products.filter((p) => types.some((t) => String(t.productId) === String(p._id)))
    : products;
  const rows = visibleProducts.map((p) => ({
    id: String(p._id),
    name: p.name,
    description: p.description ?? '',
    image: p.imageId ? { id: String(p.imageId) } : null,
    category: { id: String(p.categoryId) },
    isAvailable: true,
    types: types
      .filter((t) => String(t.productId) === String(p._id))
      .map((t) => ({
        id: String(t._id),
        name: t.name,
        sizes: sizes
          .filter((s) => String(s.typeId) === String(t._id))
          .map((s) => ({
            id: String(s._id),
            name: s.name,
            price: toApiString(s.sellingPrice),
            currency: s.currency
          }))
      })),
    addons: addons
      .filter((a) => String(a.productId) === String(p._id))
      .map((a) => ({
        id: String(a._id),
        name: a.name,
        price: toApiString(a.sellingPrice),
        currency: a.currency
      }))
  }));
  const catalogVersion = createHash('sha256')
    .update(
      JSON.stringify({
        products: products.map((p) => [p._id, p.catalogVersion, p.version]),
        types: types.map((t) => [t._id, t.version]),
        sizes: sizes.map((s) => [s._id, s.version]),
        addons: addons.map((a) => [a._id, a.version])
      })
    )
    .digest('hex')
    .slice(0, 24);
  return {
    catalogVersion,
    categories: categories.map((c) => ({
      id: String(c._id),
      name: c.name,
      description: c.description ?? ''
    })),
    products: rows,
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { name: 1 } })
  };
}
export async function searchVisibleProductsForAi(filters = {}, context = {}) {
  const result = await getCatalog(
    { ...filters, page: 1, limit: Math.min(filters.limit ?? 10, 10) },
    context
  );
  return result.products.map(
    ({ id, name, description, image, category, isAvailable, types, addons }) => ({
      id,
      name,
      description,
      image,
      category,
      isAvailable,
      types,
      addons
    })
  );
}
