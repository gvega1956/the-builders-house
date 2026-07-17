-- AlterTable: add branch document-number prefix (optional, globally unique)
ALTER TABLE "warehouses"
  ADD COLUMN "prefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_prefix_key" ON "warehouses"("prefix");
