-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('WAITER', 'BILL', 'HELP');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "service_requests" (
    "id" SERIAL NOT NULL,
    "tableNumber" INTEGER NOT NULL,
    "type" "ServiceRequestType" NOT NULL DEFAULT 'WAITER',
    "reason" TEXT,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedByUserId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_tableNumber_idx" ON "service_requests"("tableNumber");

-- CreateIndex
CREATE INDEX "service_requests_status_idx" ON "service_requests"("status");
