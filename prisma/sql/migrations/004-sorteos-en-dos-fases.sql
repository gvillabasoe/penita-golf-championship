-- =============================================================================
-- Migracion 004 · Sorteos consecutivos: partidos confirmados -> parejas
-- Peñita Golf Championship v2.1.0
--
-- Para una base de datos que YA existe. Si se crea desde cero, usa
-- prisma/sql/schema.sql, que ya contiene estas columnas.
--
-- La primera ejecucion invalida los partidos y parejas existentes para obligar
-- a confirmar la composicion de partidos antes de volver a sortear parejas.
-- Las siguientes ejecuciones no repiten esa invalidacion.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  first_application BOOLEAN;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Competition'
      AND column_name = 'flightsConfirmedAt'
  ) INTO first_application;

  ALTER TABLE "Competition"
    ADD COLUMN IF NOT EXISTS "flightsConfirmedAt" TIMESTAMP(3);

  ALTER TABLE "CompetitionPlayer"
    ADD COLUMN IF NOT EXISTS "knowsCourse" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "pairSoloMultiplier" BOOLEAN NOT NULL DEFAULT false;

  IF first_application THEN
    UPDATE "CompetitionPlayer"
      SET "pairNumber" = NULL,
          "pairSoloMultiplier" = false;
    UPDATE "Flight"
      SET "status" = 'DRAFT'::"FlightStatus";
    UPDATE "Competition"
      SET "flightsConfirmedAt" = NULL;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionPlayer"
    ADD CONSTRAINT "pair_solo_requires_pair_number"
      CHECK ("pairSoloMultiplier" = false OR "pairNumber" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- En un campeonato con numero impar solo puede existir un participante x2.
CREATE UNIQUE INDEX IF NOT EXISTS "one_solo_pair_player_per_competition"
  ON "CompetitionPlayer" ("competitionId")
  WHERE "pairSoloMultiplier" = true;

COMMIT;
