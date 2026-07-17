-- Asignar prefijos de sucursal a las ubicaciones de producción existentes.
-- WHERE prefix IS NULL garantiza idempotencia (no sobreescribe si ya está asignado).
UPDATE "warehouses" SET "prefix" = 'SJ' WHERE name = 'San Juan' AND "prefix" IS NULL;
UPDATE "warehouses" SET "prefix" = 'PC' WHERE name = 'Ponce'    AND "prefix" IS NULL;
