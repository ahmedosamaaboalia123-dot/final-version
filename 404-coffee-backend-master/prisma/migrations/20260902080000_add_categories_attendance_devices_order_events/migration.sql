-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "product_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_categories_name_key" ON "product_categories"("name");

-- CreateTable
CREATE TABLE IF NOT EXISTS "attendance" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ON_TIME',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attendance_userId_idx" ON "attendance"("userId");
CREATE INDEX IF NOT EXISTS "attendance_checkInAt_idx" ON "attendance"("checkInAt");

-- AddForeignKey
ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_userId_fkey";
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "employee_devices" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceInfo" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_devices_deviceFingerprint_key" ON "employee_devices"("deviceFingerprint");
CREATE INDEX IF NOT EXISTS "employee_devices_userId_idx" ON "employee_devices"("userId");
CREATE INDEX IF NOT EXISTS "employee_devices_status_idx" ON "employee_devices"("status");

-- AddForeignKey
ALTER TABLE "employee_devices" DROP CONSTRAINT IF EXISTS "employee_devices_userId_fkey";
ALTER TABLE "employee_devices" ADD CONSTRAINT "employee_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "order_events" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "notes" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_events_orderId_idx" ON "order_events"("orderId");
CREATE INDEX IF NOT EXISTS "order_events_type_idx" ON "order_events"("type");
CREATE INDEX IF NOT EXISTS "order_events_createdAt_idx" ON "order_events"("createdAt");

-- AddForeignKey
ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_orderId_fkey";
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "order_events_userId_fkey";
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
