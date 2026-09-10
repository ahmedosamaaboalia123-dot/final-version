-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "OrderStatus" ADD VALUE 'ASSIGNED_TO_DELEGATE';
ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

-- AlterTable
ALTER TABLE "order_events" ADD COLUMN     "fromStatus" TEXT,
ADD COLUMN     "toStatus" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "typeName" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "serviceFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "tax" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" TEXT NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "tableToken" TEXT NOT NULL,
    "trackingToken" TEXT,
    "guestsCount" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_idempotency" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_tableToken_key" ON "table_sessions"("tableToken");

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_trackingToken_key" ON "table_sessions"("trackingToken");

-- CreateIndex
CREATE INDEX "table_sessions_tableNumber_idx" ON "table_sessions"("tableNumber");

-- CreateIndex
CREATE INDEX "table_sessions_status_idx" ON "table_sessions"("status");

-- CreateIndex
CREATE INDEX "table_sessions_tableNumber_status_idx" ON "table_sessions"("tableNumber", "status");

-- CreateIndex
CREATE UNIQUE INDEX "order_idempotency_key_key" ON "order_idempotency"("key");

-- CreateIndex
CREATE INDEX "order_idempotency_key_idx" ON "order_idempotency"("key");

-- CreateIndex
CREATE INDEX "order_idempotency_expiresAt_idx" ON "order_idempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_status_idx" ON "order_items"("orderId", "status");

-- CreateIndex
CREATE INDEX "orders_channel_status_createdAt_idx" ON "orders"("channel", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_fulfillmentType_status_createdAt_idx" ON "orders"("fulfillmentType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_customerId_createdAt_idx" ON "orders"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "service_requests_status_createdAt_idx" ON "service_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "service_requests_tableNumber_status_idx" ON "service_requests"("tableNumber", "status");
