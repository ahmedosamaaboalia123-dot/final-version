/**
 * tests/helpers.js — Test environment setup
 * ==========================================
 * Uses a separate PostgreSQL database (coffee_404_test) to avoid
 * touching the dev database.
 */

const { execSync } = require("child_process");
const path = require("path");
try { require("dotenv/config"); } catch (_) {}

// Derive test DB URL from main DATABASE_URL by replacing the database name
const TEST_DB_URL = process.env.TEST_DATABASE_URL || (process.env.DATABASE_URL || "").replace(/\/[^/]+$/, "/coffee_404_test");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DB_URL;

execSync("./node_modules/.bin/prisma migrate deploy", {
  stdio: "ignore",
  env: { ...process.env, DATABASE_URL: TEST_DB_URL },
});

const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/lib/prisma");

const TABLE_NAMES = [
  "auth_sessions",
  "order_events",
  "attendance",
  "employee_devices",
  "user_page_access",
  "cash_drawer_transactions",
  "cash_drawer_shifts",
  "audit_logs",
  "settings",
  "sale_items",
  "sales",
  "order_items",
  "orders",
  "return_items",
  "returns",
  "purchase_items",
  "purchases",
  "product_type_ingredients",
  "product_size_ingredients",
  "product_addons",
  "product_sizes",
  "product_types",
  "products",
  "raw_material_batches",
  "raw_materials",
  "delegates",
  "suppliers",
  "customers",
  "users",
];

const resetDb = async () => {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica';`);
  for (const table of TABLE_NAMES) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
  }
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin';`);
};

const seedOwner = async (overrides = {}) => {
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash(overrides.password || "root123", 4);

  return prisma.user.create({
    data: {
      name: overrides.name || "Admin",
      passwordHash,
      position: overrides.position || "OWNER",
      role: "OWNER",
      status: "ACTIVE",
    },
  });
};

const seedUser = async (overrides = {}) => {
  const bcrypt = require("bcryptjs");
  const passwordHash = await bcrypt.hash(overrides.password || "pass123", 4);

  return prisma.user.create({
    data: {
      name: overrides.name || "Cashier One",
      passwordHash,
      position: overrides.position || "CASHIER",
      role: overrides.role || "CASHIER",
      status: overrides.status || "ACTIVE",
    },
  });
};

const loginToken = async (name, password) => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ name, password: password || "root123" });

  return res.body.data?.auth?.access_token || res.body.data?.token || res.body.data?.access_token;
};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const createSupplier = async () =>
  prisma.supplier.create({
    data: {
      name: "Tazweed Co",
      contactPerson: "Ahmed",
      phone: "0100000001",
      city: "Cairo",
      supplierType: "coffee",
      supplierCategory: "beans",
    },
  });

const createCustomer = async () =>
  prisma.customer.create({ data: { name: "Omar", phone: "01111111111" } });

const createMaterial = async () =>
  prisma.rawMaterial.create({
    data: {
      name: "Coffee Beans",
      unit: "kg",
      supplier: "Tazweed",
      minStockAlert: 5,
      batches: {
        create: { quantity: 50, pricePerUnit: 200 },
      },
    },
  });

const createProductWithSize = async () => {
  const product = await prisma.product.create({ data: { name: "Espresso" } });

  const size = await prisma.productSize.create({
    data: {
      productId: product.id,
      typeName: "Hot",
      name: "Medium",
      basePrice: 30,
      finalPrice: 35,
    },
  });

  return { product, size };
};

module.exports = {
  request,
  app,
  prisma,
  TEST_DB_URL,
  resetDb,
  seedOwner,
  seedUser,
  loginToken,
  bearer,
  createSupplier,
  createCustomer,
  createMaterial,
  createProductWithSize,
};
