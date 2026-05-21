-- ============================================================
-- Migration: add_pending_authorization_and_converted_to_invoice_status
-- Sprint:    2 (Integridad Financiera)
-- Bug:       AUDIT-BUG-21 (Bug 2.1 — Factura descuenta inventario)
-- Date:      2026-05-20
--
-- Purpose:
--   Add two new InvoiceStatus values to support:
--   1) PENDING_AUTHORIZATION — invoices created by VENDOR role with
--      insufficient stock, awaiting MANAGER approval before stock
--      is deducted.
--   2) CONVERTED — quotes that have been transformed into invoices,
--      marked as historical records linked to the new invoice.
--
-- Safety:
--   ALTER TYPE ADD VALUE is non-destructive. Existing rows are not
--   modified. Index/constraint impact: none.
--
-- Rollback:
--   PostgreSQL does NOT support removing enum values directly.
--   To rollback: rename enum, create new enum without these values,
--   migrate columns, drop old enum. Do NOT attempt in production
--   without a planned maintenance window.
--
-- References:
--   docs/PLAN-CORRECCION.md — Sprint 2, Bug 2.1
-- ============================================================

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "InvoiceStatus" ADD VALUE 'PENDING_AUTHORIZATION';
ALTER TYPE "InvoiceStatus" ADD VALUE 'CONVERTED';
