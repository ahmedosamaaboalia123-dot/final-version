import { add, divide, multiply, subtract, toApiString } from '../../platform/database/decimal.js';
import { ApiError } from '../../platform/http/api-error.js';
import { simulateRecipeRequirements } from '../inventory/inventory.service.js';
import { ProductRecipe, ProductSize } from './product.models.js';

export async function calculateExpectedProductCost(sizeId, addonIds = [], context = {}) {
  const models = context.productModels ?? { ProductRecipe, ProductSize };
  const [size, recipe] = await Promise.all([
    models.ProductSize.findById(sizeId).lean(),
    models.ProductRecipe.findOne({ productSizeId: sizeId }).lean()
  ]);
  if (!size)
    throw new ApiError({ code: 'SIZE_NOT_FOUND', status: 404, messageAr: 'الحجم غير موجود' });
  if (addonIds.length)
    throw new ApiError({
      code: 'ADDON_RECIPE_NOT_SUPPORTED',
      status: 422,
      messageAr: 'الإضافات الحالية بلا وصفات مخزون'
    });
  if (!recipe)
    return {
      available: false,
      cost: null,
      profit: null,
      margin: null,
      costCompleteness: 'MISSING_RECIPE',
      simulatedAllocations: []
    };
  try {
    const simulate = context.inventoryPort?.simulate ?? simulateRecipeRequirements;
    const allocations = await simulate(
      recipe.ingredients.map((i) => ({
        materialId: i.materialId,
        quantitySmall: toApiString(i.quantitySmall)
      })),
      context
    );
    const cost = allocations.reduce((sum, item) => add(sum, item.inventoryValue), '0');
    const profit = subtract(size.sellingPrice, cost);
    const margin =
      String(size.sellingPrice) === '0'
        ? '0'
        : multiply(divide(profit, size.sellingPrice, 8), '100');
    return {
      available: true,
      cost: toApiString(cost),
      profit: toApiString(profit),
      margin: toApiString(margin),
      costCompleteness: 'COMPLETE',
      simulatedAllocations: allocations
    };
  } catch (error) {
    if (error.code !== 'INSUFFICIENT_STOCK') throw error;
    return {
      available: false,
      cost: null,
      profit: null,
      margin: null,
      costCompleteness: 'INSUFFICIENT_STOCK',
      simulatedAllocations: []
    };
  }
}
