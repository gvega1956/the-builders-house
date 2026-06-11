-- Agrega paymentTerms para distinguir ventas al contado vs crédito.
--
-- Reescrita como idempotente (2026-06-11): alguien editó el baseline
-- 20260521000000 después de su ejecución para incluir "paymentTerms" TEXT
-- en el CREATE TABLE de invoices. En una BD fresca, el baseline crea la
-- columna como TEXT nullable y esta migración fallaría con ADD COLUMN si
-- no se usa IF NOT EXISTS.
--
-- En producción esta migración corrió correctamente (applied_steps_count=1,
-- 2026-06-05) porque cuando corrió el baseline no la tenía aún. La versión
-- idempotente es no-op en producción y correcta en BD fresca.
--
-- Checksums: ver nota en 20260520000001 — mismo comportamiento esperado.

-- ADD COLUMN IF NOT EXISTS: no-op si la columna ya existe (BD fresca post-baseline).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
-- Fijar DEFAULT idempotentemente (no falla si ya existe el default).
ALTER TABLE invoices ALTER COLUMN "paymentTerms" SET DEFAULT 'CONTADO';
-- Rellenar nulos antes de SET NOT NULL (solo relevante en BD fresca donde el
-- baseline crea la columna sin default y sin datos — en producción no hay nulos).
UPDATE invoices SET "paymentTerms" = 'CONTADO' WHERE "paymentTerms" IS NULL;
-- SET NOT NULL es idempotente en PostgreSQL (no falla si ya es NOT NULL).
ALTER TABLE invoices ALTER COLUMN "paymentTerms" SET NOT NULL;

-- Las facturas con fecha de vencimiento son crédito; las demás son contado.
-- Idempotente: solo actualiza filas que aún tienen CONTADO y tienen dueDate.
UPDATE invoices SET "paymentTerms" = 'CREDITO'
  WHERE "dueDate" IS NOT NULL AND "paymentTerms" = 'CONTADO';
