-- =============================================================================
-- Migracion 006 · Publicacion directa de la clasificacion con un switch
-- Peñita Golf Championship v2.3.0
--
-- La clasificacion pasa a tener una sola fuente de verdad:
--   Competition.classificationStatus = HIDDEN | PUBLISHED
--
-- Se eliminan las tablas auxiliares de revelacion y snapshots. Antes de tocar
-- el enum, cualquier competicion que hubiese quedado en REVEALING vuelve a
-- HIDDEN, es decir, a Provisional.
--
-- Es re-ejecutable: los DROP usan IF EXISTS y el enum solo se reconstruye si
-- todavia contiene el valor heredado REVEALING.
-- =============================================================================

BEGIN;

-- Un estado intermedio antiguo nunca debe convertirse en oficial por migrar.
UPDATE "Competition"
SET "classificationStatus" = 'HIDDEN'::"ClassificationStatus"
WHERE "classificationStatus"::text = 'REVEALING';

-- Primero se elimina la tabla que referencia el snapshot y despues sus filas.
DROP TABLE IF EXISTS "ClassificationReveal" CASCADE;
DROP TABLE IF EXISTS "RankingSnapshotRow" CASCADE;
DROP TABLE IF EXISTS "RankingSnapshot" CASCADE;

-- PostgreSQL no permite borrar directamente un valor de un enum. Se convierte
-- temporalmente la columna a texto, se recrea el tipo con los dos estados que
-- siguen existiendo y se devuelve la columna a su tipo nominal.
DO $$
DECLARE
  has_legacy_revealing BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema()
      AND t.typname = 'ClassificationStatus'
      AND e.enumlabel = 'REVEALING'
  ) INTO has_legacy_revealing;

  IF has_legacy_revealing THEN
    EXECUTE 'ALTER TABLE "Competition" ALTER COLUMN "classificationStatus" DROP DEFAULT';
    EXECUTE 'ALTER TABLE "Competition" ALTER COLUMN "classificationStatus" TYPE TEXT USING "classificationStatus"::text';
    EXECUTE 'DROP TYPE "ClassificationStatus"';
    EXECUTE 'CREATE TYPE "ClassificationStatus" AS ENUM (''HIDDEN'', ''PUBLISHED'')';
    EXECUTE 'ALTER TABLE "Competition" ALTER COLUMN "classificationStatus" TYPE "ClassificationStatus" USING "classificationStatus"::"ClassificationStatus"';
    EXECUTE 'ALTER TABLE "Competition" ALTER COLUMN "classificationStatus" SET DEFAULT ''HIDDEN''::"ClassificationStatus"';
  END IF;
END $$;

COMMIT;

-- Comprobacion posterior recomendada:
--
--   SELECT "classificationStatus", COUNT(*)
--   FROM "Competition"
--   GROUP BY "classificationStatus";
--
-- Solo deben aparecer HIDDEN y PUBLISHED.
