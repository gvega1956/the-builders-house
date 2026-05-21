-- ============================================================
-- Migration: add_locationid_to_items_and_quote_invoice_relation
-- Sprint:    2 (Integridad Financiera)
-- Bug:       AUDIT-BUG-21 (Bug 2.1c — endpoints authorizeBackorder y convertQuoteToInvoice)
-- Date:      2026-05-20
--
-- Purpose:
--   1) Add locationId to invoice_items so the system knows from which
--      ProductLocation the stock was deducted (or will be, in QUOTE conversion).
--      NULL for QUOTE items, NOT NULL for INVOICE items (enforced by application).
--   2) Add sourceQuoteId to invoices to track which QUOTE was converted into
--      this INVOICE. NULL for invoices not derived from a quote.
--      Relation is 1:N (one QUOTE can have multiple derived INVOICEs in history).
--   3) Create partial indices for performance on stock-by-location queries
--      and quote-to-invoice lookups.
--
-- Safety: All new columns are nullable. No data migration needed.
--         Existing rows keep locationId=NULL and sourceQuoteId=NULL.
--         ON DELETE SET NULL on locationId: reorganizing warehouse locations
--         must not corrupt invoice history. Physical movement traceability
--         lives in inventory_movements.locationId (append-only, immutable).
--
-- Rollback:
--   DROP INDEX IF EXISTS "idx_invoices_source_quote";
--   DROP INDEX IF EXISTS "idx_invoice_items_location";
--   ALTER TABLE invoices DROP CONSTRAINT IF EXISTS "invoices_sourceQuoteId_fkey";
--   ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS "invoice_items_locationId_fkey";
--   ALTER TABLE invoices DROP COLUMN "sourceQuoteId";
--   ALTER TABLE invoice_items DROP COLUMN "locationId";
-- ============================================================

ALTER TABLE invoice_items ADD COLUMN "locationId" TEXT;
ALTER TABLE invoice_items
  ADD CONSTRAINT "invoice_items_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES product_locations(id) ON DELETE SET NULL;

ALTER TABLE invoices ADD COLUMN "sourceQuoteId" TEXT;
ALTER TABLE invoices
  ADD CONSTRAINT "invoices_sourceQuoteId_fkey"
  FOREIGN KEY ("sourceQuoteId") REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX "idx_invoice_items_location"
  ON invoice_items("locationId")
  WHERE "locationId" IS NOT NULL;

CREATE INDEX "idx_invoices_source_quote"
  ON invoices("sourceQuoteId")
  WHERE "sourceQuoteId" IS NOT NULL;
