-- AlterTable
ALTER TABLE "warehouses"
  ADD COLUMN "legalName"            TEXT,
  ADD COLUMN "displayName"          TEXT,
  ADD COLUMN "city"                 TEXT,
  ADD COLUMN "state"                TEXT DEFAULT 'PR',
  ADD COLUMN "zipCode"              TEXT,
  ADD COLUMN "phone"                TEXT,
  ADD COLUMN "email"                TEXT,
  ADD COLUMN "website"              TEXT,
  ADD COLUMN "ein"                  TEXT,
  ADD COLUMN "merchantRegistration" TEXT;
