-- AlterTable: Add categoryId foreign key to products (was applied via db push, now persisted as migration)

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "categoryId" INTEGER;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "products_categoryId_idx" ON "products"("categoryId");
