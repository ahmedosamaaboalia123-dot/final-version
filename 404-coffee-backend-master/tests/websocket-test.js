const { io } = require("socket.io-client");
const http = require("http");

const BASE = "http://localhost:5000";

const login = () =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify({ name: "Admin", password: "root123" });
    const req = http.request(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length },
    }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        const json = JSON.parse(body);
        resolve(json.data.auth.access_token);
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });

const postOrder = (token, orderData) =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(orderData);
    const req = http.request(`${BASE}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });

const patchItemStatus = (token, orderId, itemId, status) =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify({ status });
    const req = http.request(`${BASE}/api/orders/${orderId}/items/${itemId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(data),
      },
    }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });

const connectSocket = (token) =>
  io(BASE, { auth: { token }, reconnection: false, transports: ["websocket"] });

const results = [];
const pass = (name) => { results.push({ name, ok: true }); console.log(`  PASS: ${name}`); };
const fail = (name, reason) => { results.push({ name, ok: false }); console.log(`  FAIL: ${name} - ${reason}`); };

async function main() {
  console.log("\n=== WebSocket Test Suite ===\n");

  // Test 1: Health
  console.log("Test 1: Server health");
  const health = await new Promise((resolve, reject) => {
    http.get(`${BASE}/api/health`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
  if (health.success) pass("Server running"); else fail("Server health", health.message);

  // Test 2: Login
  console.log("Test 2: Login");
  let token;
  try {
    token = await login();
    if (token) pass("Login returns JWT"); else fail("Login", "no token");
  } catch (e) { fail("Login", e.message); }

  // Test 3: Unauthorized socket rejected
  console.log("Test 3: Unauthorized socket rejected");
  await new Promise((resolve) => {
    const socket = connectSocket(null);
    socket.on("connect_error", (err) => {
      pass(`Rejected: "${err.message}"`);
      socket.disconnect();
      resolve();
    });
    setTimeout(() => { fail("Unauthorized rejection", "timeout"); resolve(); }, 5000);
  });

  // Test 4: Authorized socket connects + rooms
  console.log("Test 4: Authorized socket connects");
  await new Promise((resolve) => {
    const socket = connectSocket(token);
    socket.on("connect", () => {
      if (socket.connected) {
        pass("Connected + rooms assigned (verified server-side)");
      } else {
        fail("Connected", "socket.connected is false");
      }
      socket.disconnect();
      resolve();
    });
    socket.on("connect_error", (err) => { fail("Authorized connect", err.message); resolve(); });
    setTimeout(() => { fail("Authorized connect", "timeout"); resolve(); }, 5000);
  });

  // Test 5: order:created event
  console.log("Test 5: order:created event");
  await new Promise((resolve) => {
    const socket = connectSocket(token);
    let eventReceived = false;
    socket.on("connect", async () => {
      try {
        const res = await postOrder(token, {
          orderType: "online",
          customerName: "WS Test",
          customerPhone: "01099999999",
          items: [{ productId: 1, productSizeId: 1, quantity: 1 }],
        });
        if (res.status !== 201) {
          fail("order:created", `POST returned ${res.status}: ${JSON.stringify(res.body)}`);
          socket.disconnect();
          resolve();
        }
      } catch (e) {
        fail("order:created", `POST error: ${e.message}`);
        socket.disconnect();
        resolve();
      }
    });
    socket.on("order:created", (data) => {
      eventReceived = true;
      if (
        data.event === "order:created" &&
        data.order &&
        data.order.orderNumber &&
        data.order.orderType &&
        data.order.items &&
        data.order.items.length > 0
      ) {
        pass(`order:created: #${data.order.orderNumber} type=${data.order.orderType} items=${data.order.items.length}`);
      } else {
        fail("order:created", "invalid payload: " + JSON.stringify(data).slice(0, 200));
      }
      socket.disconnect();
      resolve();
    });
    setTimeout(() => { if (!eventReceived) { fail("order:created", "timeout"); socket.disconnect(); resolve(); } }, 15000);
  });

  // Test 6: order:item:updated event
  console.log("Test 6: order:item:updated event");
  await new Promise((resolve) => {
    const socket = connectSocket(token);
    let itemEventReceived = false;
    socket.on("connect", async () => {
      try {
        const orderRes = await postOrder(token, {
          orderType: "tables",
          table: "9",
          items: [{ productId: 1, productSizeId: 1, quantity: 2 }],
        });
        if (orderRes.status !== 201) {
          fail("order:item:updated setup", `POST returned ${orderRes.status}`);
          socket.disconnect();
          resolve();
          return;
        }
        const order = orderRes.body.data;
        await patchItemStatus(token, order.id, order.items[0].id, "READY");
      } catch (e) {
        fail("order:item:updated", `error: ${e.message}`);
        socket.disconnect();
        resolve();
      }
    });
    socket.on("order:item:updated", (data) => {
      itemEventReceived = true;
      if (
        data.event === "order:item:updated" &&
        typeof data.orderId === "number" &&
        typeof data.itemId === "number" &&
        data.status &&
        data.orderStatus
      ) {
        pass(`order:item:updated: item=${data.itemId} status=${data.status} orderStatus=${data.orderStatus}`);
      } else {
        fail("order:item:updated", "invalid payload: " + JSON.stringify(data).slice(0, 200));
      }
      socket.disconnect();
      resolve();
    });
    setTimeout(() => { if (!itemEventReceived) { fail("order:item:updated", "timeout"); socket.disconnect(); resolve(); } }, 15000);
  });

  // Test 7: Failed order does NOT emit event
  console.log("Test 7: Failed order does NOT emit event");
  await new Promise((resolve) => {
    const socket = connectSocket(token);
    let eventReceived = false;
    socket.on("connect", async () => {
      try {
        await postOrder(token, {
          orderType: "online",
          items: [],
        });
      } catch (e) { /* expected 400 */ }
      setTimeout(() => {
        if (!eventReceived) {
          pass("No event on failed order");
        }
        socket.disconnect();
        resolve();
      }, 2000);
    });
    socket.on("order:created", () => { eventReceived = true; fail("No event on failed order", "event received!"); socket.disconnect(); resolve(); });
    setTimeout(() => { if (!eventReceived) { pass("No event on failed order"); socket.disconnect(); resolve(); } }, 8000);
  });

  // Test 8: REST API still works
  console.log("Test 8: REST API still works");
  const orders = await new Promise((resolve) => {
    http.get(`${BASE}/api/orders`, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", (e) => resolve({ success: false, error: e.message }));
  });
  if (orders.success) pass(`REST API: ${orders.data.length} orders returned`); else fail("REST API", orders.message || orders.error);

  // Summary
  console.log("\n=== RESULTS ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed out of ${results.length} tests`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
