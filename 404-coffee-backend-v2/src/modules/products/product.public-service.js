import { ApiError } from '../../platform/http/api-error.js';
import { toApiString } from '../../platform/database/decimal.js';
import {
  Product,
  ProductAddon,
  ProductRecipe,
  ProductSize,
  ProductType
} from './product.models.js';
import { searchVisibleProductsForAi } from './catalog.queries.js';

const defaults = { Product, ProductAddon, ProductRecipe, ProductSize, ProductType };

export async function snapshotForOrder(input, context = {}) {
  const models = context.productModels ?? defaults;
  const [product, size] = await Promise.all([
    models.Product.findOne({
      _id: input.productId,
      status: 'ACTIVE',
      isVisibleInMenu: true
    }).lean(),
    models.ProductSize.findOne({
      _id: input.productSizeId,
      productId: input.productId,
      isActive: true
    }).lean()
  ]);
  if (!product || !size)
    throw new ApiError({
      code: 'PRODUCT_SELECTION_UNAVAILABLE',
      status: 409,
      messageAr: 'اختيار المنتج غير متاح حاليًا'
    });
  const type = await models.ProductType.findOne({
    _id: size.typeId,
    productId: product._id,
    isActive: true
  }).lean();
  if (!type)
    throw new ApiError({
      code: 'PRODUCT_TYPE_UNAVAILABLE',
      status: 409,
      messageAr: 'نوع المنتج غير متاح'
    });
  const addonIds = [...new Set(input.addonIds ?? [])];
  if (addonIds.length !== (input.addonIds ?? []).length)
    throw new ApiError({
      code: 'DUPLICATE_PRODUCT_ADDON',
      status: 422,
      messageAr: 'الإضافة مكررة'
    });
  const addons = addonIds.length
    ? await models.ProductAddon.find({
        _id: { $in: addonIds },
        productId: product._id,
        isActive: true
      }).lean()
    : [];
  if (addons.length !== addonIds.length)
    throw new ApiError({
      code: 'PRODUCT_ADDON_UNAVAILABLE',
      status: 409,
      messageAr: 'إحدى الإضافات غير متاحة'
    });
  const recipe = await models.ProductRecipe.findOne({ productSizeId: size._id }).lean();
  if (!recipe)
    throw new ApiError({
      code: 'PRODUCT_RECIPE_MISSING',
      status: 409,
      messageAr: 'وصفة الحجم غير مكتملة'
    });
  return {
    product: { id: String(product._id), name: product.name },
    type: { id: String(type._id), name: type.name },
    size: { id: String(size._id), name: size.name },
    unitSellingPrice: toApiString(size.sellingPrice),
    addons: addons.map((item) => ({
      id: String(item._id),
      name: item.name,
      price: toApiString(item.sellingPrice)
    })),
    recipe: recipe.ingredients.map((item) => ({
      materialId: String(item.materialId),
      quantitySmall: toApiString(item.quantitySmall),
      materialName: item.materialNameSnapshot,
      unitName: item.unitNameSnapshot
    })),
    recipeVersion: recipe.version ?? 0
  };
}

export { searchVisibleProductsForAi };
export { listProductsByMaterial } from './product.queries.js';
