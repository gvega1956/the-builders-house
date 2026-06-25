-- Add branchId to invoices: tracks which sucursal issued the invoice,
-- independent of where the stock came from (product_locations.warehouseId).
-- Nullable so existing invoices remain valid; backfilled via app logic on first save.
ALTER TABLE "invoices" ADD COLUMN "branchId" TEXT;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "invoices_branchId_idx" ON "invoices"("branchId");
