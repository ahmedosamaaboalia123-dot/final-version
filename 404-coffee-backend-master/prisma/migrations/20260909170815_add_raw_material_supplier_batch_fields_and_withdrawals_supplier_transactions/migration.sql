-- AlterTable
ALTER TABLE "raw_material_batches" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "initialQuantity" DECIMAL(65,30),
ADD COLUMN     "withdrawalPriority" INTEGER;

-- AlterTable
ALTER TABLE "raw_materials" ADD COLUMN     "supplierId" INTEGER,
ALTER COLUMN "supplier" DROP NOT NULL;

-- CreateTable
CREATE TABLE "raw_material_withdrawals" (
    "id" SERIAL NOT NULL,
    "rawMaterialId" INTEGER NOT NULL,
    "batchId" INTEGER NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "totalCost" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "processedByUserId" INTEGER,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_material_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_transactions" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_material_withdrawals_rawMaterialId_idx" ON "raw_material_withdrawals"("rawMaterialId");

-- CreateIndex
CREATE INDEX "raw_material_withdrawals_batchId_idx" ON "raw_material_withdrawals"("batchId");

-- CreateIndex
CREATE INDEX "raw_material_withdrawals_processedAt_idx" ON "raw_material_withdrawals"("processedAt");

-- CreateIndex
CREATE INDEX "supplier_transactions_supplierId_idx" ON "supplier_transactions"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_transactions_transactionDate_idx" ON "supplier_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "supplier_transactions_type_idx" ON "supplier_transactions"("type");

-- CreateIndex
CREATE INDEX "raw_materials_supplierId_idx" ON "raw_materials"("supplierId");

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_withdrawals" ADD CONSTRAINT "raw_material_withdrawals_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_withdrawals" ADD CONSTRAINT "raw_material_withdrawals_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "raw_material_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
