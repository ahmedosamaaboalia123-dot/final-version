const http = require("http");
const { execSync } = require("child_process");
const app = require("./app");
const { port } = require("./config/env");
const logger = require("./lib/logger");
const { initSocket } = require("./websocket/socket.server");

async function runSeed() {
  const bcrypt = require("bcryptjs");
  const prisma = require("./lib/prisma");

  const existing = await prisma.user.findFirst({ where: { name: "Admin" } });
  if (!existing) {
    const passwordHash = await bcrypt.hash("root123", 10);
    await prisma.user.create({
      data: { name: "Admin", passwordHash, position: "OWNER", role: "OWNER", status: "ACTIVE" },
    });
    logger.info("Seed user created: Admin (OWNER)");
  } else {
    logger.info("Seed user already exists — skipping");
  }

  const existingSettings = await prisma.setting.count();
  if (existingSettings === 0) {
    await prisma.setting.createMany({
      data: [
        { key: "shop_name", value: "404 Coffee", description: "اسم الكافيه" },
        { key: "currency", value: "EGP", description: "العملة" },
        { key: "tax_rate", value: "0", description: "نسبة الضريبة (0-100)" },
      ],
    });
    logger.info("Default settings created");
  }

  await prisma.$disconnect();
}

async function start() {
  try {
    logger.info("Running prisma migrate deploy...");
    execSync("npx prisma migrate deploy", { stdio: "inherit", timeout: 60000 });
    logger.info("Migrations applied successfully");
  } catch (err) {
    logger.error({ err: err.message }, "Migration failed, trying db push...");
    try {
      execSync("npx prisma db push --accept-data-loss", { stdio: "inherit", timeout: 60000 });
      logger.info("db push applied successfully");
    } catch (err2) {
      logger.error({ err: err2.message }, "db push also failed, starting server anyway");
    }
  }

  try {
    logger.info("Running seed...");
    await runSeed();
    logger.info("Seed completed");
  } catch (err) {
    logger.error({ err: err.message }, "Seed failed");
  }

  const server = http.createServer(app);
  initSocket(server);
  server.listen(port, () => {
    logger.info(`404 Coffee API running on http://localhost:${port}`);
  });
}

start();
