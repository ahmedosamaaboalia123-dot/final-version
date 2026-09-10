const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  request,
  app,
  prisma,
  resetDb,
  seedOwner,
  seedUser,
  loginToken,
  bearer,
} = require("./helpers");

describe("Auth", () => {
  before(resetDb);
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  test("login ينجح ويعيد token + user مع role", async () => {
    const res = await request(app).post("/api/auth/login").send({
      name: "Admin",
      password: "root123",
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.auth.access_token);
    assert.equal(res.body.data.role.name, "Owner");
    assert.equal(res.body.data.employee.name, "Admin");
  });

  test("login بباسورد غلط → 401", async () => {
    const res = await request(app).post("/api/auth/login").send({
      name: "Admin",
      password: "wrong",
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test("login لمستخدم موقوف → 403", async () => {
    await seedUser({ name: "Blocked", status: "SUSPENDED" });

    const res = await request(app).post("/api/auth/login").send({
      name: "Blocked",
      password: "pass123",
    });

    assert.equal(res.status, 403);
  });

  test("login بدون name/password → 400", async () => {
    const res = await request(app).post("/api/auth/login").send({});

    assert.equal(res.status, 400);
  });

  test("الوصول لحماية بدون توكن → 401", async () => {
    const res = await request(app).get("/api/users");

    assert.equal(res.status, 401);
  });

  test("توكن غير صالح → 401", async () => {
    const res = await request(app)
      .get("/api/users")
      .set(bearer("not-a-real-token"));

    assert.equal(res.status, 401);
  });

  test("health عام بدون توكن", async () => {
    const res = await request(app).get("/api/health");

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe("RBAC permissions", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  test("CASHIER يقدر يعمل sale لكن ممنوع عن users", async () => {
    await seedUser({ name: "Cashier", role: "CASHIER" });
    const token = await loginToken("Cashier", "pass123");

    const saleRes = await request(app)
      .post("/api/sales")
      .set(bearer(token))
      .send({
        discount: 0,
        paymentMethod: "CASH",
        items: [
          { productId: 999, productSizeId: 999, quantity: 1 },
        ],
      });

    // وصل للـ service (المُنتج مش موجود فخطأ 404/400 — المهم مش 403)
    assert.notEqual(saleRes.status, 403);

    const usersRes = await request(app)
      .get("/api/users")
      .set(bearer(token));
    assert.equal(usersRes.status, 403);
  });

  test("DELEGATE ممنوع عن customers/materials", async () => {
    await seedUser({ name: "Dele", role: "DELEGATE" });
    const token = await loginToken("Dele", "pass123");

    const ordersRes = await request(app)
      .get("/api/orders")
      .set(bearer(token));
    assert.equal(ordersRes.status, 200);

    const customersRes = await request(app)
      .get("/api/customers")
      .set(bearer(token));
    assert.equal(customersRes.status, 403);

    const materialsRes = await request(app)
      .get("/api/raw-materials")
      .set(bearer(token));
    assert.equal(materialsRes.status, 403);
  });

  test("OWNER يقدر يوصل صفحاته المسموحة", async () => {
    const token = await loginToken("Admin");

    const res = await request(app)
      .get("/api/users")
      .set(bearer(token));

    assert.equal(res.status, 200);
  });

  test("GET /api/users/:id/permissions يرجع صلاحيات الدور الفعلية", async () => {
    const token = await loginToken("Admin");
    const { id } = await prisma.user.findFirst({ where: { name: "Admin" } });

    const res = await request(app)
      .get(`/api/users/${id}/permissions`)
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(res.body.data.permissions.users);
    assert.ok(res.body.data.permissions.backup);
  });
});