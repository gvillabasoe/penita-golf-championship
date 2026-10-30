-- =============================================================================
-- Migracion 003 · Modo parejas y gestion de participantes
-- Peñita Golf Championship v2.0.0
--
-- Para una base de datos que YA existe. Si estas creando el esquema desde cero,
-- usa prisma/sql/schema.sql: ya incluye estas columnas.
--
-- Es re-ejecutable y va completa dentro de una transaccion.
-- =============================================================================

BEGIN;

-- Configuracion de la clasificacion paralela por parejas. La competicion sigue
-- arrancando exactamente como antes: modo parejas desactivado y mejor bola como
-- modalidad preparada para cuando el administrador lo active.
ALTER TABLE "Competition"
  ADD COLUMN IF NOT EXISTS "pairModeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pairScoringMode" TEXT NOT NULL DEFAULT 'BEST_BALL';

-- Dos jugadores con el mismo numero forman una pareja. No se crea una tabla
-- adicional porque la pareja no tiene datos propios: nombre, color y resultados
-- se derivan siempre de sus dos integrantes y de sus tarjetas individuales.
ALTER TABLE "CompetitionPlayer"
  ADD COLUMN IF NOT EXISTS "pairNumber" INTEGER;

CREATE INDEX IF NOT EXISTS "CompetitionPlayer_competitionId_pairNumber_idx"
  ON "CompetitionPlayer" ("competitionId", "pairNumber");

DO $$ BEGIN
  ALTER TABLE "Competition"
    ADD CONSTRAINT "pair_scoring_mode_known"
      CHECK ("pairScoringMode" IN ('BEST_BALL', 'COMBINED_POINTS'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionPlayer"
    ADD CONSTRAINT "pair_number_positive"
      CHECK ("pairNumber" IS NULL OR "pairNumber" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
