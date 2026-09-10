/**
 * prisma/seed.js — البيانات الافتراضية (idempotent — آمن للتشغيل المتكرر)
 * ======================================================================
 * 1) إنشاء الـ Owner الأساسي (Admin / root123) لو مش موجود.
 * 2) إعدادات افتراضية زي ما تكون النظام.
 */

require("dotenv").config();

const bcrypt = require("bcryptjs");

const prisma = require("../src/lib/prisma");

async function main() {
  const existing = await prisma.user.findFirst({
    where: { name: "Admin" },
  });

  if (!existing) {
    const passwordHash = await bcrypt.hash("root123", 10);

    const user = await prisma.user.create({
      data: {
        name: "Admin",
        passwordHash,
        position: "OWNER",
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    console.log("Seed user created:", user.name, `(${user.role})`);
  } else {
    console.log("Seed user already exists — skipping");
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

    console.log("Default settings created");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });