/**
 * docs/swagger.js — توثيق OpenAPI 3.0 كامل للـ API
 * الواجهة: GET /api/docs (Swagger UI) + GET /api/docs.json
 * آخر تحديث: 09 سبتمبر 2026 — مواءمة كاملة مع الكود
 */

const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const bearerAuth = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
};

// ─── Response helpers ─────────────────────────────────────────
const successResponse = {
  description: "نجاح",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: { type: "object" },
        },
      },
    },
  },
};

const messageOnlyResponse = (msg) => ({
  description: "نجاح",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: msg },
        },
      },
      example: { success: true, message: msg },
    },
  },
});

const emptyDataResponse = (msg) => ({
  description: "نجاح",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: { type: "object", example: {} },
        },
      },
      example: { success: true, message: msg, data: {} },
    },
  },
});

const listResponse = {
  description: "قائمة (مع pagination)",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "array", items: { type: "object" } },
          pagination: {
            type: "object",
            properties: {
              page: { type: "integer" },
              pageSize: { type: "integer" },
              total: { type: "integer" },
              totalPages: { type: "integer" },
            },
          },
        },
      },
    },
  },
};

const errorResponses = {
  400: { description: "بيانات غير صالحة" },
  401: { description: "مطلوب تسجيل دخول / توكن غير صالح" },
  403: { description: "لا تملك الصلاحية" },
  404: { description: "غير موجود" },
  500: { description: "خطأ في الخادم" },
};

const conflictResponse = (msg) => ({
  description: "تعارض — لا يمكن تنفيذ العملية",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          statusCode: { type: "integer", example: 409 },
        },
      },
      example: { success: false, message: msg, statusCode: 409 },
    },
  },
});

const unprocessableResponse = (msg) => ({
  description: "بيانات غير قابلة للمعالجة",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          statusCode: { type: "integer", example: 422 },
        },
      },
      example: { success: false, message: msg, statusCode: 422 },
    },
  },
});

const paginationParams = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 1 },
    description: "رقم الصفحة",
  },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    description: "حجم الصفحة (الحد الأقصى 100)",
  },
];

const idParam = (name = "id", description = "المعرف") => ({
  name,
  in: "path",
  required: true,
  schema: { type: "integer" },
  description,
});

// ─── Schemas ──────────────────────────────────────────────────
const productConfigSchema = {
  type: "object",
  required: ["configuration"],
  properties: {
    image: { type: "string", format: "binary", description: "صورة المنتج (PNG/JPEG/WebP، حد أقصى 5MB)" },
    configuration: {
      type: "string",
      description: "JSON string يحتوي على بيانات المنتج",
      example: '{"name":"لاتيه","description":"قهوة بالحليب","categoryId":2,"isActive":true,"types":[{"name":"ساخن","ingredients":[{"rawMaterialId":5,"quantity":0.02}]}],"sizes":[{"name":"وسط","sellingPrice":70,"ingredients":[{"rawMaterialId":5,"quantity":0.02}]}],"addons":[{"name":"شوت إضافي","price":15}]}',
    },
  },
};

const sizeResponseSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    costPrice: { type: "number" },
    sellingPrice: { type: "number" },
    profit: { type: "number" },
    profitMargin: { type: "number" },
  },
};

const categorySchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    isActive: { type: "boolean" },
  },
};

const typeSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
  },
};

const publicProductSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    englishName: { type: "string" },
    description: { type: "string" },
    image: { type: "string" },
    categoryName: { type: "string" },
    isNew: { type: "boolean" },
    isBestSeller: { type: "boolean" },
    types: { type: "array", items: typeSchema },
    sizes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          sellingPrice: { type: "number" },
        },
      },
    },
    addons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          price: { type: "number" },
        },
      },
    },
  },
};

const rawMaterialSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    unit: { type: "string" },
    supplierId: { type: "integer", nullable: true },
    supplier: {
      type: "object",
      nullable: true,
      properties: { id: { type: "integer" }, name: { type: "string" } },
    },
    minStockAlert: { type: "number" },
    expiryAlertDays: { type: "integer" },
    batches: { type: "array", items: { type: "object" } },
  },
};

const batchSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    batchNumber: { type: "string" },
    initialQuantity: { type: "number" },
    quantity: { type: "number" },
    pricePerUnit: { type: "number" },
    addedAt: { type: "string", format: "date" },
    expiryDate: { type: "string", format: "date" },
    withdrawalPriority: { type: "integer" },
  },
};

const withdrawalSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    batchId: { type: "integer" },
    quantity: { type: "number" },
    unitCost: { type: "number" },
    totalCost: { type: "number" },
    reason: { type: "string" },
    processedAt: { type: "string", format: "date-time" },
  },
};

const supplierSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: { type: "string" },
    contactPerson: { type: "string" },
    phone: { type: "string" },
    supplierType: { type: "string" },
    city: { type: "string" },
    rawMaterials: { type: "array", items: { type: "object" } },
    accountSummary: {
      type: "object",
      properties: {
        debtBalance: { type: "number" },
        receivableBalance: { type: "number" },
        netBalance: { type: "number" },
      },
    },
  },
};

// ─── Auth ─────────────────────────────────────────────────────
const authPaths = {
  "/api/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "تسجيل دخول (عام)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "password"],
              properties: {
                name: { type: "string", example: "Admin" },
                password: { type: "string", example: "root123" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "نجاح — يرجع token + user",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: {
                      token: { type: "string" },
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "integer" },
                          name: { type: "string" },
                          position: { type: "string" },
                          role: {
                            type: "string",
                            enum: ["OWNER", "MANAGER", "CASHIER", "DELEGATE"],
                          },
                          status: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
};

const healthPaths = {
  "/api/health": {
    get: {
      tags: ["Health"],
      summary: "فحص الحالة (عام)",
      responses: {
        200: { description: "الخادم شغال" },
      },
    },
  },
};

// ─── Users ────────────────────────────────────────────────────
const usersPaths = {
  "/api/users": {
    get: {
      tags: ["Users"],
      summary: "قائمة المستخدمين",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Users"],
      summary: "إنشاء مستخدم",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "password", "position", "role"],
              properties: {
                name: { type: "string", example: "Mohamed" },
                password: { type: "string", example: "123456" },
                position: { type: "string", example: "CASHIER" },
                role: {
                  type: "string",
                  enum: ["OWNER", "MANAGER", "CASHIER", "DELEGATE"],
                  example: "CASHIER",
                },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/users/{id}": {
    put: {
      tags: ["Users"],
      summary: "تعديل مستخدم (name/password/position/role)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                password: { type: "string" },
                position: { type: "string" },
                role: { type: "string", enum: ["OWNER", "MANAGER", "CASHIER", "DELEGATE"] },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Users"],
      summary: "حذف مستخدم (ممنوع حذف نفسك أو آخر Owner)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/users/{id}/status": {
    patch: {
      tags: ["Users"],
      summary: "تفعيل/تعطيل مستخدم",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: {
                status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/users/{id}/permissions": {
    get: {
      tags: ["Users"],
      summary: "الصلاحيات الفعلية للمستخدم (من RBAC config)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المستخدم")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Products ─────────────────────────────────────────────────
const productsPaths = {
  // ── Admin CRUD ──
  "/api/products": {
    get: {
      tags: ["Products"],
      summary: "قائمة المنتجات (admin) — تشمل types/sizes/addons مع تكلفة محسوبة",
      security: [{ bearerAuth: [] }],
      parameters: [
        ...paginationParams,
        { name: "search", in: "query", schema: { type: "string" }, description: "بحث بالاسم" },
        { name: "categoryId", in: "query", schema: { type: "integer" }, description: "فلترة بالقسم" },
      ],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        name: { type: "string" },
                        description: { type: "string" },
                        image: { type: "string" },
                        categoryId: { type: "integer" },
                        categoryRef: { $ref: "#/components/schemas/CategoryRef" },
                        isActive: { type: "boolean" },
                        types: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "integer" },
                              name: { type: "string" },
                              ingredients: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    rawMaterialId: { type: "integer" },
                                    name: { type: "string" },
                                    unit: { type: "string" },
                                  },
                                },
                              },
                            },
                          },
                        },
                        sizes: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "integer" },
                              typeName: { type: "string" },
                              name: { type: "string" },
                              costPrice: { type: "number" },
                              sellingPrice: { type: "number" },
                              profit: { type: "number" },
                              profitMargin: { type: "number" },
                              isActive: { type: "boolean" },
                              ingredients: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    rawMaterialId: { type: "integer" },
                                    name: { type: "string" },
                                    quantity: { type: "number" },
                                    unit: { type: "string" },
                                    averageUnitCost: { type: "number" },
                                    cost: { type: "number" },
                                  },
                                },
                              },
                            },
                          },
                        },
                        addons: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "integer" },
                              name: { type: "string" },
                              price: { type: "number" },
                              notes: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                  pagination: { $ref: "#/components/schemas/Pagination" },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/products/{id}": {
    get: {
      tags: ["Products"],
      summary: "منتج واحد بالتفصيل (admin)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المنتج")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Products"],
      summary: "تعديل منتج أساسي",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المنتج")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                image: { type: "string" },
                categoryId: { type: "integer" },
                isActive: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Products"],
      summary: "حذف منتج (مرفوض 409 لو في طلبات مرتبطة)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المنتج")],
      responses: {
        200: messageOnlyResponse("تم حذف المنتج بنجاح"),
        409: conflictResponse("لا يمكن حذف المنتج لارتباطه بطلبات"),
        ...errorResponses,
      },
    },
  },

  // ── Categories ──
  "/api/products/categories": {
    get: {
      tags: ["Products"],
      summary: "قائمة أقسام المنتجات",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { type: "array", items: { $ref: "#/components/schemas/CategoryRef" } },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
    post: {
      tags: ["Products"],
      summary: "إضافة قسم جديد (409 لو الاسم موجود)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string", example: "مشروبات ساخنة" },
                isActive: { type: "boolean", default: true },
              },
            },
          },
        },
      },
      responses: {
        201: emptyDataResponse("تمت إضافة القسم بنجاح"),
        409: conflictResponse("اسم القسم موجود مسبقاً"),
        ...errorResponses,
      },
    },
  },
  "/api/products/categories/{id}": {
    put: {
      tags: ["Products"],
      summary: "تعديل قسم",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف القسم")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                isActive: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Products"],
      summary: "حذف قسم",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف القسم")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },

  // ── Types ──
  "/api/products/{productId}/types": {
    get: {
      tags: ["Products"],
      summary: "أنواع منتج",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("productId", "معرف المنتج")],
      responses: { 200: successResponse, ...errorResponses },
    },
    post: {
      tags: ["Products"],
      summary: "إضافة نوع لمنتج",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("productId", "معرف المنتج")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: { name: { type: "string", example: "ساخن" } },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/products/{productId}/types/{typeId}": {
    put: {
      tags: ["Products"],
      summary: "تعديل نوع",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("productId", "معرف المنتج"),
        idParam("typeId", "معرف النوع"),
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Products"],
      summary: "حذف نوع",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("productId", "معرف المنتج"),
        idParam("typeId", "معرف النوع"),
      ],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/products/{productId}/types/{typeId}/ingredients/{rawMaterialId}": {
    post: {
      tags: ["Products"],
      summary: "إضافة مادة خامة لنوع",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("productId", "معرف المنتج"),
        idParam("typeId", "معرف النوع"),
        idParam("rawMaterialId", "معرف المادة الخام"),
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { quantity: { type: "number", example: 0.02 } },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Products"],
      summary: "حذف مادة خامة من نوع",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("productId", "معرف المنتج"),
        idParam("typeId", "معرف النوع"),
        idParam("rawMaterialId", "معرف المادة الخام"),
      ],
      responses: { 200: successResponse, ...errorResponses },
    },
  },

  // ── Sizes ──
  "/api/products/{productId}/sizes": {
    get: {
      tags: ["Products"],
      summary: "أحجام منتج",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("productId", "معرف المنتج")],
      responses: { 200: successResponse, ...errorResponses },
    },
    post: {
      tags: ["Products"],
      summary: "إضافة حجم لمنتج",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("productId", "معرف المنتج")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "sellingPrice"],
              properties: {
                name: { type: "string", example: "وسط" },
                sellingPrice: { type: "number", example: 70 },
                productTypeId: { type: "integer" },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/products/{productId}/sizes/{sizeId}/ingredients": {
    post: {
      tags: ["Products"],
      summary: "إضافة مادة خامة لحجم",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("productId", "معرف المنتج"),
        idParam("sizeId", "معرف الحجم"),
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["rawMaterialId", "quantity"],
              properties: {
                rawMaterialId: { type: "integer" },
                quantity: { type: "number", example: 0.02 },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },

  // ── Addons ──
  "/api/products/{productId}/addons": {
    get: {
      tags: ["Products"],
      summary: "إضافات منتج",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("productId", "معرف المنتج")],
      responses: { 200: successResponse, ...errorResponses },
    },
    post: {
      tags: ["Products"],
      summary: "إضافةaddon لمنتج",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("productId", "معرف المنتج")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "price"],
              properties: {
                name: { type: "string", example: "شوت إضافي" },
                price: { type: "number", example: 15 },
                notes: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/products/{productId}/addons/{addonId}": {
    put: {
      tags: ["Products"],
      summary: "تعديل addon",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("productId", "معرف المنتج"),
        idParam("addonId", "معرف الإضافة"),
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: "number" },
                notes: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Products"],
      summary: "حذف addon",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("productId", "معرف المنتج"),
        idParam("addonId", "معرف الإضافة"),
      ],
      responses: { 200: successResponse, ...errorResponses },
    },
  },

  // ── POS Catalog (authenticated, no costs) ──
  "/api/products/pos-catalog": {
    get: {
      tags: ["Products"],
      summary: "كتالوج POS (مصادق — بدون أسعار تكلفة)",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: {
                    type: "object",
                    properties: {
                      products: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            name: { type: "string" },
                            description: { type: "string" },
                            image: { type: "string" },
                            categoryId: { type: "integer" },
                            isActive: { type: "boolean" },
                            types: { type: "array", items: { $ref: "#/components/schemas/TypeRef" } },
                            sizes: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "integer" },
                                  typeName: { type: "string" },
                                  name: { type: "string" },
                                  sellingPrice: { type: "number" },
                                  isActive: { type: "boolean" },
                                },
                              },
                            },
                            addons: { type: "array", items: { $ref: "#/components/schemas/AddonRef" } },
                          },
                        },
                      },
                      categories: { type: "array", items: { $ref: "#/components/schemas/CategoryRef" } },
                    },
                  },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },

  // ── Public Catalog (no auth) ──
  "/api/products/public": {
    get: {
      tags: ["Products"],
      summary: "كتالوج عام (بدون مصادق) — منتجات نشطة فقط",
      responses: {
        200: {
          description: "نجاح — array مباشر",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { type: "array", items: { $ref: "#/components/schemas/PublicProduct" } },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/products/public/categories": {
    get: {
      tags: ["Products"],
      summary: "أقسام عامة (بدون مصادق) — نشطة فقط",
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { type: "array", items: { $ref: "#/components/schemas/CategoryRef" } },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/products/public/top": {
    get: {
      tags: ["Products"],
      summary: "أكثر المنتجات طلبًا في فترة محددة",
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer", default: 6 }, description: "عدد المنتجات" },
        { name: "days", in: "query", schema: { type: "integer", default: 30 }, description: "عدد الأيام" },
      ],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        productId: { type: "integer" },
                        name: { type: "string" },
                        image: { type: "string" },
                        sellingPrice: { type: "number" },
                        totalOrders: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },

  // ── Product Configuration (multipart/form-data) ──
  "/api/products/configuration": {
    post: {
      tags: ["Products"],
      summary: "إنشاء منتج كامل مع Types/Sizes/Ingredients/Addons (multipart)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: { $ref: "#/components/schemas/ProductConfigRequest" },
          },
        },
      },
      responses: {
        201: {
          description: "نجاح — الصورة بتتسمى product-{id}.webp",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      image: { type: "string", example: "/uploads/products/product-1.webp" },
                      sizes: { type: "array", items: { $ref: "#/components/schemas/SizeCostResponse" } },
                    },
                  },
                },
              },
              example: {
                success: true,
                message: "تم حفظ المنتج وحساب التكلفة",
                data: {
                  id: 1,
                  image: "/uploads/products/product-1.webp",
                  sizes: [
                    { id: 1, name: "وسط", costPrice: 18, sellingPrice: 70, profit: 52, profitMargin: 74.29 },
                  ],
                },
              },
            },
          },
        },
        409: conflictResponse("المنتج موجود مسبقاً"),
        ...errorResponses,
      },
    },
  },
  "/api/products/{id}/configuration": {
    put: {
      tags: ["Products"],
      summary: "تعديل منتج كامل مع Types/Sizes/Ingredients/Addons (multipart)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المنتج")],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: { $ref: "#/components/schemas/ProductConfigRequest" },
          },
        },
      },
      responses: {
        200: {
          description: "نجاح — الصورة القديمة بتتحذف والجديدة بتتسمى product-{id}.webp",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: {
                      id: { type: "integer" },
                      image: { type: "string", example: "/uploads/products/product-1.webp" },
                      sizes: { type: "array", items: { $ref: "#/components/schemas/SizeCostResponse" } },
                    },
                  },
                },
              },
              example: {
                success: true,
                message: "تم تحديث المنتج وحساب التكلفة",
                data: {
                  id: 1,
                  image: "/uploads/products/product-1.webp",
                  sizes: [
                    { id: 1, name: "وسط", costPrice: 18, sellingPrice: 70, profit: 52, profitMargin: 74.29 },
                  ],
                },
              },
            },
          },
        },
        404: errorResponses[404],
        ...errorResponses,
      },
    },
  },
};

// ─── Sales ────────────────────────────────────────────────────
const saleItemSchema = {
  type: "object",
  required: ["productId", "productSizeId", "quantity"],
  properties: {
    productId: { type: "integer" },
    productSizeId: { type: "integer" },
    quantity: { type: "number", example: 1 },
  },
};

const salesPaths = {
  "/api/sales": {
    get: {
      tags: ["Sales"],
      summary: "قائمة المبيعات (فلترة + pagination)",
      security: [{ bearerAuth: [] }],
      parameters: [
        ...paginationParams,
        { name: "search", in: "query", schema: { type: "string" }, description: "بحث باسم/هاتف العميل" },
        { name: "status", in: "query", schema: { type: "string", enum: ["COMPLETED", "CANCELLED"] } },
        { name: "paymentMethod", in: "query", schema: { type: "string", enum: ["CASH", "CARD", "WALLET"] } },
      ],
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Sales"],
      summary: "إنشاء فاتورة مبيعات",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["items"],
              properties: {
                customerId: { type: "integer" },
                discount: { type: "number", default: 0 },
                paymentMethod: { type: "string", enum: ["CASH", "CARD", "WALLET"], default: "CASH" },
                status: { type: "string", enum: ["COMPLETED", "CANCELLED"], default: "COMPLETED" },
                items: { type: "array", items: saleItemSchema },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/sales/{id}": {
    get: {
      tags: ["Sales"],
      summary: "فاتورة مبيعات واحدة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف الفاتورة")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Sales"],
      summary: "تعديل فاتورة مبيعات",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف الفاتورة")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                customerId: { type: "integer" },
                discount: { type: "number" },
                paymentMethod: { type: "string", enum: ["CASH", "CARD", "WALLET"] },
                status: { type: "string", enum: ["COMPLETED", "CANCELLED"] },
                items: { type: "array", items: saleItemSchema },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Sales"],
      summary: "إلغاء فاتورة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف الفاتورة")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Customers ────────────────────────────────────────────────
const customersPaths = {
  "/api/customers": {
    get: {
      tags: ["Customers"],
      summary: "قائمة العملاء",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Customers"],
      summary: "إنشاء عميل",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/customers/{id}": {
    get: {
      tags: ["Customers"],
      summary: "عميل واحد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Customers"],
      summary: "تعديل عميل",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Customers"],
      summary: "حذف عميل",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Suppliers ────────────────────────────────────────────────
const suppliersPaths = {
  "/api/suppliers": {
    get: {
      tags: ["Suppliers"],
      summary: "قائمة الموردين",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Suppliers"],
      summary: "إضافة مورد جديد",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string" },
                contactPerson: { type: "string" },
                phone: { type: "string" },
                supplierType: { type: "string" },
                city: { type: "string" },
                email: { type: "string" },
                country: { type: "string" },
                address: { type: "string" },
                taxRegistrationNumber: { type: "string" },
                supplierCategory: { type: "string" },
                paymentTerms: { type: "string" },
                creditLimit: { type: "number" },
                openingBalance: { type: "number" },
                notes: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/suppliers/options": {
    get: {
      tags: ["Suppliers"],
      summary: "قائمة الموردين للقوائم المنسدلة (id + name فقط)",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/suppliers/{id}": {
    get: {
      tags: ["Suppliers"],
      summary: "مورد واحد + rawMaterials + ملخص الحساب",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المورد")],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { $ref: "#/components/schemas/SupplierDetail" },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
    put: {
      tags: ["Suppliers"],
      summary: "تعديل مورد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المورد")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Suppliers"],
      summary: "حذف مورد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المورد")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/suppliers/{id}/transactions": {
    get: {
      tags: ["Suppliers"],
      summary: "معاملات مورد (بدون pagination) + summary",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("id", "معرف المورد"),
        { name: "type", in: "query", schema: { type: "string", enum: ["DEBT", "RECEIVABLE", "PAYMENT"] } },
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { type: "array", items: { type: "object" } },
                  summary: {
                    type: "object",
                    properties: {
                      totalIn: { type: "number" },
                      totalOut: { type: "number" },
                      balance: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
    post: {
      tags: ["Suppliers"],
      summary: "تسجيل معاملة مورد (DEBT/RECEIVABLE/PAYMENT)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المورد")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["type", "category", "amount", "transactionDate"],
              properties: {
                type: { type: "string", enum: ["DEBT", "RECEIVABLE", "PAYMENT"], description: "نوع المعاملة" },
                category: { type: "string", enum: ["DEBT", "RECEIVABLE"], description: "التصنيف" },
                amount: { type: "number", description: "المبلغ" },
                transactionDate: { type: "string", format: "date", description: "التاريخ" },
                notes: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        201: emptyDataResponse("تم تسجيل المعاملة بنجاح"),
        ...errorResponses,
      },
    },
  },
};

// ─── Delegates ────────────────────────────────────────────────
const delegatesPaths = {
  "/api/delegates": {
    get: {
      tags: ["Delegates"],
      summary: "قائمة المناديب",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Delegates"],
      summary: "إضافة مندوب",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/delegates/{id}": {
    get: {
      tags: ["Delegates"],
      summary: "مندوب واحد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Delegates"],
      summary: "تعديل مندوب",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Delegates"],
      summary: "حذف مندوب",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/delegates/{id}/status": {
    patch: {
      tags: ["Delegates"],
      summary: "تفعيل/تعطيل مندوب",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: { status: { type: "string", enum: ["AVAILABLE", "UNAVAILABLE"] } },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Inventory (Raw Materials) ────────────────────────────────
const inventoryPaths = {
  "/api/raw-materials": {
    get: {
      tags: ["Inventory"],
      summary: "قائمة المواد الخام (مع batches + supplier)",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { type: "array", items: { $ref: "#/components/schemas/RawMaterial" } },
                  pagination: { $ref: "#/components/schemas/Pagination" },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
    post: {
      tags: ["Inventory"],
      summary: "إضافة مادة خامة جديدة (تلقائي batch + batchNumber + priority)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "unit", "quantity", "pricePerUnit"],
              properties: {
                name: { type: "string", example: "بن" },
                unit: { type: "string", example: "kg" },
                quantity: { type: "number", example: 50 },
                pricePerUnit: { type: "number", example: 400 },
                supplier: { type: "string", description: "اسم المورد (نص)" },
                supplierId: { type: "integer", description: "معرف المورد (رقمي)" },
                minStockAlert: { type: "number" },
                expiryAlertDays: { type: "integer" },
                expiryDate: { type: "string", format: "date" },
              },
            },
          },
        },
      },
      responses: {
        201: emptyDataResponse("تمت إضافة المادة بنجاح"),
        ...errorResponses,
      },
    },
  },
  "/api/raw-materials/options": {
    get: {
      tags: ["Inventory"],
      summary: "قائمة المواد الخام للقوائم المنسدلة",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/raw-materials/return-options": {
    get: {
      tags: ["Inventory"],
      summary: "مواد خام بها دفعات متاحة (للمبيعات/المرتجعات)",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "integer" },
                        name: { type: "string" },
                        unit: { type: "string" },
                        supplier: {
                          type: "object",
                          nullable: true,
                          properties: { id: { type: "integer" }, name: { type: "string" } },
                        },
                        batches: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "integer" },
                              batchNumber: { type: "string" },
                              quantity: { type: "number" },
                              pricePerUnit: { type: "number" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/raw-materials/withdrawals": {
    get: {
      tags: ["Inventory"],
      summary: "سجل سحوبات المخزون",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: {
        200: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  data: { type: "array", items: { $ref: "#/components/schemas/Withdrawal" } },
                  pagination: { $ref: "#/components/schemas/Pagination" },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/raw-materials/{id}": {
    get: {
      tags: ["Inventory"],
      summary: "مادة خامة واحدة (مع batches مرتبة حسب priority)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Inventory"],
      summary: "تعديل مادة خامة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Inventory"],
      summary: "حذف مادة خام (مرفوض 409 لو في مشتريات/مرتجعات مرتبطة)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      responses: {
        200: emptyDataResponse("تم حذف المادة بنجاح"),
        409: conflictResponse("لا يمكن حذف المادة لوجود سجلات مرتبطة"),
        ...errorResponses,
      },
    },
  },
  "/api/raw-materials/{id}/batches": {
    get: {
      tags: ["Inventory"],
      summary: "دفعات مادة خامة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Inventory"],
      summary: "إضافة دفعة جديدة (تلقائي batchNumber + priority)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["quantity", "pricePerUnit"],
              properties: {
                quantity: { type: "number" },
                pricePerUnit: { type: "number" },
                expiryDate: { type: "string", format: "date" },
                addedAt: { type: "string", format: "date" },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/Batch" },
                },
              },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
  "/api/raw-materials/{id}/batches/{batchId}": {
    put: {
      tags: ["Inventory"],
      summary: "تعديل دفعة (مطالبة بـ adjustmentReason على تغيير الكمية)",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("id", "معرف المادة"),
        idParam("batchId", "معرف الدفعة"),
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                quantity: { type: "number" },
                pricePerUnit: { type: "number" },
                expiryDate: { type: "string", format: "date" },
                adjustmentReason: { type: "string", description: "مطلوب عند تغيير الكمية" },
              },
            },
          },
        },
      },
      responses: {
        200: emptyDataResponse("تم تعديل الدفعة بنجاح"),
        ...errorResponses,
      },
    },
    delete: {
      tags: ["Inventory"],
      summary: "حذف دفعة (مرفوض 409 لو في سحوبات مرتبطة)",
      security: [{ bearerAuth: [] }],
      parameters: [
        idParam("id", "معرف المادة"),
        idParam("batchId", "معرف الدفعة"),
      ],
      responses: {
        200: { description: "نجاح", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } } } } },
        409: conflictResponse("لا يمكن حذف الدفعة لوجود سحوبات مرتبطة"),
        ...errorResponses,
      },
    },
  },
  "/api/raw-materials/{id}/batches-priority": {
    put: {
      tags: ["Inventory"],
      summary: "تحديث أولويات سحب الدفعات",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["batches"],
              properties: {
                batches: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "withdrawalPriority"],
                    properties: {
                      id: { type: "integer" },
                      withdrawalPriority: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/raw-materials/{id}/withdrawals": {
    post: {
      tags: ["Inventory"],
      summary: "سحب يدوي من دفعة (يقلل الكمية — يرفض 422 لو الكمية أقل)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id", "معرف المادة")],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["batchId", "quantity", "reason"],
              properties: {
                batchId: { type: "integer" },
                quantity: { type: "number" },
                reason: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "نجاح",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean" },
                  message: { type: "string" },
                  data: { $ref: "#/components/schemas/Withdrawal" },
                },
              },
            },
          },
        },
        422: unprocessableResponse("الكمية المتاحة أقل من المطلوب"),
        ...errorResponses,
      },
    },
  },
};

// ─── Purchases ────────────────────────────────────────────────
const purchasesPaths = {
  "/api/purchases": {
    get: {
      tags: ["Purchases"],
      summary: "قائمة المشتريات",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Purchases"],
      summary: "إنشاء فاتورة شراء",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/purchases/{id}": {
    get: {
      tags: "Purchases",
      summary: "فاتورة شراء واحدة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: "Purchases",
      summary: "تعديل فاتورة شراء",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: "Purchases",
      summary: "حذف فاتورة شراء",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/purchases/{id}/approve": {
    patch: {
      tags: ["Purchases"],
      summary: "اعتماد فاتورة شراء (تضيف للدفعات)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/purchases/{id}/cancel": {
    patch: {
      tags: ["Purchases"],
      summary: "إلغاء فاتورة شراء",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Returns ──────────────────────────────────────────────────
const returnsPaths = {
  "/api/returns": {
    get: {
      tags: ["Returns"],
      summary: "قائمة المرتجعات",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Returns"],
      summary: "إنشاء مرتجع",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/returns/{id}": {
    get: {
      tags: "Returns",
      summary: "مرتجع واحد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: "Returns",
      summary: "تعديل مرتجع",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: "Returns",
      summary: "حذف مرتجع",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/returns/{id}/approve": {
    patch: {
      tags: ["Returns"],
      summary: "اعتماد مرتجع",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/returns/{id}/cancel": {
    patch: {
      tags: ["Returns"],
      summary: "إلغاء مرتجع",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Orders ───────────────────────────────────────────────────
const ordersPaths = {
  "/api/orders": {
    get: {
      tags: ["Orders"],
      summary: "قائمة الطلبات",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Orders"],
      summary: "إنشاء طلب",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                customerId: { type: "integer" },
                delegateId: { type: "integer" },
                orderType: { type: "string", enum: ["tables", "online"] },
                status: { type: "string", enum: ["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"] },
                phone: { type: "string" },
                paymentMethod: { type: "string", enum: ["CASH", "CARD", "WALLET"] },
                discount: { type: "number" },
                notes: { type: "string" },
                items: { type: "array", items: saleItemSchema },
              },
            },
          },
        },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/orders/{id}": {
    get: {
      tags: ["Orders"],
      summary: "طلب واحد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
    put: {
      tags: ["Orders"],
      summary: "تعديل طلب (بيشمل تحديث الحالة/المندوب)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
    delete: {
      tags: ["Orders"],
      summary: "حذف طلب",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Cash Drawer ──────────────────────────────────────────────
const cashDrawerPaths = {
  "/api/cash-drawer-shifts": {
    get: {
      tags: ["Cash Drawer"],
      summary: "قائمة الورديات",
      security: [{ bearerAuth: [] }],
      parameters: paginationParams,
      responses: { 200: listResponse, ...errorResponses },
    },
    post: {
      tags: ["Cash Drawer"],
      summary: "فتح وردية (openingBalance)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/current": {
    get: {
      tags: ["Cash Drawer"],
      summary: "الوردية المفتوحة حاليًا",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}": {
    get: {
      tags: ["Cash Drawer"],
      summary: "وردية واحدة",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}/close": {
    post: {
      tags: ["Cash Drawer"],
      summary: "إغلاق وردية (closingBalance/actualBalance/difference/notes)",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}/cash-in": {
    post: {
      tags: ["Cash Drawer"],
      summary: "إيداع نقدي",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
  "/api/cash-drawer-shifts/{id}/cash-out": {
    post: {
      tags: ["Cash Drawer"],
      summary: "سحب نقدي",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: { 201: successResponse, ...errorResponses },
    },
  },
};

// ─── Reports ──────────────────────────────────────────────────
const reportPaths = {
  "/api/financial-reports/sales": {
    get: {
      tags: ["Reports"],
      summary: "تقرير المبيعات",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/financial-reports/profit": {
    get: {
      tags: ["Reports"],
      summary: "تقرير الأرباح",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/financial-reports/treasury": {
    get: {
      tags: ["Reports"],
      summary: "تقرير الخزينة",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── Misc ─────────────────────────────────────────────────────
const miscPaths = {
  "/api/dashboard": {
    get: {
      tags: ["Dashboard"],
      summary: "ملخص اللوحة",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/audit-logs": {
    get: {
      tags: ["Audit Logs"],
      summary: "سجل الأحداث",
      security: [{ bearerAuth: [] }],
      parameters: [
        ...paginationParams,
        { name: "page", in: "query", schema: { type: "string" }, description: "اسم الصفحة" },
        { name: "action", in: "query", schema: { type: "string" } },
        { name: "userId", in: "query", schema: { type: "integer" } },
        { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
        { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
      ],
      responses: { 200: listResponse, ...errorResponses },
    },
  },
  "/api/audit-logs/{id}": {
    get: {
      tags: ["Audit Logs"],
      summary: "سجل حدث واحد",
      security: [{ bearerAuth: [] }],
      parameters: [idParam("id")],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/settings": {
    get: {
      tags: ["Settings"],
      summary: "كل الإعدادات",
      security: [{ bearerAuth: [] }],
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/settings/bulk": {
    post: {
      tags: ["Settings"],
      summary: "تحديث عدة إعدادات",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              example: { settings: [{ key: "shop_name", value: "404 Coffee" }] },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/settings/{key}": {
    put: {
      tags: ["Settings"],
      summary: "تحديث إعداد واحد",
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["value"],
              properties: { value: { type: "string" } },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
  "/api/warnings": {
    get: {
      tags: ["Warnings"],
      summary: "تنبيهات المخزون (low stock + قرب الانتهاء)",
      security: [{ bearerAuth: [] }],
      responses: { 200: listResponse, ...errorResponses },
    },
  },
};

const chatPaths = {
  "/api/chat": {
    post: {
      tags: ["Chat"],
      summary: "محادثة مع البوت (عام أو موظف حسب الـ token)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["messages"],
              properties: {
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string", enum: ["user", "assistant"] },
                      content: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: { 200: successResponse, ...errorResponses },
    },
  },
};

// ─── WebSocket Events ─────────────────────────────────────────
const websocketDocs = [
  {
    event: "inventory:updated",
    description: "يُرسل بعد أي تعديل على المواد الخام (إضافة/تعديل/حذف/سحب/ تحديث أولويات)",
    payload: {
      type: "object",
      properties: {
        event: { type: "string", example: "inventory:updated" },
        type: {
          type: "string",
          enum: ["create", "update", "delete", "add_batch", "edit_batch", "delete_batch", "update_priority", "withdrawal"],
          description: "نوع العملية",
        },
        materialId: { type: "integer", description: "معرف المادة الخام" },
        batchId: { type: "integer", description: "معرف الدفعة (اختياري — يظهر في تعديل/حذف دفعة أو سحب)" },
        at: { type: "string", format: "date-time", description: "وقت الحدث" },
      },
    },
  },
  {
    event: "order:created",
    description: "يُرسل عند إنشاء طلب جديد",
    payload: { type: "object", properties: { event: { type: "string" }, order: { type: "object" } } },
  },
  {
    event: "order:updated",
    description: "يُرسل عند تعديل طلب",
    payload: { type: "object", properties: { event: { type: "string" }, order: { type: "object" } } },
  },
  {
    event: "order:item:updated",
    description: "يُرسل عند تعديل حالة صنف في الطلب",
    payload: {
      type: "object",
      properties: {
        event: { type: "string" },
        orderId: { type: "integer" },
        itemId: { type: "integer" },
        status: { type: "string" },
        orderStatus: { type: "string" },
      },
    },
  },
  {
    event: "dashboard:updated",
    description: "يُرسل عند تحديث اللوحة",
    payload: { type: "object", properties: { event: { type: "string" }, at: { type: "string", format: "date-time" } } },
  },
];

// ─── Components / Schemas ─────────────────────────────────────
const components = {
  securitySchemes: { bearerAuth },
  schemas: {
    Pagination: {
      type: "object",
      properties: {
        page: { type: "integer" },
        pageSize: { type: "integer" },
        total: { type: "integer" },
        totalPages: { type: "integer" },
      },
    },
    CategoryRef: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        isActive: { type: "boolean" },
      },
    },
    TypeRef: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
      },
    },
    AddonRef: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        price: { type: "number" },
      },
    },
    PublicProduct: publicProductSchema,
    RawMaterial: rawMaterialSchema,
    Batch: batchSchema,
    Withdrawal: withdrawalSchema,
    SupplierDetail: supplierSchema,
    ProductConfigRequest: productConfigSchema,
    SizeCostResponse: sizeResponseSchema,
  },
};

// ─── Consolidate ──────────────────────────────────────────────
const paths = {
  ...healthPaths,
  ...authPaths,
  ...usersPaths,
  ...productsPaths,
  ...salesPaths,
  ...customersPaths,
  ...suppliersPaths,
  ...delegatesPaths,
  ...inventoryPaths,
  ...purchasesPaths,
  ...returnsPaths,
  ...ordersPaths,
  ...cashDrawerPaths,
  ...reportPaths,
  ...miscPaths,
  ...chatPaths,
};

const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "404 Coffee API",
    version: "2.1.0",
    description: `نظام إدارة كافيه — RBAC (OWNER/MANAGER/CASHIER/DELEGATE)، PostgreSQL، توثيق كامل لكل الـ endpoints.

## المصادقة
كل الـ endpoints ماعدا \`/api/auth/login\` و \`/api/health\` و \`/api/products/public*\` تتطلب \`Authorization: Bearer <JWT>\`.

## WebSocket Events
- \`inventory:updated\` — يُرسل بعد أي تعديل على المواد الخام
- \`order:created\` / \`order:updated\` / \`order:item:updated\` — تحديثات الطلبات
- \`dashboard:updated\` — تحديث اللوحة

## ملاحظات
- صور المنتجات بتتسمى \`product-{id}.webp\` بعد الرفع
- \`POST /api/products/configuration\` و \`PUT /api/products/{id}/configuration\` يستقبلان \`multipart/form-data\`
- \`DELETE /api/raw-materials/{id}\` و \`DELETE /api/products/{id}\` بيرجعوا 409 لو في سجلات مرتبطة`,
  },
  servers: [{ url: "http://localhost:5000" }],
  components,
  paths,
  // ─── WebSocket Documentation ───
  "x-websocket-events": websocketDocs,
};

module.exports = {
  swaggerUi,
  swaggerSpec,
};
