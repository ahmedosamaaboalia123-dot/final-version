-- Batch 3: Order fields for version tracking, delivery, and sale linking
ALTER TABLE "orders" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "orders" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "saleId" INTEGER;
ALTER TABLE "orders" ADD CONSTRAINT "orders_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "orders_saleId_idx" ON "orders"("saleId");

-- Batch 4: Delegate isActive boolean for breaking-change migration
ALTER TABLE "delegates" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "delegates_isActive_idx" ON "delegates"("isActive");
