import { buildPageMeta, buildSkipLimit, parsePage } from '../../platform/database/pagination.js';
import { ApiError } from '../../platform/http/api-error.js';
import { calculateExpectedProductCost } from './product-cost.service.js';
import {
  Product,
  ProductAddon,
  ProductCategory,
  ProductRecipe,
  ProductSize,
  ProductType
} from './product.models.js';
import { addonDto, productDto, sizeDto, typeDto } from './product.service.js';
import { recipeDto } from './recipe.service.js';
const defaults = {
  Product,
  ProductAddon,
  ProductCategory,
  ProductRecipe,
  ProductSize,
  ProductType
};
export async function getProductsScreen(filters = {}, context = {}) {
  const m = context.productModels ?? defaults;
  const { page, limit } = parsePage(filters);
  const { skip } = buildSkipLimit({ page, limit });
  const match = {
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.visible ? { isVisibleInMenu: filters.visible === 'true' } : {}),
    ...(filters.search
      ? { name: { $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      : {})
  };
  const [items, totalItems, categories, summary] = await Promise.all([
    m.Product.find(match).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    m.Product.countDocuments(match),
    m.ProductCategory.find({}).sort({ sortOrder: 1, _id: 1 }).lean(),
    m.Product.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);
  return {
    summary: Object.fromEntries(summary.map((v) => [v._id.toLowerCase(), v.count])),
    filters: {
      categories: categories.map((v) => ({
        id: String(v._id),
        name: v.name,
        isActive: v.isActive
      })),
      statuses: ['ACTIVE', 'INACTIVE']
    },
    products: items.map(productDto),
    pageMeta: buildPageMeta({ page, limit, totalItems, sort: { name: 1 } })
  };
}
export async function getProductDetails(id, context = {}) {
  const m = context.productModels ?? defaults;
  const product = await m.Product.findById(id).lean();
  if (!product)
    throw new ApiError({ code: 'PRODUCT_NOT_FOUND', status: 404, messageAr: 'المنتج غير موجود' });
  const [types, sizes, recipes, addons] = await Promise.all([
    m.ProductType.find({ productId: id }).sort({ sortOrder: 1, _id: 1 }).lean(),
    m.ProductSize.find({ productId: id }).sort({ sortOrder: 1, _id: 1 }).lean(),
    m.ProductRecipe.find({
      productSizeId: { $in: await m.ProductSize.distinct('_id', { productId: id }) }
    }).lean(),
    m.ProductAddon.find({ productId: id }).sort({ sortOrder: 1, _id: 1 }).lean()
  ]);
  const costPreview = [];
  for (const size of sizes)
    costPreview.push({
      sizeId: String(size._id),
      ...(await calculateExpectedProductCost(size._id, [], { ...context, productModels: m }))
    });
  return {
    product: productDto(product),
    types: types.map(typeDto),
    sizes: sizes.map(sizeDto),
    recipes: recipes.map(recipeDto),
    addons: addons.map(addonDto),
    costPreview
  };
}
export async function listProductsByMaterial(materialId, filters = {}, context = {}) {
  const m = context.productModels ?? defaults;
  const { page, limit } = parsePage(filters);
  const recipes = await m.ProductRecipe.find({ 'ingredients.materialId': materialId }).lean();
  const sizeIds = recipes.map((r) => r.productSizeId);
  const sizes = await m.ProductSize.find({ _id: { $in: sizeIds } }).lean();
  const productIds = [...new Set(sizes.map((s) => String(s.productId)))];
  const items = await m.Product.find({ _id: { $in: productIds } })
    .sort({ name: 1, _id: 1 })
    .limit(limit)
    .lean();
  return {
    items: items.map(productDto),
    pageMeta: buildPageMeta({ page, limit, totalItems: productIds.length, sort: { name: 1 } })
  };
}
