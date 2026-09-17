-- =============================================================================
-- Restricciones que Prisma NO puede expresar en su esquema.
--
-- Aplicar DESPUES de la migracion inicial:
--     npm run db:constraints
--
-- Motivo: las garantias de integridad deportiva no deben depender de que todo
-- el codigo de la aplicacion se comporte bien. Si algun dia una ruta nueva
-- escribe un stroke index 19 o unos puntos Stableford de 7, la base de datos
-- tiene que rechazarlo. Prisma soporta @@unique pero no CHECK.
--
-- ADVERTENCIA: este archivo NO se ha ejecutado contra un PostgreSQL real. El
-- entorno donde se genero no tiene base de datos. Ejecutalo contra la rama de
-- desarrollo de Neon antes de aplicarlo a produccion.
--
-- Es re-ejecutable: cada bloque ignora la restriccion si ya existe. Se pega en
-- el editor de Neon, y pegarlo dos veces no rompe nada.
-- =============================================================================

BEGIN;

-- --- Hoyos del campo --------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "CourseHoleSnapshot"
    ADD CONSTRAINT "hole_number_range" CHECK ("holeNumber" BETWEEN 1 AND 18),
    ADD CONSTRAINT "stroke_index_range" CHECK ("strokeIndex" BETWEEN 1 AND 18),
    ADD CONSTRAINT "hole_par_range" CHECK ("par" BETWEEN 3 AND 6),
    ADD CONSTRAINT "hole_distance_positive" CHECK ("distance" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- Valoracion del campo ---------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "CompetitionCourseSnapshot"
    ADD CONSTRAINT "slope_range_whs" CHECK ("slopeRating" BETWEEN 55 AND 155),
    ADD CONSTRAINT "course_rating_plausible" CHECK ("courseRatingTenths" BETWEEN 400 AND 900),
    ADD CONSTRAINT "par_total_plausible" CHECK ("parTotal" BETWEEN 27 AND 80),
    ADD CONSTRAINT "distance_total_positive" CHECK ("distanceTotal" > 0),
    -- Un snapshot activo tiene que estar confirmado. Esta es la regla de la
    -- seccion 19 escrita en la base de datos: no se puede jugar con una
    -- valoracion que nadie ha confirmado, ni por error de la aplicacion.
    ADD CONSTRAINT "active_requires_confirmation"
      CHECK ("isActive" = false OR ("confirmedAt" IS NOT NULL AND "confirmedByUserId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Un unico snapshot activo por competicion.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_snapshot_per_competition"
  ON "CompetitionCourseSnapshot" ("competitionId")
  WHERE "isActive" = true;

-- --- Hándicaps --------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "CompetitionPlayer"
    -- Rango EGA/WHS: de +10,0 (=-100 decimas) a 54,0 (=540 decimas).
    ADD CONSTRAINT "handicap_index_range"
      CHECK ("handicapIndexTenths" IS NULL OR "handicapIndexTenths" BETWEEN -100 AND 540);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Competition"
    ADD CONSTRAINT "allowance_range" CHECK ("handicapAllowancePercent" BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- Resultados -------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "HoleScore"
    ADD CONSTRAINT "score_hole_number_range" CHECK ("holeNumber" BETWEEN 1 AND 18),
    -- El teclado del jugador es 1-9 y raya. Se deja margen hasta 20 para
    -- correcciones administrativas, pero no para valores absurdos.
    ADD CONSTRAINT "gross_strokes_range"
      CHECK ("grossStrokes" IS NULL OR "grossStrokes" BETWEEN 1 AND 20),
    -- Tope de 5 puntos en esta edicion (seccion 31).
    ADD CONSTRAINT "stableford_points_range" CHECK ("stablefordPoints" BETWEEN 0 AND 5),
    -- Una raya no tiene golpes ni puntos. Y si no hay raya y hay resultado,
    -- tiene que haber golpes. Esto impide el estado imposible "raya con 4 golpes".
    ADD CONSTRAINT "pickup_has_no_strokes"
      CHECK ("isPickup" = false OR ("grossStrokes" IS NULL AND "stablefordPoints" = 0)),
    -- Los golpes recibidos por hoyo: como maximo 3 vueltas completas de reparto.
    ADD CONSTRAINT "strokes_received_range" CHECK ("strokesReceived" BETWEEN -4 AND 4);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- Clasificacion y revelacion --------------------------------------------

DO $$ BEGIN
  ALTER TABLE "RankingSnapshotRow"
    ADD CONSTRAINT "position_positive" CHECK ("position" >= 1),
    ADD CONSTRAINT "row_points_non_negative" CHECK ("points" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassificationReveal"
    ADD CONSTRAINT "revealed_count_non_negative" CHECK ("revealedCount" >= 0),
    ADD CONSTRAINT "current_index_non_negative" CHECK ("currentIndex" >= 0),
    -- No se puede publicar sin snapshot: publicar exige una clasificacion congelada.
    ADD CONSTRAINT "published_requires_snapshot"
      CHECK ("status" <> 'PUBLISHED' OR "snapshotId" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --- Sesiones ---------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "Session"
    ADD CONSTRAINT "session_expiry_after_creation" CHECK ("expiresAt" > "createdAt");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
