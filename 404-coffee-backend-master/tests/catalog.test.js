const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  request,
  app,
  prisma,
  resetDb,
  seedOwner,
  loginToken,
  bearer,
} = require("./helpers");

describe("Catalog: customers, suppliers, delegates", () => {
  let token;

  before(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
  });

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
  });

  test("customer CRUD + pagination", async () => {
    const created = await request(app)
      .post("/api/customers")
      .set(bearer(token))
      .send({ name: "Omar", phone: "01111111111" });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const byId = await request(app).get(`/api/customers/${id}`).set(bearer(token));
    assert.equal(byId.status, 200);
    assert.equal(byId.body.data.name, "Omar");

    const updated = await request(app)
      .put(`/api/customers/${id}`)
      .set(bearer(token))
      .send({ name: "Omar Updated" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, "Omar Updated");

    const list = await request(app)
      .get("/api/customers?page=1&pageSize=10")
      .set(bearer(token));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.pagination.total, 1);

    const del = await request(app).delete(`/api/customers/${id}`).set(bearer(token));
    assert.equal(del.status, 200);
  });

  test("customer بدون بيانات → 400", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set(bearer(token))
      .send({});

    assert.equal(res.status, 400);
  });

  test("customer بتيليفون مكرر → 409", async () => {
    await request(app)
      .post("/api/customers")
      .set(bearer(token))
      .send({ name: "Omar", phone: "01111111111" });

    const res = await request(app)
      .post("/api/customers")
      .set(bearer(token))
      .send({ name: "Omar2", phone: "01111111111" });

    assert.equal(res.status, 409);
  });

  test("supplier CRUD", async () => {
    const created = await request(app)
      .post("/api/suppliers")
      .set(bearer(token))
      .send({
        name: "Tazweed",
        contactPerson: "Ahmed",
        phone: "0100000001",
        city: "Cairo",
        supplierType: "coffee",
        supplierCategory: "beans",
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const list = await request(app).get("/api/suppliers").set(bearer(token));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);

    const updated = await request(app)
      .put(`/api/suppliers/${id}`)
      .set(bearer(token))
      .send({ paymentTerms: "net-30" });
    assert.equal(updated.status, 200);

    const del = await request(app).delete(`/api/suppliers/${id}`).set(bearer(token));
    assert.equal(del.status, 200);
  });

  test("delegate CRUD + status", async () => {
    const created = await request(app)
      .post("/api/delegates")
      .set(bearer(token))
      .send({ name: "Ali", whatsapp: "01099999999", phone: "01099999998" });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const status = await request(app)
      .patch(`/api/delegates/${id}/status`)
      .set(bearer(token))
      .send({ status: "UNAVAILABLE" });
    assert.equal(status.status, 200);
    assert.equal(status.body.data.status, "UNAVAILABLE");

    const del = await request(app).delete(`/api/delegates/${id}`).set(bearer(token));
    assert.equal(del.status, 200);
  });
});

describe("Inventory: raw materials + batches", () => {
  let token;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
  });

  test("إنشاء مادة يستحدث دفعة = علامة المخزون", async () => {
    const res = await request(app)
      .post("/api/raw-materials")
      .set(bearer(token))
      .send({ name: "Coffee Beans", unit: "kg", quantity: 50, pricePerUnit: 200, supplier: "Tazweed", minStockAlert: 5 });

    assert.equal(res.status, 201);
    const material = await prisma.rawMaterial.findFirst({ where: { name: "Coffee Beans" } });
    const materialId = material.id;

    const batches = await request(app)
      .get(`/api/raw-materials/${materialId}/batches`)
      .set(bearer(token));

    assert.equal(batches.status, 200);
    assert.equal(batches.body.data.length, 1);
    assert.equal(Number(batches.body.data[0].quantity), 50);
  });

  test("بيانات ناقصة → 400", async () => {
    const res = await request(app)
      .post("/api/raw-materials")
      .set(bearer(token))
      .send({ name: "Chocolate" });

    assert.equal(res.status, 400);
  });

  test("إضافة دفعة لاحقًا + update المادة", async () => {
    const material = await prisma.rawMaterial.create({
      data: { name: "Milk", unit: "L", supplier: "Farm", minStockAlert: 10 },
    });

    const batch = await request(app)
      .post(`/api/raw-materials/${material.id}/batches`)
      .set(bearer(token))
      .send({ quantity: 20, pricePerUnit: 30, expiryDate: "2027-01-01" });
    assert.equal(batch.status, 201);

    const updated = await request(app)
      .put(`/api/raw-materials/${material.id}`)
      .set(bearer(token))
      .send({ minStockAlert: 15 });
    assert.equal(updated.status, 200);
    assert.equal(Number(updated.body.data.minStockAlert), 15);
  });

  test("قائمة المواد paginated", async () => {
    for (let i = 0; i < 5; i += 1) {
      await prisma.rawMaterial.create({
        data: { name: `M${i}`, unit: "kg", supplier: "S", minStockAlert: 1 },
      });
    }

    const res = await request(app)
      .get("/api/raw-materials?pageSize=2")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.pagination.total, 5);
    assert.equal(res.body.pagination.totalPages, 3);
  });
});

describe("Products: sizes/types/addons/ingredients", () => {
  let token;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
  });

  test("product + size + addon + ingredients بالكامل", async () => {
    const material = await prisma.rawMaterial.create({
      data: { name: "Beans", unit: "kg", supplier: "S", minStockAlert: 1 },
    });

    const product = await request(app)
      .post("/api/products")
      .set(bearer(token))
      .send({ name: "Espresso", description: "Double" });
    assert.equal(product.status, 201);
    const pid = product.body.data.id;

    const size = await request(app)
      .post(`/api/products/${pid}/sizes`)
      .set(bearer(token))
      .send({ typeName: "Hot", name: "Medium", basePrice: 30, finalPrice: 35 });
    assert.equal(size.status, 201);
    const sizeId = size.body.data.id;

    const ingredient = await request(app)
      .post(`/api/products/${pid}/sizes/${sizeId}/ingredients`)
      .set(bearer(token))
      .send({ rawMaterialId: material.id, quantity: 0.02, unit: "kg" });
    assert.equal(ingredient.status, 201);

    const addon = await request(app)
      .post(`/api/products/${pid}/addons`)
      .set(bearer(token))
      .send({ name: "Extra shot", price: 10 });
    assert.equal(addon.status, 201);
    assert.equal(Number(addon.body.data.price), 10);

    const detail = await request(app).get(`/api/products/${pid}`).set(bearer(token));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.sizes.length, 1);
    assert.equal(detail.body.data.addons.length, 1);
  });

  test("create product بدون name → 400 / مكرر → 409", async () => {
    const bad = await request(app)
      .post("/api/products")
      .set(bearer(token))
      .send({});
    assert.equal(bad.status, 400);

    await request(app).post("/api/products").set(bearer(token)).send({ name: "Latte" });

    const dup = await request(app)
      .post("/api/products")
      .set(bearer(token))
      .send({ name: "Latte" });
    assert.equal(dup.status, 409);
  });

  test("types management", async () => {
    const product = await request(app)
      .post("/api/products")
      .set(bearer(token))
      .send({ name: "Frappe" });
    const pid = product.body.data.id;

    const type = await request(app)
      .post(`/api/products/${pid}/types`)
      .set(bearer(token))
      .send({ name: "Regular" });
    assert.equal(type.status, 201);
    const typeId = type.body.data.id;

    const updated = await request(app)
      .put(`/api/products/${pid}/types/${typeId}`)
      .set(bearer(token))
      .send({ name: "Large" });
    assert.equal(updated.status, 200);

    const del = await request(app)
      .delete(`/api/products/${pid}/types/${typeId}`)
      .set(bearer(token));
    assert.equal(del.status, 200);
  });

  test("delete product", async () => {
    const product = await request(app)
      .post("/api/products")
      .set(bearer(token))
      .send({ name: "Cappuccino" });
    const pid = product.body.data.id;

    const res = await request(app).delete(`/api/products/${pid}`).set(bearer(token));
    assert.equal(res.status, 200);
  });
});