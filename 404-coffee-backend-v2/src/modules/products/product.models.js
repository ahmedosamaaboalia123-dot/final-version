import mongoose from 'mongoose';

const options = { timestamps: true, versionKey: 'version', optimisticConcurrency: true };
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, unique: true },
    description: String,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId
  },
  options
);
categorySchema.index({ isActive: 1, sortOrder: 1, _id: 1 });

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    description: String,
    imageId: mongoose.Schema.Types.ObjectId,
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCategory', required: true },
    isVisibleInMenu: { type: Boolean, default: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    catalogVersion: { type: Number, default: 1 },
    createdBy: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId
  },
  options
);
productSchema.index({ categoryId: 1, status: 1, isVisibleInMenu: 1, name: 1 });
productSchema.index({ normalizedName: 1, _id: 1 });

const typeSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    allowedMaterialIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial' }],
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  },
  options
);
typeSchema.index({ productId: 1, normalizedName: 1 }, { unique: true });
typeSchema.index({ productId: 1, isActive: 1, sortOrder: 1 });

const sizeSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    typeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductType', required: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    sellingPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    currency: { type: String, default: 'EGP' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  },
  options
);
sizeSchema.index({ typeId: 1, normalizedName: 1 }, { unique: true });
sizeSchema.index({ productId: 1, typeId: 1, isActive: 1, sortOrder: 1 });

const ingredientSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    quantitySmall: { type: mongoose.Schema.Types.Decimal128, required: true },
    smallUnitId: { type: mongoose.Schema.Types.ObjectId, required: true },
    materialNameSnapshot: { type: String, required: true },
    unitNameSnapshot: { type: String, required: true }
  },
  { _id: false }
);
const recipeSchema = new mongoose.Schema(
  {
    productSizeId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    ingredients: { type: [ingredientSchema], required: true },
    updatedBy: mongoose.Schema.Types.ObjectId
  },
  options
);
recipeSchema.index({ 'ingredients.materialId': 1 });

const addonSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    sellingPrice: { type: mongoose.Schema.Types.Decimal128, required: true },
    currency: { type: String, default: 'EGP' },
    notes: String,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  },
  options
);
addonSchema.index({ productId: 1, normalizedName: 1 }, { unique: true });
addonSchema.index({ productId: 1, isActive: 1, sortOrder: 1 });

export const ProductCategory =
  mongoose.models.ProductCategory ?? mongoose.model('ProductCategory', categorySchema);
export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);
export const ProductType = mongoose.models.ProductType ?? mongoose.model('ProductType', typeSchema);
export const ProductSize = mongoose.models.ProductSize ?? mongoose.model('ProductSize', sizeSchema);
export const ProductRecipe =
  mongoose.models.ProductRecipe ?? mongoose.model('ProductRecipe', recipeSchema);
export const ProductAddon =
  mongoose.models.ProductAddon ?? mongoose.model('ProductAddon', addonSchema);
