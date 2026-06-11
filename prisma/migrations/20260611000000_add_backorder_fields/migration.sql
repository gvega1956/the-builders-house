-- AlterTable: product_locations
-- Adds backorderQuantity to track units sold without physical stock (authorized backorders).
-- Safe: non-null with default 0 — no data migration needed for existing rows.
ALTER TABLE "product_locations" ADD COLUMN "backorderQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: invoice_items
-- Adds quantityBackordered to record how many units in a line were authorized as backorder.
-- Safe: non-null with default 0 — no data migration needed for existing rows.
ALTER TABLE "invoice_items" ADD COLUMN "quantityBackordered" INTEGER NOT NULL DEFAULT 0;
