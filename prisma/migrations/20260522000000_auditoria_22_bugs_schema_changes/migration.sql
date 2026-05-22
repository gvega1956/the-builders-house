-- Migración formal: cambios de schema derivados de la auditoría técnica (22 bugs)
-- Aplicados previamente vía `prisma db push` — marcados aquí para trazabilidad formal.
-- Commit de referencia: 56ba812
-- Fecha: 2026-05-22

-- Bug A-2: Rate limiting persistente — nueva tabla login_attempts
-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: acelera lookup de intentos recientes por email
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- Bug F-1/F-2: CycleCount necesita locationId para contar ubicación específica
-- AlterTable
ALTER TABLE "cycle_counts" ADD COLUMN "locationId" TEXT;

-- AddForeignKey: ON DELETE SET NULL — si se borra la ubicación, el conteo pierde referencia (no error)
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "product_locations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Category: nuevas columnas para soporte de soft-delete y auditoría temporal
-- AlterTable
ALTER TABLE "categories" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "categories" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Warehouse: columna updatedAt para auditoría temporal
-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Performance: índices faltantes detectados en auditoría
-- InventoryMovement: búsquedas por tipo de referencia son frecuentes en reportes de trazabilidad
CREATE INDEX "inventory_movements_referenceType_referenceId_idx"
    ON "inventory_movements"("referenceType", "referenceId");

-- Invoice: filtros por type (INVOICE/QUOTE/CREDIT_NOTE) y relaciones son comunes
CREATE INDEX "invoices_type_idx" ON "invoices"("type");
CREATE INDEX "invoices_sourceQuoteId_idx" ON "invoices"("sourceQuoteId");
CREATE INDEX "invoices_sourceInvoiceId_idx" ON "invoices"("sourceInvoiceId");

-- InvoiceItem: joins por productId en reportes de ventas por producto
CREATE INDEX "invoice_items_productId_idx" ON "invoice_items"("productId");
