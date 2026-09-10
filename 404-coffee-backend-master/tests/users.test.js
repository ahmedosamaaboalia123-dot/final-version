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

let token;

describe("Users CRUD (RBAC + حماية الـ Owner)", () => {
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

  const createUserPayload = (overrides = {}) => ({
    name: overrides.name || "Sara",
    password: overrides.password || "123456",
    position: overrides.position || "CASHIER",
    role: overrides.role || "CASHIER",
  });

  test("إنشاء مستخدم بدور → 201", async () => {
    const res = await request(app)
      .post("/api/users")
      .set(bearer(token))
      .send(createUserPayload());

    assert.equal(res.status, 201);
    assert.equal(res.body.data.role.name, "CASHIER");
  });

  test("دور غير صالح → 400", async () => {
    const res = await request(app)
      .post("/api/users")
      .set(bearer(token))
      .send(createUserPayload({ role: "SUPER_ADMIN" }));

    assert.equal(res.status, 400);
  });

  test("إنشاء مستخدم بنفس الاسم → 409", async () => {
    await request(app).post("/api/users").set(bearer(token)).send(createUserPayload());

    const res = await request(app)
      .post("/api/users")
      .set(bearer(token))
      .send(createUserPayload());

    assert.equal(res.status, 409);
  });

  test("MANAGER ممنوع من إنشاء OWNER → 403", async () => {
    await seedUser({ name: "Mgr", role: "MANAGER" });
    const mgrToken = await loginToken("Mgr", "pass123");

    const res = await request(app)
      .post("/api/users")
      .set(bearer(mgrToken))
      .send(createUserPayload({ role: "OWNER" }));

    assert.equal(res.status, 403);
  });

  test("تعديل مستخدم (اسم/باسورد/دور)", async () => {
    const created = await request(app)
      .post("/api/users")
      .set(bearer(token))
      .send(createUserPayload({ name: "Sara" }));

    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set(bearer(token))
      .send({ name: "Sara Updated", role: "MANAGER" });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, "Sara Updated");
    assert.equal(res.body.data.role.name, "MANAGER");
  });

  test("ممنوع تغيير دورك لنفسك → 400", async () => {
    const owner = await prisma.user.findFirst({ where: { name: "Admin" } });

    const res = await request(app)
      .put(`/api/users/${owner.id}`)
      .set(bearer(token))
      .send({ role: "CASHIER" });

    assert.equal(res.status, 400);
  });

  test("ممنوع حذف نفسك → 400", async () => {
    const owner = await prisma.user.findFirst({ where: { name: "Admin" } });

    const res = await request(app).delete(`/api/users/${owner.id}`).set(bearer(token));

    assert.equal(res.status, 400);
  });

  test("ممنوع تعليق آخر OWNER → 400", async () => {
    const owner = await prisma.user.findFirst({ where: { name: "Admin" } });

    const res = await request(app)
      .patch(`/api/users/${owner.id}/status`)
      .set(bearer(token))
      .send({ status: "SUSPENDED" });

    assert.equal(res.status, 400);
  });

  test("Owners إضافية تسمح بحذف آخر واحد بس بمينعش", async () => {
    const second = await seedUser({ name: "Owner2", role: "OWNER" });

    const res = await request(app)
      .delete(`/api/users/${second.id}`)
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.ok(
      await prisma.user.findFirst({ where: { name: "Admin", role: "OWNER" } }),
      "آخر OWNER لازم يفضل موجود"
    );
  });

  test("حذف مستخدم عادي + تعليقه → 200", async () => {
    const created = await request(app)
      .post("/api/users")
      .set(bearer(token))
      .send(createUserPayload({ name: "Sara" }));

    const id = created.body.data.id;

    const suspend = await request(app)
      .patch(`/api/users/${id}/status`)
      .set(bearer(token))
      .send({ status: "SUSPENDED" });
    assert.equal(suspend.status, 200);
    assert.equal(suspend.body.data.status, "SUSPENDED");

    const del = await request(app).delete(`/api/users/${id}`).set(bearer(token));
    assert.equal(del.status, 200);
  });

  test("قائمة المستخدمين paginated", async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedUser({ name: `User${i}` });
    }

    const res = await request(app)
      .get("/api/users?page=1&pageSize=3")
      .set(bearer(token));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 3);
    assert.equal(res.body.pagination.total, 6); // 5 + Admin
    assert.equal(res.body.pagination.totalPages, 2);
  });
});