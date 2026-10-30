-- =============================================================================
-- Migracion 005 · Semillas reproducibles de partidos y parejas
-- Peñita Golf Championship v2.2.0
--
-- Para una base de datos que YA existe. Si se crea desde cero, usa
-- prisma/sql/schema.sql, que ya contiene estas columnas.
-- =============================================================================

BEGIN;

ALTER TABLE "Competition"
  ADD COLUMN IF NOT EXISTS "flightDrawSeed" TEXT,
  ADD COLUMN IF NOT EXISTS "pairDrawSeed" TEXT;

COMMIT;
