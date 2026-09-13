import { toDecimal128, toApiString } from '../../platform/database/decimal.js';
import { runInTransaction } from '../../platform/database/transaction.js';
import { ApiError } from '../../platform/http/api-error.js';
import { normalizeName } from '../../shared/utils/normalize-name.js';
import { RawMaterial, MeasurementUnit } from '../inventory/inventory.models.js';
import {
  Product,
  ProductAddon,
  ProductCategory,
  ProductSize,
  ProductType
} from './product.models.js';

const defaults = {
  Product,
  ProductAddon,
  ProductCategory,
  ProductSize,
  ProductType,
  RawMaterial,
  MeasurementUnit
};
const conflict = (code, messageAr) => new ApiError({ code, status: 409, messageAr });
async function activeCategory(id, models, session) {
  const value = await models.ProductCategory.findOne({ _id: id, isActive: true }).session(session);
  if (!value)
    throw new ApiError({
      code: 'CATEGORY_NOT_ACTIVE',
      status: 422,
      messageAr: 'القسم غير موجود أو متوقف'
    });
  return value;
}
async function activeProduct(id, models, session) {
  const value = await models.Product.findOne({ _id: id, status: 'ACTIVE' }).session(session);
  if (!value)
    throw new ApiError({
      code: 'PRODUCT_NOT_ACTIVE',
      status: 422,
      messageAr: 'المنتج غير موجود أو متوقف'
    });
  return value;
}
export async function createCategory(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      const [value] = await models.ProductCategory.create(
        [{ ...input, normalizedName: normalizeName(input.name), createdBy: context.actorId }],
        { session: tx.session }
      );
      return value;
    },
    context,
    context.transactionOptions
  );
}
export async function updateCategory(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      const value = await models.ProductCategory.findOne({
        _id: id,
        version: input.expectedVersion
      }).session(tx.session);
      if (!value) throw conflict('CATEGORY_VERSION_CONFLICT', 'القسم غير موجود أو تم تعديله');
      for (const key of ['name', 'description', 'isActive', 'sortOrder'])
        if (input[key] !== undefined) value[key] = input[key];
      if (input.name) value.normalizedName = normalizeName(input.name);
      value.updatedBy = context.actorId;
      await value.save({ session: tx.session });
      return value;
    },
    context,
    context.transactionOptions
  );
}
export async function createProduct(input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      await activeCategory(input.categoryId, models, tx.session);
      if (input.imageId && context.mediaPort?.assertReady)
        await context.mediaPort.assertReady(input.imageId, { ...context, ...tx });
      const [value] = await models.Product.create(
        [{ ...input, normalizedName: normalizeName(input.name), createdBy: context.actorId }],
        { session: tx.session }
      );
      return value;
    },
    context,
    context.transactionOptions
  );
}
export async function updateProduct(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      if (input.categoryId) await activeCategory(input.categoryId, models, tx.session);
      if (input.imageId && context.mediaPort?.assertReady)
        await context.mediaPort.assertReady(input.imageId, { ...context, ...tx });
      const value = await models.Product.findOne({
        _id: id,
        version: input.expectedVersion
      }).session(tx.session);
      if (!value) throw conflict('PRODUCT_VERSION_CONFLICT', 'المنتج غير موجود أو تم تعديله');
      for (const key of [
        'name',
        'description',
        'imageId',
        'categoryId',
        'isVisibleInMenu',
        'status'
      ])
        if (input[key] !== undefined) value[key] = input[key];
      if (input.name) value.normalizedName = normalizeName(input.name);
      value.catalogVersion += 1;
      value.updatedBy = context.actorId;
      await value.save({ session: tx.session });
      return value;
    },
    context,
    context.transactionOptions
  );
}
export async function addProductType(productId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      await activeProduct(productId, models, tx.session);
      const ids = [...new Set(input.allowedMaterialIds)];
      if (ids.length !== input.allowedMaterialIds.length)
        throw new ApiError({
          code: 'DUPLICATE_ALLOWED_MATERIAL',
          status: 422,
          messageAr: 'لا يمكن تكرار المادة الخام'
        });
      const materials = ids.length
        ? await models.RawMaterial.find({ _id: { $in: ids } }).session(tx.session)
        : [];
      if (materials.length !== ids.length)
        throw new ApiError({
          code: 'INVALID_ALLOWED_MATERIAL',
          status: 422,
          messageAr: 'إحدى المواد غير موجودة أو متوقفة'
        });
      const [value] = await models.ProductType.create(
        [
          {
            ...input,
            productId,
            allowedMaterialIds: ids,
            normalizedName: normalizeName(input.name)
          }
        ],
        { session: tx.session }
      );
      return value;
    },
    context,
    context.transactionOptions
  );
}
export async function addProductSize(productId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      await activeProduct(productId, models, tx.session);
      const type = await models.ProductType.findOne({
        _id: input.typeId,
        productId,
        isActive: true
      }).session(tx.session);
      if (!type)
        throw new ApiError({
          code: 'TYPE_PRODUCT_MISMATCH',
          status: 422,
          messageAr: 'النوع لا يتبع المنتج'
        });
      const [value] = await models.ProductSize.create(
        [
          {
            ...input,
            productId,
            normalizedName: normalizeName(input.name),
            sellingPrice: toDecimal128(input.sellingPrice)
          }
        ],
        { session: tx.session }
      );
      return value;
    },
    context,
    context.transactionOptions
  );
}
export async function createAddon(productId, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      await activeProduct(productId, models, tx.session);
      const [value] = await models.ProductAddon.create(
        [
          {
            ...input,
            productId,
            normalizedName: normalizeName(input.name),
            sellingPrice: toDecimal128(input.sellingPrice)
          }
        ],
        { session: tx.session }
      );
      return value;
    },
    context,
    context.transactionOptions
  );
}
export async function updateAddon(id, input, context = {}) {
  return runInTransaction(
    async (tx) => {
      const models = context.productModels ?? defaults;
      const value = await models.ProductAddon.findOne({
        _id: id,
        version: input.expectedVersion
      }).session(tx.session);
      if (!value) throw conflict('ADDON_VERSION_CONFLICT', 'الإضافة غير موجودة أو تم تعديلها');
      for (const key of ['name', 'notes', 'isActive', 'sortOrder'])
        if (input[key] !== undefined) value[key] = input[key];
      if (input.sellingPrice !== undefined) value.sellingPrice = toDecimal128(input.sellingPrice);
      if (input.name) value.normalizedName = normalizeName(input.name);
      await value.save({ session: tx.session });
      await models.Product.updateOne(
        { _id: value.productId },
        { $inc: { catalogVersion: 1 } },
        { session: tx.session }
      );
      return value;
    },
    context,
    context.transactionOptions
  );
}
export const productDto = (v) => ({
  id: String(v._id),
  name: v.name,
  description: v.description ?? '',
  imageId: v.imageId ? String(v.imageId) : null,
  categoryId: String(v.categoryId),
  isVisibleInMenu: v.isVisibleInMenu,
  status: v.status,
  catalogVersion: v.catalogVersion ?? 1,
  version: v.version ?? 0
});
export const typeDto = (v) => ({
  id: String(v._id),
  productId: String(v.productId),
  name: v.name,
  allowedMaterialIds: v.allowedMaterialIds.map(String),
  isActive: v.isActive,
  sortOrder: v.sortOrder,
  version: v.version ?? 0
});
export const sizeDto = (v) => ({
  id: String(v._id),
  productId: String(v.productId),
  typeId: String(v.typeId),
  name: v.name,
  sellingPrice: toApiString(v.sellingPrice),
  currency: v.currency,
  isActive: v.isActive,
  sortOrder: v.sortOrder,
  version: v.version ?? 0
});
export const addonDto = (v) => ({
  id: String(v._id),
  productId: String(v.productId),
  name: v.name,
  sellingPrice: toApiString(v.sellingPrice),
  currency: v.currency,
  isActive: v.isActive,
  sortOrder: v.sortOrder,
  version: v.version ?? 0
});
