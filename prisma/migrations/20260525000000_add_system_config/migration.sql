-- CreateTable: system_config (key-value store para configuración del sistema)
CREATE TABLE "system_config" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- Seed inicial: tasa de IVU Puerto Rico (10.5% estatal + 1% municipal = 11.5%)
INSERT INTO "system_config" ("key", "value", "updatedAt")
VALUES
    ('TAX_RATE',  '0.115',  NOW()),
    ('TAX_LABEL', 'IVU',    NOW()),
    ('CURRENCY',  'USD',    NOW());
