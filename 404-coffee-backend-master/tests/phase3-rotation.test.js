const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const {
  request,
  app,
  prisma,
  resetDb,
  seedOwner,
  seedUser,
  bearer,
} = require("./helpers");

const { jwtRefreshSecret } = require("../src/config/env");

// Helper: decode JWT payload without verification
const decodePayload = (token) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

// Helper: hash a refresh token (mirrors auth.service.js hashToken)
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

describe("Phase 3 — Refresh Token Rotation", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  // ================================================================
  // Scenario 1: Normal rotation
  // ================================================================
  test("1. Normal rotation — new tokens issued, DB hash updated", async () => {
    // Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    assert.equal(loginRes.status, 200);
    const originalRefresh = loginRes.body.data.auth.refresh_token;
    const originalAccess = loginRes.body.data.auth.access_token;
    const originalSessionId = decodePayload(originalRefresh).sessionId;

    // Verify DB state after login
    const sessionBefore = await prisma.authSession.findUnique({
      where: { id: originalSessionId },
    });
    assert.ok(sessionBefore, "Session exists after login");
    assert.equal(sessionBefore.refreshTokenHash, hashToken(originalRefresh));
    assert.equal(sessionBefore.revokedAt, null);

    // Call /auth/refresh
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: originalRefresh });
    assert.equal(refreshRes.status, 200);
    assert.equal(refreshRes.body.success, true);

    const newAccess = refreshRes.body.data.access_token;
    const newRefresh = refreshRes.body.data.refresh_token;

    // Tokens must be different from originals
    assert.notEqual(newRefresh, originalRefresh, "New refresh token differs");
    // Access tokens may be identical if signed in the same second (deterministic JWT),
    // so we only assert the refresh token changed — that's the security-critical one.

    // Same sessionId preserved
    const newPayload = decodePayload(newRefresh);
    assert.equal(newPayload.sessionId, originalSessionId, "Session ID preserved");

    // DB hash must be updated to match new refresh token
    const sessionAfter = await prisma.authSession.findUnique({
      where: { id: originalSessionId },
    });
    assert.equal(sessionAfter.refreshTokenHash, hashToken(newRefresh), "DB hash matches new refresh token");
    assert.equal(sessionAfter.revokedAt, null, "Session still active");

    console.log("  ✓ Scenario 1 PASSED: Normal rotation works correctly");
  });

  // ================================================================
  // Scenario 2: Reuse detection — old token rejected, session revoked
  // ================================================================
  test("2. Reuse detection — stale refresh token revokes session", async () => {
    // Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const originalRefresh = loginRes.body.data.auth.refresh_token;
    const sessionId = decodePayload(originalRefresh).sessionId;

    // Rotate once — get new tokens
    const rotateRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: originalRefresh });
    assert.equal(rotateRes.status, 200);
    const rotatedRefresh = rotateRes.body.data.refresh_token;

    // Now try to use the OLD (stale) refresh token
    const reuseRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: originalRefresh });
    assert.equal(reuseRes.status, 401);
    assert.equal(reuseRes.body.code, "SESSION_EXPIRED");

    // Session must now be revoked
    const session = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    assert.ok(session.revokedAt !== null, "Session revokedAt is set after reuse detection");

    console.log("  ✓ Scenario 2 PASSED: Reuse detection revokes session");
  });

  // ================================================================
  // Scenario 3: Post-theft lockout — even the legitimately rotated
  // token fails because the whole session was revoked
  // ================================================================
  test("3. Post-theft lockout — rotated token also fails after session revocation", async () => {
    // Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const originalRefresh = loginRes.body.data.auth.refresh_token;
    const sessionId = decodePayload(originalRefresh).sessionId;

    // Rotate once — get new tokens
    const rotateRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: originalRefresh });
    const rotatedRefresh = rotateRes.body.data.refresh_token;

    // Simulate theft: use the old token (triggers revocation)
    await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: originalRefresh });

    // Now try the legitimately rotated token — should also fail
    const lockoutRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: rotatedRefresh });
    assert.equal(lockoutRes.status, 401);
    assert.equal(lockoutRes.body.code, "SESSION_EXPIRED");

    // Session confirmed revoked
    const session = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    assert.ok(session.revokedAt !== null, "Session is fully revoked");

    console.log("  ✓ Scenario 3 PASSED: Rotated token fails after session revocation");
  });

  // ================================================================
  // Scenario 4: Manually revoked session — refresh rejected
  // ================================================================
  test("4. Manually revoked session — refresh rejected even if JWT valid", async () => {
    // Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const refreshToken = loginRes.body.data.auth.refresh_token;
    const sessionId = decodePayload(refreshToken).sessionId;

    // Manually revoke the session in DB
    await prisma.authSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    // Try to refresh — should fail
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });
    assert.equal(refreshRes.status, 401);
    assert.equal(refreshRes.body.code, "SESSION_EXPIRED");

    console.log("  ✓ Scenario 4 PASSED: Manually revoked session is rejected");
  });

  // ================================================================
  // Scenario 5: Device no longer approved — refresh rejected
  // ================================================================
  test("5. Device no longer approved — non-admin refresh rejected", async () => {
    // Create a CASHIER user
    const cashier = await seedUser({
      name: "Cashier",
      role: "CASHIER",
      password: "pass123",
    });

    // Create an APPROVED device for the cashier
    const device = await prisma.employeeDevice.create({
      data: {
        userId: cashier.id,
        name: "Test Device",
        deviceFingerprint: "fp-test-123",
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });

    // Login with device fingerprint to link session to device
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({
        name: "Cashier",
        password: "pass123",
        device: { fingerprint: "fp-test-123", name: "Test Device" },
      });
    assert.equal(loginRes.status, 200);
    const refreshToken = loginRes.body.data.auth.refresh_token;
    const sessionId = decodePayload(refreshToken).sessionId;

    // Verify session is linked to device
    const session = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    assert.equal(session.deviceId, device.id, "Session linked to device");

    // Block the device
    await prisma.employeeDevice.update({
      where: { id: device.id },
      data: { status: "BLOCKED" },
    });

    // Try to refresh — should fail because device is no longer APPROVED
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });
    assert.equal(refreshRes.status, 403);
    assert.equal(refreshRes.body.code, "DEVICE_BLOCKED");

    console.log("  ✓ Scenario 5 PASSED: Blocked device causes refresh rejection");
  });
});

describe("Phase 3 — Automated Rotation Tests", () => {
  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  test("Refresh returns valid token_type and expires_in", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const refreshToken = loginRes.body.data.auth.refresh_token;

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });
    assert.equal(refreshRes.status, 200);
    assert.equal(refreshRes.body.data.token_type, "Bearer");
    assert.ok(refreshRes.body.data.expires_in > 0);
    assert.ok(refreshRes.body.data.refresh_expires_in > 0);
  });

  test("Refresh with missing token → 400", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({});
    assert.equal(res.status, 400);
  });

  test("Refresh with invalid JWT → 401 SESSION_EXPIRED", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "not-a-real-jwt" });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "SESSION_EXPIRED");
  });

  test("Refresh with access token used as refresh → rejected", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const accessToken = loginRes.body.data.auth.access_token;

    // Try to use the access token as a refresh token
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: accessToken });
    // Should fail — either type check or session lookup
    assert.notEqual(res.status, 200);
  });

  test("Multiple sequential rotations work correctly", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    let currentRefresh = loginRes.body.data.auth.refresh_token;
    const sessionId = decodePayload(currentRefresh).sessionId;

    // Rotate 3 times
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken: currentRefresh });
      assert.equal(res.status, 200, `Rotation ${i + 1} succeeded`);
      currentRefresh = res.body.data.refresh_token;
    }

    // Final DB state: hash matches the last refresh token
    const session = await prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    assert.equal(session.refreshTokenHash, hashToken(currentRefresh));
    assert.equal(session.revokedAt, null);
  });

  test("Access token cannot be used as refresh token", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ name: "Admin", password: "root123" });
    const accessToken = loginRes.body.data.auth.access_token;

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: accessToken });
    assert.notEqual(res.status, 200);
  });
});
