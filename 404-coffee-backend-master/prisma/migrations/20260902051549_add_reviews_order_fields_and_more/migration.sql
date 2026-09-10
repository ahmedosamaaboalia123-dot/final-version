-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterEnum OrderType (only if old values exist)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrderType') AND enumlabel = 'DINE_IN') THEN
        CREATE TYPE "OrderType_new" AS ENUM ('tables', 'online');
        ALTER TABLE "orders" ALTER COLUMN "orderType" DROP DEFAULT;
        ALTER TABLE "orders" ALTER COLUMN "orderType" TYPE "OrderType_new" USING ("orderType"::text::"OrderType_new");
        ALTER TYPE "OrderType" RENAME TO "OrderType_old";
        ALTER TYPE "OrderType_new" RENAME TO "OrderType";
        DROP TYPE "OrderType_old";
        ALTER TABLE "orders" ALTER COLUMN "orderType" SET DEFAULT 'tables';
    END IF;
END $$;

-- DropForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "purchase_items" DROP CONSTRAINT IF EXISTS "purchase_items_rawMaterialId_fkey";
    ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable customers
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "feedback" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "orderType" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "social" JSONB;

-- AlterTable order_items
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "channel" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryAddress" JSONB;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "fulfillmentType" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "table" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "trackingToken" TEXT;
ALTER TABLE "orders" ALTER COLUMN "orderType" SET DEFAULT 'tables';

-- AlterTable product_sizes
ALTER TABLE "product_sizes" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable products
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable reviews (idempotent)
CREATE TABLE IF NOT EXISTS "reviews" (
    "id" SERIAL NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (all idempotent)
CREATE INDEX IF NOT EXISTS "reviews_rating_idx" ON "reviews"("rating");
CREATE INDEX IF NOT EXISTS "reviews_createdAt_idx" ON "reviews"("createdAt");
CREATE INDEX IF NOT EXISTS "order_items_status_idx" ON "order_items"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_orderNumber_key" ON "orders"("orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_trackingToken_key" ON "orders"("trackingToken");
CREATE INDEX IF NOT EXISTS "orders_orderNumber_idx" ON "orders"("orderNumber");
CREATE INDEX IF NOT EXISTS "orders_trackingToken_idx" ON "orders"("trackingToken");
CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products"("category");
CREATE INDEX IF NOT EXISTS "products_isActive_idx" ON "products"("isActive");
