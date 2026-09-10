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
  createSupplier,
  createCustomer,
} = require("./helpers");

describe("Sales (حسابات الفلوس + المخزون + الإلغاء)", () => {
  let token;
  let pid;
  let sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");

    const material = await createMaterial();

    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;

    await prisma.productSizeIngredient.create({
      data: { productSizeId: sizeId, rawMaterialId: material.id, quantity: 0.02, unit: "kg" },
    });
  });

  test("حسابات الفاتورة: subtotal = Σ(finalPrice*qty)، total = subtotal - discount", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({
        discount: 5,
        paymentMethod: "CASH",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 2 }],
      });

    assert.equal(res.status, 201);
    assert.equal(Number(res.body.data.subtotal), 70); // 35 * 2
    assert.equal(Number(res.body.data.total), 65); // 70 - 5
  });

  test("خصم أكبر من subtotal → 400", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({
        discount: 500,
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });

    assert.equal(res.status, 400);
  });

  test("بيع يخصم من الدفعات (المخزون)", async () => {
    await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({
        items: [{ productId: pid, productSizeId: sizeId, quantity: 2 }],
      });

    const batches = await prisma.rawMaterialBatch.findMany();
    assert.equal(Number(batches[0].quantity), 50 - 0.04); // 50 - (0.02 * 2)
  });

  test("مخزون غير كافٍ → 400", async () => {
    const res = await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({
        items: [{ productId: pid, productSizeId: sizeId, quantity: 500000 }],
      });

    assert.equal(res.status, 400);
  });

  test("product size مش مع product → 404", async () => {
    const other = await prisma.product.create({ data: { name: "Other" } });
    const res = await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({
        items: [{ productId: other.id, productSizeId: sizeId, quantity: 1 }],
      });

    assert.equal(res.status, 404);
  });

  test("إلغاء فاتورة + قائمة بفلترة/بحث paginated", async () => {
    const customer = await createCustomer();
    const created = await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({
        customerId: customer.id,
        status: "COMPLETED",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    const saleId = created.body.data.id;

    // بحث باسم العميل
    const search = await request(app)
      .get("/api/sales?search=Omar&pageSize=5")
      .set(bearer(token));
    assert.equal(search.status, 200);
    assert.equal(search.body.data.length, 1);

    const cancelled = await request(app)
      .delete(`/api/sales/${saleId}`)
      .set(bearer(token));
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, "CANCELLED");
  });
});

describe("Purchases (Draft → Approve يضيف دفعات)", () => {
  let token;
  let supplierId;
  let materialId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");

    const supplier = await createSupplier();
    supplierId = supplier.id;
    const material = await createMaterial();
    materialId = material.id;
  });

  test("إنشاء ثم اعتماد يضيف API دفعة جوه المخزون", async () => {
    const created = await request(app)
      .post("/api/purchases")
      .set(bearer(token))
      .send({
        invoiceNo: "INV-1001",
        supplierId,
        invoiceDate: "2026-08-16",
        discount: 0,
        total: 1800,
        finalTotal: 1800,
        items: [
          { rawMaterialId: materialId, quantity: 10, unit: "kg", pricePerUnit: 180, totalPrice: 1800 },
        ],
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, "DRAFT");

    const approve = await request(app)
      .patch(`/api/purchases/${created.body.data.id}/approve`)
      .set(bearer(token));
    assert.equal(approve.status, 200);
    assert.equal(approve.body.data.status, "APPROVED");

    const batches = await prisma.rawMaterialBatch.findMany();
    const approvedBatch = batches.find((b) => Number(b.quantity) === 10);
    assert.ok(approvedBatch, "مفروض تظهر دفعة جديدة من المشروع المعتمد");
    assert.equal(Number(approvedBatch.quantity), 10);
    assert.equal(Number(approvedBatch.pricePerUnit), 180);
  });

  test("اعتماد مشروع مرفوض (مش DRAFT) → 400", async () => {
    const created = await request(app)
      .post("/api/purchases")
      .set(bearer(token))
      .send({
        invoiceNo: "INV-1002",
        supplierId,
        invoiceDate: "2026-08-16",
        items: [
          { rawMaterialId: materialId, quantity: 5, unit: "kg", pricePerUnit: 200, totalPrice: 1000 },
        ],
      });

    await request(app)
      .patch(`/api/purchases/${created.body.data.id}/approve`)
      .set(bearer(token));

    const again = await request(app)
      .patch(`/api/purchases/${created.body.data.id}/approve`)
      .set(bearer(token));
    assert.equal(again.status, 400);
  });

  test("إلغاء مشروع + حذف", async () => {
    const created = await request(app)
      .post("/api/purchases")
      .set(bearer(token))
      .send({
        invoiceNo: "INV-1003",
        supplierId,
        invoiceDate: "2026-08-16",
        items: [
          { rawMaterialId: materialId, quantity: 5, unit: "kg", pricePerUnit: 200, totalPrice: 1000 },
        ],
      });
    const id = created.body.data.id;

    const cancelled = await request(app)
      .patch(`/api/purchases/${id}/cancel`)
      .set(bearer(token));
    assert.equal(cancelled.status, 200);

    const del = await request(app).delete(`/api/purchases/${id}`).set(bearer(token));
    assert.equal(del.status, 200);
  });

  test("بدون invoiceNo/supplierId → 400", async () => {
    const res = await request(app)
      .post("/api/purchases")
      .set(bearer(token))
      .send({ items: [] });

    assert.equal(res.status, 400);
  });
});

describe("Returns (Draft → Approve → Cancel)", () => {
  let token;
  let supplierId;
  let materialId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");

    const supplier = await createSupplier();
    supplierId = supplier.id;
    const material = await createMaterial();
    materialId = material.id;
  });

  test("دورة حياة مرتجع كاملة", async () => {
    const created = await request(app)
      .post("/api/returns")
      .set(bearer(token))
      .send({
        supplierId,
        returnNo: "RET-1",
        items: [
          { rawMaterialId: materialId, quantity: 3, unit: "kg", pricePerUnit: 200, totalPrice: 600 },
        ],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;

    const approve = await request(app)
      .patch(`/api/returns/${id}/approve`)
      .set(bearer(token));
    assert.equal(approve.status, 200);
    assert.equal(approve.body.data.status, "APPROVED");

    const cancel = await request(app)
      .patch(`/api/returns/${id}/cancel`)
      .set(bearer(token));
    assert.equal(cancel.status, 400); // approved مينفعش يتلغى

    const del = await request(app).delete(`/api/returns/${id}`).set(bearer(token));
    assert.equal(del.status, 400); // approved مينفعش يتحدف
  });

  test("مرتجع DRAFT بيتلغى ويتحدف", async () => {
    const created = await request(app)
      .post("/api/returns")
      .set(bearer(token))
      .send({
        supplierId,
        returnNo: "RET-2",
        items: [
          { rawMaterialId: materialId, quantity: 3, unit: "kg", pricePerUnit: 200, totalPrice: 600 },
        ],
      });
    const id = created.body.data.id;

    const cancel = await request(app).patch(`/api/returns/${id}/cancel`).set(bearer(token));
    assert.equal(cancel.status, 200);
  });
});

describe("Orders", () => {
  let token;
  let pid;
  let sizeId;

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
    token = await loginToken("Admin");

    const { product, size } = await createProductWithSize();
    pid = product.id;
    sizeId = size.id;
  });

  test("دورة حياة طلب (create → update status → delete)", async () => {
    const created = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({
        orderType: "tables",
        table: "T1",
        paymentMethod: "CASH",
        items: [{ productId: pid, productSizeId: sizeId, quantity: 2 }],
      });
    assert.equal(created.status, 201);
    const id = created.body.data.id;
    assert.equal(Number(created.body.data.total), 70);

    const updated = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set(bearer(token))
      .send({ status: "PREPARING" });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.order.status, "PREPARING");

    const list = await request(app).get("/api/orders").set(bearer(token));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);

    const cancel = await request(app)
      .post(`/api/orders/${id}/cancel`)
      .set(bearer(token))
      .send({ reason: "Test cancel" });
    assert.equal(cancel.status, 200);

    const del = await request(app).delete(`/api/orders/${id}`).set(bearer(token));
    assert.equal(del.status, 200);
  });

  test("بدون items → 400", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set(bearer(token))
      .send({ orderType: "DINE_IN" });

    assert.equal(res.status, 400);
  });
});