const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  request,
  app,
  prisma,
  resetDb,
  seedOwner,
  seedUser,
  bearer,
} = require("./helpers");

const decodePayload = (token) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

// ================================================================
// Phase 4: Auth Middleware Session Enforcement
// ================================================================
describe("Phase 4 — Middleware session enforcement on protected endpoints", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  test("1. Revoked session blocks access token on protected endpoint", async () => {
    // Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    assert.equal(loginRes.status, 200);
    const accessToken = loginRes.body.data.auth.access_token;
    const sessionId = decodePayload(accessToken).sessionId;

    // Verify protected endpoint works with valid session
    const okRes = await request(app)
      .get("/api/users")
      .set(bearer(accessToken));
    assert.equal(okRes.status, 200, "Protected endpoint works before revocation");

    // Manually revoke the session in DB
    await prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    // Same access token should now fail — middleware checks session
    const revokedRes = await request(app)
      .get("/api/users")
      .set(bearer(accessToken));
    assert.equal(revokedRes.status, 401);
    assert.equal(revokedRes.body.code, "SESSION_EXPIRED");
  });

  test("2. Deleted session (non-existent) blocks access token", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const accessToken = loginRes.body.data.auth.access_token;
    const sessionId = decodePayload(accessToken).sessionId;

    // Delete the session from DB
    await prisma.authSession.delete({ where: { id: sessionId } });

    // Access token should fail
    const res = await request(app)
      .get("/api/users")
      .set(bearer(accessToken));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "SESSION_EXPIRED");
  });

  test("3. Blocked device blocks non-admin access token on protected endpoint", async () => {
    // Create CASHIER user
    await seedUser({ name: "Cashier", role: "CASHIER" });

    // Create and approve a device for the cashier
    const cashier = await prisma.user.findFirst({ where: { name: "Cashier" } });
    const device = await prisma.employeeDevice.create({
      data: {
        userId: cashier.id,
        name: "Test Device",
        deviceFingerprint: "fp-middleware-test",
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    // Login as cashier with the device
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({
        name: "Cashier",
        password: "pass123",
        device: { fingerprint: "fp-middleware-test", name: "Test Device" },
      });
    assert.equal(loginRes.status, 200);
    const accessToken = loginRes.body.data.auth.access_token;

    // Verify protected endpoint works before block
    const saleRes = await request(app)
      .post("/api/sales")
      .set(bearer(accessToken))
      .send({ discount: 0, paymentMethod: "CASH", items: [{ productId: 999, productSizeId: 999, quantity: 1 }] });
    assert.notEqual(saleRes.status, 403, "Not 403 before device block");

    // Block the device
    await prisma.employeeDevice.update({
      where: { id: device.id },
      data: { status: "BLOCKED" },
    });

    // Same access token should now fail with DEVICE_BLOCKED
    const blockedRes = await request(app)
      .post("/api/sales")
      .set(bearer(accessToken))
      .send({ discount: 0, paymentMethod: "CASH", items: [{ productId: 999, productSizeId: 999, quantity: 1 }] });
    assert.equal(blockedRes.status, 403);
    assert.equal(blockedRes.body.code, "DEVICE_BLOCKED");
  });

  test("4. Admin/Manager tokens are exempt from device check", async () => {
    // Login as Admin (OWNER role — exempt from device check)
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const accessToken = loginRes.body.data.auth.access_token;

    // Verify protected endpoint works (no device linked to admin session)
    const res = await request(app)
      .get("/api/users")
      .set(bearer(accessToken));
    assert.equal(res.status, 200, "Admin access works without device");
  });
});

// ================================================================
// Phase 5: Real Logout Revocation
// ================================================================
describe("Phase 5 — Real logout revocation", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  test("1. Instant logout enforcement: logout → same access token fails", async () => {
    // Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    assert.equal(loginRes.status, 200);
    const accessToken = loginRes.body.data.auth.access_token;
    const refreshToken = loginRes.body.data.auth.refresh_token;
    const sessionId = decodePayload(accessToken).sessionId;

    // Verify protected endpoint works
    const okRes = await request(app)
      .get("/api/users")
      .set(bearer(accessToken));
    assert.equal(okRes.status, 200);

    // Logout
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set(bearer(accessToken))
      .send({ refreshToken });
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutRes.body.success, true);

    // Session should be revoked in DB
    const session = await prisma.authSession.findUnique({ where: { id: sessionId } });
    assert.ok(session.revokedAt !== null, "Session revokedAt is set after logout");

    // Same access token should now fail on protected endpoint
    const afterLogout = await request(app)
      .get("/api/users")
      .set(bearer(accessToken));
    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.body.code, "SESSION_EXPIRED");
  });

  test("2. Logout-all revokes ALL sessions for the employee", async () => {
    // Login twice (simulating 2 devices/sessions)
    const login1 = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    assert.equal(login1.status, 200);
    const token1 = login1.body.data.auth.access_token;
    const session1Id = decodePayload(token1).sessionId;

    const login2 = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    assert.equal(login2.status, 200);
    const token2 = login2.body.data.auth.access_token;
    const session2Id = decodePayload(token2).sessionId;

    // Both sessions should be active
    assert.notEqual(session1Id, session2Id, "Different session IDs");

    // Verify both tokens work
    const ok1 = await request(app).get("/api/users").set(bearer(token1));
    const ok2 = await request(app).get("/api/users").set(bearer(token2));
    assert.equal(ok1.status, 200, "Session 1 works before logout-all");
    assert.equal(ok2.status, 200, "Session 2 works before logout-all");

    // Call logout-all with session 1's token
    const logoutAllRes = await request(app)
      .post("/api/auth/logout-all")
      .set(bearer(token1));
    assert.equal(logoutAllRes.status, 200);

    // Both sessions should now be revoked
    const s1 = await prisma.authSession.findUnique({ where: { id: session1Id } });
    const s2 = await prisma.authSession.findUnique({ where: { id: session2Id } });
    assert.ok(s1.revokedAt !== null, "Session 1 revoked");
    assert.ok(s2.revokedAt !== null, "Session 2 revoked");

    // Both tokens should fail
    const fail1 = await request(app).get("/api/users").set(bearer(token1));
    const fail2 = await request(app).get("/api/users").set(bearer(token2));
    assert.equal(fail1.status, 401, "Session 1 token fails after logout-all");
    assert.equal(fail1.body.code, "SESSION_EXPIRED");
    assert.equal(fail2.status, 401, "Session 2 token fails after logout-all");
    assert.equal(fail2.body.code, "SESSION_EXPIRED");
  });

  test("3. Single logout doesn't affect other sessions", async () => {
    // Login twice
    const login1 = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const token1 = login1.body.data.auth.access_token;
    const session1Id = decodePayload(token1).sessionId;

    const login2 = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const token2 = login2.body.data.auth.access_token;
    const session2Id = decodePayload(token2).sessionId;

    // Logout session 1 only
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set(bearer(token1))
      .send({ refreshToken: login1.body.data.auth.refresh_token });
    assert.equal(logoutRes.status, 200);

    // Session 1 should be revoked
    const s1 = await prisma.authSession.findUnique({ where: { id: session1Id } });
    assert.ok(s1.revokedAt !== null, "Session 1 revoked");

    // Session 2 should still be active
    const s2 = await prisma.authSession.findUnique({ where: { id: session2Id } });
    assert.equal(s2.revokedAt, null, "Session 2 still active");

    // Session 1 token should fail
    const fail1 = await request(app).get("/api/users").set(bearer(token1));
    assert.equal(fail1.status, 401, "Session 1 fails");

    // Session 2 token should still work
    const ok2 = await request(app).get("/api/users").set(bearer(token2));
    assert.equal(ok2.status, 200, "Session 2 still works");
  });

  test("4. Logout-all on second session also revokes first", async () => {
    // Login twice
    const login1 = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const token1 = login1.body.data.auth.access_token;
    const session1Id = decodePayload(token1).sessionId;

    const login2 = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const token2 = login2.body.data.auth.access_token;
    const session2Id = decodePayload(token2).sessionId;

    // Logout-all using session 2's token
    const logoutAllRes = await request(app)
      .post("/api/auth/logout-all")
      .set(bearer(token2));
    assert.equal(logoutAllRes.status, 200);

    // Both sessions revoked
    const fail1 = await request(app).get("/api/users").set(bearer(token1));
    const fail2 = await request(app).get("/api/users").set(bearer(token2));
    assert.equal(fail1.status, 401);
    assert.equal(fail2.status, 401);
  });
});
