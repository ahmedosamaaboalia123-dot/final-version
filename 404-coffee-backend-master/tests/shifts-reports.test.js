const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  request,
  app,
  prisma,
  resetDb,
  seedOwner,
  loginToken,
  bearer,
  createMaterial,
  createProductWithSize,
} = require("./helpers");

describe("Cash Drawer Shifts", () => {
  let token;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
  });

  test("فتح وردية → إيداع/سحب → إغلاق بحسابات سليمة", async () => {
    const opened = await request(app)
      .post("/api/cash-drawer-shifts")
      .set(bearer(token))
      .send({ openingBalance: 500 });
    assert.equal(opened.status, 201);
    const id = opened.body.data.id;

    const current = await request(app)
      .get("/api/cash-drawer-shifts/current")
      .set(bearer(token));
    assert.equal(current.status, 200);
    assert.equal(current.body.data.id, id);

    const cashIn = await request(app)
      .post(`/api/cash-drawer-shifts/${id}/cash-in`)
      .set(bearer(token))
      .send({ amount: 300, type: "COLLECTION" });
    assert.equal(cashIn.status, 201);

    const cashOut = await request(app)
      .post(`/api/cash-drawer-shifts/${id}/cash-out`)
      .set(bearer(token))
      .send({ amount: 100, type: "EXPENSE" });
    assert.equal(cashOut.status, 201);

    const closed = await request(app)
      .post(`/api/cash-drawer-shifts/${id}/close`)
      .set(bearer(token))
      .send({ closingBalance: 700, actualBalance: 700 });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.data.status, "CLOSED");
    assert.equal(Number(closed.body.data.difference), 0);
  });

  test("مفيش ورديتين مفتوحتين مع بعض → 400", async () => {
    await request(app)
      .post("/api/cash-drawer-shifts")
      .set(bearer(token))
      .send({ openingBalance: 100 });

    const second = await request(app)
      .post("/api/cash-drawer-shifts")
      .set(bearer(token))
      .send({ openingBalance: 200 });

    assert.equal(second.status, 400);
  });

  test("cash-in بنوع غير صالح → 400", async () => {
    const opened = await request(app)
      .post("/api/cash-drawer-shifts")
      .set(bearer(token))
      .send({ openingBalance: 100 });
    const id = opened.body.data.id;

    const bad = await request(app)
      .post(`/api/cash-drawer-shifts/${id}/cash-in`)
      .set(bearer(token))
      .send({ amount: 50, type: "EXPENSE" });

    assert.equal(bad.status, 400);
  });

  test("عمليات على وردية مقفولة → 400", async () => {
    const opened = await request(app)
      .post("/api/cash-drawer-shifts")
      .set(bearer(token))
      .send({ openingBalance: 100 });
    const id = opened.body.data.id;

    await request(app)
      .post(`/api/cash-drawer-shifts/${id}/close`)
      .set(bearer(token))
      .send({ closingBalance: 100, actualBalance: 100 });

    const cashIn = await request(app)
      .post(`/api/cash-drawer-shifts/${id}/cash-in`)
      .set(bearer(token))
      .send({ amount: 50, type: "COLLECTION" });

    assert.equal(cashIn.status, 400);
  });
});

describe("Dashboard / Reports / Warnings / Audit / Settings", () => {
  let token;
  let pid;
  let sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");

    const material = await createMaterial();
    await prisma.rawMaterialBatch.create({
      data: { rawMaterialId: material.id, quantity: 50, pricePerUnit: 200 },
    });
    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
    await prisma.productSizeIngredient.create({
      data: { productSizeId: size.id, rawMaterialId: material.id, quantity: 0.02, unit: "kg" },
    });
  });

  test("dashboard summary بعد صفقة", async () => {
    await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({ discount: 0, items: [{ productId: pid, productSizeId: sizeId, quantity: 2 }] });

    const res = await request(app).get("/api/dashboard").set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.summary.todaySales.count, 1);
    assert.equal(Number(res.body.data.summary.todaySales.total), 70);
  });

  test("financial reports: sales + profit + treasury", async () => {
    await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({ items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }] });

    const sales = await request(app)
      .get("/api/financial-reports/sales")
      .set(bearer(token));
    assert.equal(sales.status, 200);

    const profit = await request(app)
      .get("/api/financial-reports/profit")
      .set(bearer(token));
    assert.equal(profit.status, 200);

    const treasury = await request(app)
      .get("/api/financial-reports/treasury")
      .set(bearer(token));
    assert.equal(treasury.status, 200);
  });

  test("warnings بيرجع المواد تحت الحد الأدنى", async () => {
    await prisma.rawMaterial.create({
      data: { name: "Sugar", unit: "kg", supplier: "S", minStockAlert: 10 },
    });

    const res = await request(app).get("/api/warnings").set(bearer(token));

    assert.equal(res.status, 200);
    const lowStock = res.body.data.lowStock || res.body.data;
    assert.ok(Array.isArray(lowStock));
  });

  test("audit logs مسجل عليها الدخول والعمليات", async () => {
    await request(app)
      .post("/api/suppliers")
      .set(bearer(token))
      .send({
        name: "Vendor",
        contactPerson: "X",
        phone: "0101234567",
        city: "Cairo",
        supplierType: "x",
        supplierCategory: "y",
      });

    const res = await request(app)
      .get("/api/audit-logs?pageSize=10")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 2); // login + create supplier
    assert.ok(res.body.pagination);
  });

  test("settings: view + update single + bulk", async () => {
    const list = await request(app).get("/api/settings").set(bearer(token));
    assert.equal(list.status, 200);

    const single = await request(app)
      .put("/api/settings/shop_name")
      .set(bearer(token))
      .send({ value: "404 Coffee Cairo" });
    assert.equal(single.status, 200);
    assert.equal(single.body.data.value, "404 Coffee Cairo");

    const bulk = await request(app)
      .post("/api/settings/bulk")
      .set(bearer(token))
      .send({ settings: [{ key: "currency", value: "USD" }] });
    assert.equal(bulk.status, 200);
  });
});

describe("Health + Pagination", () => {
  let token;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");
  });

  test("health endpoints ترد صح", async () => {
    const h1 = await request(app).get("/api/health");
    assert.equal(h1.status, 200);
    assert.equal(h1.body.success, true);

    const h2 = await request(app).get("/api/health/live");
    assert.equal(h2.status, 200);

    const h3 = await request(app).get("/api/health/ready");
    assert.equal(h3.status, 200);
  });

  test("صفحات متتالية ما بتكررش البيانات", async () => {
    for (let i = 0; i < 5; i += 1) {
      await prisma.customer.create({
        data: { name: `C${i}`, phone: `01${i}0000000` },
      });
    }

    const p1 = await request(app)
      .get("/api/customers?page=1&pageSize=2")
      .set(bearer(token));
    const p2 = await request(app)
      .get("/api/customers?page=2&pageSize=2")
      .set(bearer(token));
    const p3 = await request(app)
      .get("/api/customers?page=3&pageSize=2")
      .set(bearer(token));

    assert.equal(p1.body.pagination.total, 5);
    assert.equal(p1.body.pagination.totalPages, 3);
    assert.equal(p1.body.data.length, 2);
    assert.equal(p2.body.data.length, 2);
    assert.equal(p3.body.data.length, 1);

    const ids = [...p1.body.data, ...p2.body.data, ...p3.body.data].map((c) => c.id);
    assert.equal(new Set(ids).size, 5); // no duplicates
  });

  test("pageSize يتوقف عند الحد الأقصى 100", async () => {
    const res = await request(app)
      .get("/api/customers?pageSize=9999")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.pagination.pageSize, 100);
  });
});