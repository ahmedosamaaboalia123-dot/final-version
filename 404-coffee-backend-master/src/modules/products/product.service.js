const prisma = require("../../lib/prisma");
const { parsePagination } = require("../../utils/pagination");

const PRODUCT_INCLUDE = {
  types: {
    include: {
      ingredients: {
        include: { rawMaterial: true },
      },
    },
  },
  sizes: {
    include: {
      ingredients: {
        include: { rawMaterial: true },
      },
    },
  },
  addons: true,
};

// Transform flat types+sizes into nested variants[] format
// Frontend expects: variants[{ type, sizes[{ name, price }] }]
const toVariants = (product) => {
  const sizes = product.sizes || [];
  const typeNames = [...new Set(sizes.map((s) => s.typeName))];

  const variants = typeNames.map((typeName) => ({
    type: typeName,
    sizes: sizes
      .filter((s) => s.typeName === typeName)
      .map((s) => ({
        name: s.name,
        price: Number(s.finalPrice),
      })),
  }));

  return {
    ...product,
    variants,
  };
};

// ============================================================
// Compute average unit cost from batches for a raw material
// ============================================================

const computeAverageUnitCost = async (rawMaterialId) => {
  const batches = await prisma.rawMaterialBatch.findMany({
    where: {
      rawMaterialId,
      quantity: { gt: 0 },
    },
  });

  if (batches.length === 0) return 0;

  let totalQuantity = 0;
  let totalValue = 0;
  for (const b of batches) {
    const qty = Number(b.quantity);
    totalQuantity += qty;
    totalValue += qty * Number(b.pricePerUnit);
  }

  return totalQuantity > 0 ? totalValue / totalQuantity : 0;
};

// ============================================================
// Compute cost fields for a product (types, sizes, addons)
// ============================================================

const computeProductCosts = async (product) => {
  const typesMap = new Map();
  for (const t of product.types || []) {
    if (!typesMap.has(t.id)) {
      typesMap.set(t.id, {
        id: t.id,
        name: t.name,
        ingredients: [],
      });
    }
    for (const ing of t.ingredients || []) {
      typesMap.get(t.id).ingredients.push({
        rawMaterialId: ing.rawMaterialId,
        name: ing.rawMaterial?.name || "",
        unit: ing.rawMaterial?.unit || "",
      });
    }
  }

  const sizesMap = new Map();
  for (const s of product.sizes || []) {
    if (!sizesMap.has(s.id)) {
      sizesMap.set(s.id, {
        id: s.id,
        typeName: s.typeName,
        name: s.name,
        sellingPrice: Number(s.finalPrice),
        costPrice: 0,
        profit: 0,
        profitMargin: 0,
        isActive: s.isActive,
        ingredients: [],
      });
    }
    const sizeObj = sizesMap.get(s.id);
    for (const ing of s.ingredients || []) {
      const avgCost = await computeAverageUnitCost(ing.rawMaterialId);
      const qty = Number(ing.quantity);
      const cost = qty * avgCost;
      sizeObj.costPrice += cost;
      sizeObj.ingredients.push({
        rawMaterialId: ing.rawMaterialId,
        name: ing.rawMaterial?.name || "",
        quantity: qty,
        unit: ing.rawMaterial?.unit || "",
        averageUnitCost: avgCost,
        cost,
      });
    }
    sizeObj.profit = sizeObj.sellingPrice - sizeObj.costPrice;
    sizeObj.profitMargin =
      sizeObj.sellingPrice > 0
        ? Number(((sizeObj.profit / sizeObj.sellingPrice) * 100).toFixed(2))
        : 0;
  }

  const addons = (product.addons || []).map((a) => ({
    id: a.id,
    name: a.name,
    price: Number(a.price),
    notes: a.notes,
  }));

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    image: product.image,
    categoryId: product.categoryId,
    categoryRef: product.categoryRel
      ? { id: product.categoryRel.id, name: product.categoryRel.name }
      : null,
    isActive: product.isActive,
    types: Array.from(typesMap.values()),
    sizes: Array.from(sizesMap.values()),
    addons,
  };
};

// ============================================================
// Get all categories
// ============================================================

const getCategories = async () => {
  return prisma.productCategory.findMany({
    orderBy: { name: "asc" },
  });
};

// ============================================================
// Create category
// ============================================================

const createCategory = async ({ name }) => {
  if (!name || !name.trim()) {
    const error = new Error("Category name is required");
    error.statusCode = 400;
    throw error;
  }

  const existing = await prisma.productCategory.findUnique({
    where: { name: name.trim() },
  });

  if (existing) {
    const error = new Error("Category already exists");
    error.statusCode = 409;
    throw error;
  }

  return prisma.productCategory.create({
    data: { name: name.trim() },
  });
};

// ============================================================
// Update category
// ============================================================

const updateCategory = async (id, data) => {
  const categoryId = Number(id);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    const error = new Error("Invalid category ID");
    error.statusCode = 400;
    throw error;
  }

  const existing = await prisma.productCategory.findUnique({
    where: { id: categoryId },
  });

  if (!existing) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }

  const { name, isActive } = data;

  if (name && name.trim() !== existing.name) {
    const dup = await prisma.productCategory.findUnique({
      where: { name: name.trim() },
    });
    if (dup) {
      const error = new Error("Category name already exists");
      error.statusCode = 409;
      throw error;
    }
  }

  return prisma.productCategory.update({
    where: { id: categoryId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(isActive !== undefined && { isActive }),
    },
  });
};

// ============================================================
// Delete category
// ============================================================

const deleteCategory = async (id) => {
  const categoryId = Number(id);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    const error = new Error("Invalid category ID");
    error.statusCode = 400;
    throw error;
  }

  const existing = await prisma.productCategory.findUnique({
    where: { id: categoryId },
  });

  if (!existing) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }

  const productCount = await prisma.product.count({
    where: { categoryId },
  });

  if (productCount > 0) {
    const error = new Error(
      `Cannot delete category: ${productCount} product(s) still use it`
    );
    error.statusCode = 409;
    throw error;
  }

  await prisma.productCategory.delete({ where: { id: categoryId } });
  return existing;
};

// ============================================================
// POS Catalog (no costs, no ingredients)
// ============================================================

const getPosCatalog = async () => {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: {
        categoryRel: true,
        types: true,
        sizes: {
          select: {
            id: true,
            typeName: true,
            name: true,
            finalPrice: true,
            isActive: true,
          },
        },
        addons: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      image: p.image,
      categoryId: p.categoryId,
      isActive: p.isActive,
      types: p.types.map((t) => ({ id: t.id, name: t.name })),
      sizes: p.sizes.map((s) => ({
        id: s.id,
        typeName: s.typeName,
        name: s.name,
        sellingPrice: Number(s.finalPrice),
        isActive: s.isActive,
      })),
      addons: p.addons.map((a) => ({
        id: a.id,
        name: a.name,
        price: Number(a.price),
      })),
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.isActive,
    })),
  };
};

// ============================================================
// Public Catalog (no auth, active products only)
// ============================================================

const getPublicCatalog = async () => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      categoryRel: true,
      types: true,
      sizes: {
        select: {
          id: true,
          name: true,
          finalPrice: true,
        },
      },
      addons: {
        select: {
          id: true,
          name: true,
          price: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    englishName: "",
    description: p.description,
    image: p.image,
    categoryName: p.categoryRel?.name || "",
    isNew: false,
    isBestSeller: false,
    types: p.types.map((t) => ({ id: t.id, name: t.name })),
    sizes: p.sizes.map((s) => ({
      id: s.id,
      name: s.name,
      sellingPrice: Number(s.finalPrice),
    })),
    addons: p.addons.map((a) => ({
      id: a.id,
      name: a.name,
      price: Number(a.price),
    })),
  }));
};

// ============================================================
// Public Categories (no auth, active only)
// ============================================================

const getPublicCategories = async () => {
  return prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
};

// ============================================================
// Top Products (most ordered in given period)
// ============================================================

const getTopProducts = async ({ limit = 6, days = 30 } = {}) => {
  const since = new Date();
  since.setDate(since.getDate() - Number(days));

  const topItems = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: {
        createdAt: { gte: since },
      },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: Number(limit),
  });

  const productIds = topItems.map((t) => t.productId);
  if (productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      image: true,
      sizes: {
        select: { finalPrice: true },
        take: 1,
        orderBy: { finalPrice: "asc" },
      },
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  return topItems
    .map((t) => {
      const p = productMap.get(t.productId);
      if (!p) return null;
      return {
        productId: p.id,
        name: p.name,
        image: p.image,
        sellingPrice: p.sizes[0] ? Number(p.sizes[0].finalPrice) : 0,
        totalOrders: t._sum?.quantity || 0,
      };
    })
    .filter(Boolean);
};

// ============================================================
// Get all products (with filtering, search, pagination)
// ============================================================

const getProducts = async (filters = {}) => {
  const { page, pageSize, skip, take } = parsePagination(filters);
  const { category, minPrice, maxPrice, search, isActive, menu } = filters;

  const where = {};

  if (category) {
    where.categoryId = Number(category);
  }

  if (isActive !== undefined) {
    where.isActive = isActive === "true" || isActive === true;
  }

  if (menu === "true" || menu === true) {
    where.isActive = true;
  }

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter = {};
    if (minPrice !== undefined) {
      const min = Number(minPrice);
      if (Number.isFinite(min) && min >= 0) {
        priceFilter.gte = min;
      }
    }
    if (maxPrice !== undefined) {
      const max = Number(maxPrice);
      if (Number.isFinite(max) && max >= 0) {
        priceFilter.lte = max;
      }
    }
    if (Object.keys(priceFilter).length > 0) {
      where.sizes = { some: { finalPrice: priceFilter } };
    }
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        categoryRel: true,
        types: {
          include: {
            ingredients: {
              include: { rawMaterial: true },
            },
          },
        },
        sizes: {
          include: {
            ingredients: {
              include: { rawMaterial: true },
            },
          },
        },
        addons: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  const items = await Promise.all(products.map(computeProductCosts));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

// ============================================================
// Get product by ID
// ============================================================

const getProductById = async (id) => {
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    const error = new Error("Invalid product ID");
    error.statusCode = 400;
    throw error;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: PRODUCT_INCLUDE,
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return toVariants(product);
};

// ============================================================
// Create product
// ============================================================

const createProduct = async ({ name, description, image, category, isActive }) => {
  if (!name) {
    const error = new Error("Product name is required");
    error.statusCode = 400;
    throw error;
  }

  const existingProduct = await prisma.product.findUnique({ where: { name } });

  if (existingProduct) {
    const error = new Error("Product already exists");
    error.statusCode = 409;
    throw error;
  }

  return prisma.product.create({
    data: {
      name,
      description: description || null,
      image: image || null,
      category: category || null,
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
    include: { types: true, sizes: true, addons: true },
  });
};

// ============================================================
// Update product
// ============================================================

const updateProduct = async (id, data) => {
  const productId = Number(id);

  const existingProduct = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!existingProduct) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  const { name, description, image, category, isActive } = data;

  return prisma.product.update({
    where: { id: productId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(image !== undefined && { image: image || null }),
      ...(category !== undefined && { category: category || null }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
    include: { types: true, sizes: true, addons: true },
  });
};

// ============================================================
// Delete product
// ============================================================

const deleteProduct = async (id) => {
  const productId = Number(id);

  const existingProduct = await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

  if (!existingProduct) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  const orderCount = await prisma.orderItem.count({
    where: { productId },
  });

  if (orderCount > 0) {
    const error = new Error(
      "لا يمكن حذف المنتج لوجود عمليات مرتبطة"
    );
    error.statusCode = 409;
    throw error;
  }

  await prisma.product.delete({
    where: {
      id: productId,
    },
  });

  return existingProduct;
};

// ============================================================
// Add product size
// ============================================================

const createProductSize = async ({
  productId,
  typeName,
  name,
  basePrice,
  finalPrice,
}) => {
  const product = await prisma.product.findUnique({
    where: {
      id: Number(productId),
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  if (
    !typeName ||
    !name ||
    basePrice === undefined ||
    finalPrice === undefined
  ) {
    const error = new Error(
      "typeName, name, basePrice and finalPrice are required",
    );
    error.statusCode = 400;
    throw error;
  }

  const existingSize = await prisma.productSize.findFirst({
    where: {
      productId: Number(productId),
      typeName,
      name,
    },
  });

  if (existingSize) {
    const error = new Error("Product size already exists");
    error.statusCode = 409;
    throw error;
  }

  return prisma.productSize.create({
    data: {
      productId: Number(productId),
      typeName,
      name,
      basePrice,
      finalPrice,
    },
    include: {
      ingredients: {
        include: {
          rawMaterial: true,
        },
      },
    },
  });
};

// ============================================================
// Get product sizes
// ============================================================

const getProductSizes = async (productId) => {
  const product = await prisma.product.findUnique({
    where: {
      id: Number(productId),
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return prisma.productSize.findMany({
    where: {
      productId: Number(productId),
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      ingredients: {
        include: {
          rawMaterial: true,
        },
      },
    },
  });
};

// Add ingredient to product size
const createProductSizeIngredient = async ({
  productSizeId,
  rawMaterialId,
  quantity,
  unit,
}) => {
  const productSize = await prisma.productSize.findUnique({
    where: {
      id: Number(productSizeId),
    },
  });

  if (!productSize) {
    const error = new Error("Product size not found");
    error.statusCode = 404;
    throw error;
  }

  const rawMaterial = await prisma.rawMaterial.findUnique({
    where: {
      id: Number(rawMaterialId),
    },
  });

  if (!rawMaterial) {
    const error = new Error("Raw material not found");
    error.statusCode = 404;
    throw error;
  }

  if (quantity === undefined || quantity <= 0 || !unit) {
    const error = new Error(
      "quantity and unit are required and quantity must be greater than 0",
    );
    error.statusCode = 400;
    throw error;
  }

  const existingIngredient = await prisma.productSizeIngredient.findUnique({
    where: {
      productSizeId_rawMaterialId: {
        productSizeId: Number(productSizeId),
        rawMaterialId: Number(rawMaterialId),
      },
    },
  });

  if (existingIngredient) {
    const error = new Error(
      "This raw material is already added to this product size",
    );
    error.statusCode = 409;
    throw error;
  }

  return prisma.productSizeIngredient.create({
    data: {
      productSizeId: Number(productSizeId),
      rawMaterialId: Number(rawMaterialId),
      quantity,
      unit,
    },
    include: {
      rawMaterial: true,
      productSize: true,
    },
  });
};
// ============================================================
// Product types
// ============================================================

const getProductTypes = async (productId) => {
  const product = await prisma.product.findUnique({
    where: {
      id: Number(productId),
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return prisma.productType.findMany({
    where: {
      productId: Number(productId),
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      ingredients: {
        include: {
          rawMaterial: true,
        },
      },
    },
  });
};

const createProductType = async ({ productId, name }) => {
  const product = await prisma.product.findUnique({
    where: {
      id: Number(productId),
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  if (!name) {
    const error = new Error("Type name is required");
    error.statusCode = 400;
    throw error;
  }

  const existingType = await prisma.productType.findUnique({
    where: {
      productId_name: {
        productId: Number(productId),
        name,
      },
    },
  });

  if (existingType) {
    const error = new Error("Product type already exists");
    error.statusCode = 409;
    throw error;
  }

  return prisma.productType.create({
    data: {
      productId: Number(productId),
      name,
    },
    include: {
      ingredients: true,
    },
  });
};

const updateProductType = async (typeId, data) => {
  const productType = await prisma.productType.findUnique({
    where: {
      id: Number(typeId),
    },
  });

  if (!productType) {
    const error = new Error("Product type not found");
    error.statusCode = 404;
    throw error;
  }

  const { name } = data;

  if (name !== undefined) {
    const existingType = await prisma.productType.findFirst({
      where: {
        productId: productType.productId,
        name,
        id: { not: productType.id },
      },
    });

    if (existingType) {
      const error = new Error("Product type already exists");
      error.statusCode = 409;
      throw error;
    }
  }

  return prisma.productType.update({
    where: {
      id: productType.id,
    },
    data: {
      ...(name !== undefined && { name }),
    },
    include: {
      ingredients: {
        include: {
          rawMaterial: true,
        },
      },
    },
  });
};

const deleteProductType = async (typeId) => {
  const productType = await prisma.productType.findUnique({
    where: {
      id: Number(typeId),
    },
  });

  if (!productType) {
    const error = new Error("Product type not found");
    error.statusCode = 404;
    throw error;
  }

  await prisma.productType.delete({
    where: {
      id: productType.id,
    },
  });

  return productType;
};

const addProductTypeIngredient = async ({ productTypeId, rawMaterialId }) => {
  const productType = await prisma.productType.findUnique({
    where: {
      id: Number(productTypeId),
    },
  });

  if (!productType) {
    const error = new Error("Product type not found");
    error.statusCode = 404;
    throw error;
  }

  const rawMaterial = await prisma.rawMaterial.findUnique({
    where: {
      id: Number(rawMaterialId),
    },
  });

  if (!rawMaterial) {
    const error = new Error("Raw material not found");
    error.statusCode = 404;
    throw error;
  }

  const existingIngredient = await prisma.productTypeIngredient.findUnique({
    where: {
      productTypeId_rawMaterialId: {
        productTypeId: productType.id,
        rawMaterialId: Number(rawMaterialId),
      },
    },
  });

  if (existingIngredient) {
    const error = new Error(
      "This raw material is already added to this product type",
    );
    error.statusCode = 409;
    throw error;
  }

  return prisma.productTypeIngredient.create({
    data: {
      productTypeId: productType.id,
      rawMaterialId: Number(rawMaterialId),
    },
    include: {
      rawMaterial: true,
      productType: true,
    },
  });
};

const removeProductTypeIngredient = async ({ productTypeId, rawMaterialId }) => {
  const ingredient = await prisma.productTypeIngredient.findUnique({
    where: {
      productTypeId_rawMaterialId: {
        productTypeId: Number(productTypeId),
        rawMaterialId: Number(rawMaterialId),
      },
    },
  });

  if (!ingredient) {
    const error = new Error("Ingredient not found in this product type");
    error.statusCode = 404;
    throw error;
  }

  await prisma.productTypeIngredient.delete({
    where: {
      id: ingredient.id,
    },
  });

  return ingredient;
};

// ============================================================
// Product addons
// ============================================================

const getAddons = async (productId) => {
  const product = await prisma.product.findUnique({
    where: {
      id: Number(productId),
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return prisma.productAddon.findMany({
    where: {
      productId: Number(productId),
    },
    orderBy: {
      createdAt: "asc",
    },
  });
};

const createAddon = async ({ productId, name, price, notes }) => {
  const product = await prisma.product.findUnique({
    where: {
      id: Number(productId),
    },
  });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  if (!name || price === undefined || price < 0) {
    const error = new Error("name and a non-negative price are required");
    error.statusCode = 400;
    throw error;
  }

  const existingAddon = await prisma.productAddon.findUnique({
    where: {
      productId_name: {
        productId: Number(productId),
        name,
      },
    },
  });

  if (existingAddon) {
    const error = new Error("Addon already exists for this product");
    error.statusCode = 409;
    throw error;
  }

  return prisma.productAddon.create({
    data: {
      productId: Number(productId),
      name,
      price,
      notes: notes || null,
    },
  });
};

const updateAddon = async (addonId, data) => {
  const addon = await prisma.productAddon.findUnique({
    where: {
      id: Number(addonId),
    },
  });

  if (!addon) {
    const error = new Error("Addon not found");
    error.statusCode = 404;
    throw error;
  }

  const { name, price, notes } = data;

  if (name !== undefined) {
    const existingAddon = await prisma.productAddon.findFirst({
      where: {
        productId: addon.productId,
        name,
        id: { not: addon.id },
      },
    });

    if (existingAddon) {
      const error = new Error("Addon already exists for this product");
      error.statusCode = 409;
      throw error;
    }
  }

  if (price !== undefined && price < 0) {
    const error = new Error("price must be non-negative");
    error.statusCode = 400;
    throw error;
  }

  return prisma.productAddon.update({
    where: {
      id: addon.id,
    },
    data: {
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price }),
      ...(notes !== undefined && { notes: notes || null }),
    },
  });
};

const deleteAddon = async (addonId) => {
  const addon = await prisma.productAddon.findUnique({
    where: {
      id: Number(addonId),
    },
  });

  if (!addon) {
    const error = new Error("Addon not found");
    error.statusCode = 404;
    throw error;
  }

  await prisma.productAddon.delete({
    where: {
      id: addon.id,
    },
  });

  return addon;
};

// ============================================================
// Product Configuration (multipart: image + configuration JSON)
// ============================================================

const fs = require("fs");
const path = require("path");

const UPLOADS_DIR = path.join(__dirname, "../../../uploads/products");

const createProductConfiguration = async (configJson, imageFile) => {
  const config = typeof configJson === "string" ? JSON.parse(configJson) : configJson;

  const { name, description, categoryId, isActive, types, sizes, addons } = config;

  if (!name) {
    const error = new Error("Product name is required");
    error.statusCode = 400;
    throw error;
  }

  const existing = await prisma.product.findUnique({ where: { name } });
  if (existing) {
    const error = new Error("Product already exists");
    error.statusCode = 409;
    throw error;
  }

  let imagePath = null;

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name,
        description: description || null,
        image: imagePath,
        categoryId: categoryId || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    const createdTypes = [];
    if (Array.isArray(types)) {
      for (const t of types) {
        const productType = await tx.productType.create({
          data: { productId: product.id, name: t.name },
        });
        if (Array.isArray(t.ingredients)) {
          for (const ing of t.ingredients) {
            await tx.productTypeIngredient.create({
              data: {
                productTypeId: productType.id,
                rawMaterialId: ing.rawMaterialId,
              },
            });
          }
        }
        createdTypes.push(productType);
      }
    }

    const createdSizes = [];
    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        const size = await tx.productSize.create({
          data: {
            productId: product.id,
            typeName: s.typeName,
            name: s.name,
            basePrice: s.sellingPrice || 0,
            finalPrice: s.sellingPrice || 0,
            isActive: s.isActive !== undefined ? Boolean(s.isActive) : true,
          },
        });
        if (Array.isArray(s.ingredients)) {
          for (const ing of s.ingredients) {
            await tx.productSizeIngredient.create({
              data: {
                productSizeId: size.id,
                rawMaterialId: ing.rawMaterialId,
                quantity: ing.quantity,
                unit: ing.unit,
              },
            });
          }
        }
        createdSizes.push(size);
      }
    }

    if (Array.isArray(addons)) {
      for (const a of addons) {
        await tx.productAddon.create({
          data: {
            productId: product.id,
            name: a.name,
            price: a.price,
            notes: a.notes || null,
          },
        });
      }
    }

    return product;
  });

  if (imageFile) {
    const filename = `product-${result.id}.webp`;
    const dest = path.join(UPLOADS_DIR, filename);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.copyFileSync(imageFile.path, dest);
    imagePath = `/uploads/products/${filename}`;
    await prisma.product.update({ where: { id: result.id }, data: { image: imagePath } });
  }

  const fullProduct = await prisma.product.findUnique({
    where: { id: result.id },
    include: {
      types: { include: { ingredients: { include: { rawMaterial: true } } } },
      sizes: { include: { ingredients: { include: { rawMaterial: true } } } },
      addons: true,
    },
  });

  const costResult = await computeProductCosts(fullProduct);

  return {
    id: result.id,
    image: result.image,
    sizes: costResult.sizes.map((s) => ({
      id: s.id,
      name: s.name,
      costPrice: s.costPrice,
      sellingPrice: s.sellingPrice,
      profit: s.profit,
      profitMargin: s.profitMargin,
    })),
  };
};

const updateProductConfiguration = async (productId, configJson, imageFile) => {
  const pId = Number(productId);
  const config = typeof configJson === "string" ? JSON.parse(configJson) : configJson;

  const existing = await prisma.product.findUnique({ where: { id: pId } });
  if (!existing) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  const { name, description, categoryId, isActive, types, sizes, addons } = config;

  let imagePath = existing.image;
  if (imageFile) {
    const filename = `product-${pId}.webp`;
    const dest = path.join(UPLOADS_DIR, filename);
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.copyFileSync(imageFile.path, dest);
    imagePath = `/uploads/products/${filename}`;
    if (existing.image) {
      const oldPath = path.join(__dirname, "../..", existing.image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: pId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        image: imagePath,
      },
    });

    if (Array.isArray(types)) {
      for (const t of types) {
        if (t.id) {
          await tx.productType.update({
            where: { id: t.id },
            data: { name: t.name },
          });
          if (Array.isArray(t.ingredients)) {
            await tx.productTypeIngredient.deleteMany({
              where: { productTypeId: t.id },
            });
            for (const ing of t.ingredients) {
              await tx.productTypeIngredient.create({
                data: {
                  productTypeId: t.id,
                  rawMaterialId: ing.rawMaterialId,
                },
              });
            }
          }
        } else {
          const productType = await tx.productType.create({
            data: { productId: pId, name: t.name },
          });
          if (Array.isArray(t.ingredients)) {
            for (const ing of t.ingredients) {
              await tx.productTypeIngredient.create({
                data: {
                  productTypeId: productType.id,
                  rawMaterialId: ing.rawMaterialId,
                },
              });
            }
          }
        }
      }
    }

    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        if (s.id) {
          await tx.productSize.update({
            where: { id: s.id },
            data: {
              ...(s.name !== undefined && { name: s.name }),
              ...(s.typeName !== undefined && { typeName: s.typeName }),
              ...(s.sellingPrice !== undefined && {
                finalPrice: s.sellingPrice,
                basePrice: s.sellingPrice,
              }),
              ...(s.isActive !== undefined && { isActive: Boolean(s.isActive) }),
            },
          });
          if (Array.isArray(s.ingredients)) {
            await tx.productSizeIngredient.deleteMany({
              where: { productSizeId: s.id },
            });
            for (const ing of s.ingredients) {
              await tx.productSizeIngredient.create({
                data: {
                  productSizeId: s.id,
                  rawMaterialId: ing.rawMaterialId,
                  quantity: ing.quantity,
                  unit: ing.unit,
                },
              });
            }
          }
        } else {
          const size = await tx.productSize.create({
            data: {
              productId: pId,
              typeName: s.typeName,
              name: s.name,
              basePrice: s.sellingPrice || 0,
              finalPrice: s.sellingPrice || 0,
              isActive: s.isActive !== undefined ? Boolean(s.isActive) : true,
            },
          });
          if (Array.isArray(s.ingredients)) {
            for (const ing of s.ingredients) {
              await tx.productSizeIngredient.create({
                data: {
                  productSizeId: size.id,
                  rawMaterialId: ing.rawMaterialId,
                  quantity: ing.quantity,
                  unit: ing.unit,
                },
              });
            }
          }
        }
      }
    }

    if (Array.isArray(addons)) {
      for (const a of addons) {
        if (a.id) {
          await tx.productAddon.update({
            where: { id: a.id },
            data: {
              ...(a.name !== undefined && { name: a.name }),
              ...(a.price !== undefined && { price: a.price }),
              ...(a.notes !== undefined && { notes: a.notes || null }),
            },
          });
        } else {
          await tx.productAddon.create({
            data: {
              productId: pId,
              name: a.name,
              price: a.price,
              notes: a.notes || null,
            },
          });
        }
      }
    }
  });

  const fullProduct = await prisma.product.findUnique({
    where: { id: pId },
    include: {
      types: { include: { ingredients: { include: { rawMaterial: true } } } },
      sizes: { include: { ingredients: { include: { rawMaterial: true } } } },
      addons: true,
    },
  });

  const costResult = await computeProductCosts(fullProduct);

  return {
    id: pId,
    image: imagePath,
    sizes: costResult.sizes.map((s) => ({
      id: s.id,
      name: s.name,
      costPrice: s.costPrice,
      sellingPrice: s.sellingPrice,
      profit: s.profit,
      profitMargin: s.profitMargin,
    })),
  };
};

module.exports = {
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
};