import { toApiString, toDecimal128 } from '../../platform/database/decimal.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import { MeasurementUnit, RawMaterial } from '../inventory/inventory.models.js';
import { lockMaterialSupplierAndUnits } from '../inventory/inventory.public-service.js';
import { ProductRecipe, ProductSize, ProductType } from './product.models.js';

const defaults = { MeasurementUnit, ProductRecipe, ProductSize, ProductType, RawMaterial };
export async function validateRecipeIngredients(ingredients, context = {}) {
  const models = context.productModels ?? defaults;
  const ids = ingredients.map((item) => String(item.materialId));
  if (new Set(ids).size !== ids.length)
    throw new ApiError({
      code: 'DUPLICATE_RECIPE_MATERIAL',
      status: 422,
      messageAr: 'المادة الخام مكررة في الوصفة'
    });
  const materials = await models.RawMaterial.find({ _id: { $in: ids } }).session(
    context.session
  );
  if (materials.length !== ids.length)
    throw new ApiError({
      code: 'INVALID_RECIPE_MATERIAL',
      status: 422,
      messageAr: 'إحدى مواد الوصفة غير موجودة أو متوقفة'
    });
  const units = await models.MeasurementUnit.find({
    _id: { $in: materials.map((item) => item.smallUnitId) }
  }).session(context.session);
  const unitMap = new Map(units.map((item) => [String(item._id), item]));
  return ingredients.map((ingredient) => {
    const material = materials.find((item) => String(item._id) === String(ingredient.materialId));
    const unit = unitMap.get(String(material.smallUnitId));
    if (!unit)
      throw new ApiError({
        code: 'MATERIAL_SMALL_UNIT_MISSING',
        status: 409,
        messageAr: 'وحدة المادة الصغيرة غير موجودة'
      });
    return {
      material,
      ingredient: {
        materialId: material._id,
        quantitySmall: toDecimal128(ingredient.quantitySmall),
        smallUnitId: material.smallUnitId,
        materialNameSnapshot: material.name,
        unitNameSnapshot: unit.nameAr
      }
    };
  });
}
export async function replaceSizeRecipe(sizeId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      const size = await models.ProductSize.findById(sizeId).session(tx.session);
      if (!size)
        throw new ApiError({ code: 'SIZE_NOT_FOUND', status: 404, messageAr: 'الحجم غير موجود' });
      const type = await models.ProductType.findById(size.typeId).session(tx.session);
      const validated = await validateRecipeIngredients(input.ingredients, {
        ...context,
        ...tx,
        productModels: models
      });
      if (
        type.allowedMaterialIds.length &&
        validated.some(
          ({ material }) => !type.allowedMaterialIds.map(String).includes(String(material._id))
        )
      )
        throw new ApiError({
          code: 'MATERIAL_NOT_ALLOWED_FOR_TYPE',
          status: 422,
          messageAr: 'مادة الوصفة غير مسموحة لهذا النوع'
        });
      let recipe = await models.ProductRecipe.findOne({ productSizeId: sizeId }).session(
        tx.session
      );
      if (recipe && input.expectedVersion !== undefined && recipe.version !== input.expectedVersion)
        throw new ApiError({
          code: 'RECIPE_VERSION_CONFLICT',
          status: 409,
          messageAr: 'الوصفة تم تعديلها'
        });
      if (!recipe) {
        [recipe] = await models.ProductRecipe.create(
          [
            {
              productSizeId: sizeId,
              ingredients: validated.map((v) => v.ingredient),
              updatedBy: context.actorId
            }
          ],
          { session: tx.session }
        );
      } else {
        recipe.ingredients = validated.map((v) => v.ingredient);
        recipe.updatedBy = context.actorId;
        await recipe.save({ session: tx.session });
      }
      await (context.inventoryPort?.lockMaterialSupplierAndUnits ?? lockMaterialSupplierAndUnits)(
        validated.map((v) => v.material._id),
        'RECIPE_USE',
        { ...context, ...tx, inventoryModels: { RawMaterial: models.RawMaterial } }
      );
      return recipe;
    },
    context,
    context.transactionOptions
  );
}
export const recipeDto = (r) => ({
  id: String(r._id),
  productSizeId: String(r.productSizeId),
  ingredients: r.ingredients.map((i) => ({
    materialId: String(i.materialId),
    quantitySmall: toApiString(i.quantitySmall),
    smallUnitId: String(i.smallUnitId),
    materialName: i.materialNameSnapshot,
    unitName: i.unitNameSnapshot
  })),
  version: r.version ?? 0
});
