const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const authMiddleware = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  createProductSize,
  getProductSizes,
  createProductSizeIngredient,
  getProductTypes,
  createProductType,
  updateProductType,
  deleteProductType,
  addProductTypeIngredient,
  removeProductTypeIngredient,
  getAddons,
  createAddon,
  updateAddon,
  deleteAddon,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getPosCatalog,
  getPublicCatalog,
  getPublicCategories,
  getTopProducts,
  createProductConfiguration,
  updateProductConfiguration,
} = require("./product.controller");

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, "../../../uploads/products");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webp";
    cb(null, `temp-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PNG, JPEG, and WebP images are allowed"));
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Categories (must be before /:id to avoid conflict)
router.get(
  "/categories",
  authMiddleware,
  requirePermission("products", "view_products"),
  getCategories
);

router.post(
  "/categories",
  authMiddleware,
  requirePermission("products", "create_product"),
  createCategory
);

router.put(
  "/categories/:id",
  authMiddleware,
  requirePermission("products", "edit_product"),
  updateCategory
);

router.delete(
  "/categories/:id",
  authMiddleware,
  requirePermission("products", "delete_product"),
  deleteCategory
);

// Get all products
router.get(
  "/",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProducts
);

// Get product by ID
router.get(
  "/:id",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProductById
);

// Create product
router.post(
  "/",
  authMiddleware,
  requirePermission("products", "create_product"),
  createProduct
);

// Get product sizes
router.get(
  "/:productId/sizes",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProductSizes
);

// Create product size
router.post(
  "/:productId/sizes",
  authMiddleware,
  requirePermission("products", "manage_sizes"),
  createProductSize
);

// Add ingredient to product size
router.post(
  "/:productId/sizes/:sizeId/ingredients",
  authMiddleware,
  requirePermission("products", "manage_ingredients"),
  createProductSizeIngredient
);

// Get product types
router.get(
  "/:productId/types",
  authMiddleware,
  requirePermission("products", "view_products"),
  getProductTypes
);

// Create product type
router.post(
  "/:productId/types",
  authMiddleware,
  requirePermission("products", "manage_types"),
  createProductType
);

// Update product type
router.put(
  "/:productId/types/:typeId",
  authMiddleware,
  requirePermission("products", "manage_types"),
  updateProductType
);

// Delete product type
router.delete(
  "/:productId/types/:typeId",
  authMiddleware,
  requirePermission("products", "manage_types"),
  deleteProductType
);

// Add ingredient to product type
router.post(
  "/:productId/types/:typeId/ingredients/:rawMaterialId",
  authMiddleware,
  requirePermission("products", "manage_ingredients"),
  addProductTypeIngredient
);

// Remove ingredient from product type
router.delete(
  "/:productId/types/:typeId/ingredients/:rawMaterialId",
  authMiddleware,
  requirePermission("products", "manage_ingredients"),
  removeProductTypeIngredient
);

// Get addons for a product
router.get(
  "/:productId/addons",
  authMiddleware,
  requirePermission("products", "view_products"),
  getAddons
);

// Create addon
router.post(
  "/:productId/addons",
  authMiddleware,
  requirePermission("products", "manage_addons"),
  createAddon
);

// Update addon
router.put(
  "/:productId/addons/:addonId",
  authMiddleware,
  requirePermission("products", "manage_addons"),
  updateAddon
);

// Delete addon
router.delete(
  "/:productId/addons/:addonId",
  authMiddleware,
  requirePermission("products", "manage_addons"),
  deleteAddon
);

// Update product
router.put(
  "/:id",
  authMiddleware,
  requirePermission("products", "edit_product"),
  updateProduct
);

// Delete product
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("products", "delete_product"),
  deleteProduct
);

// POS Catalog (authenticated)
router.get(
  "/pos-catalog",
  authMiddleware,
  requirePermission("products", "view_products"),
  getPosCatalog
);

// Public Catalog (no auth)
router.get("/public", getPublicCatalog);

// Public Categories (no auth)
router.get("/public/categories", getPublicCategories);

// Top Products (no auth)
router.get("/public/top", getTopProducts);

// Product Configuration (multipart)
router.post(
  "/configuration",
  authMiddleware,
  requirePermission("products", "create_product"),
  upload.single("image"),
  createProductConfiguration
);

router.put(
  "/:id/configuration",
  authMiddleware,
  requirePermission("products", "edit_product"),
  upload.single("image"),
  updateProductConfiguration
);

module.exports = router;