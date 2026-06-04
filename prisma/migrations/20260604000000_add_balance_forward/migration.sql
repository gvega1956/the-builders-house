-- Agrega BALANCE_FORWARD al enum InvoiceType para saldos iniciales de migración
ALTER TYPE "InvoiceType" ADD VALUE 'BALANCE_FORWARD';

-- Secuencia para numeración BAL-XXXXX
INSERT INTO sequences (name, prefix, padding, "currentValue", "updatedAt")
VALUES ('BALANCE_FORWARD', 'BAL-', 5, 0, NOW())
ON CONFLICT (name) DO NOTHING;
