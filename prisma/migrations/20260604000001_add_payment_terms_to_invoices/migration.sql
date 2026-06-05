-- Agrega paymentTerms para distinguir ventas al contado vs crédito
ALTER TABLE invoices ADD COLUMN "paymentTerms" TEXT NOT NULL DEFAULT 'CONTADO';

-- Las facturas ISSUED sin fecha de vencimiento son contado; con fecha son crédito
UPDATE invoices SET "paymentTerms" = 'CREDITO' WHERE "dueDate" IS NOT NULL;
