-- =============================================================================
-- Migracion 002 · Limite de hándicap y vaciado de tarjetas
-- Peñita Golf Championship v1.1.0 -> v1.2.0
--
-- Para una base de datos que YA existe. Si estas creando el esquema desde cero,
-- usa prisma/sql/schema.sql: ya trae estas columnas y esta migracion no hace
-- falta.
--
-- Como aplicarla:
--   Opcion A (recomendada): npx prisma migrate deploy
--   Opcion B: pegar este archivo entero en el editor SQL de Neon.
--
-- Es re-ejecutable: todo va con IF NOT EXISTS o con un bloque condicional, asi
-- que pegarlo dos veces no rompe nada ni duplica columnas.
--
-- Va todo en una transaccion. Una migracion a medias que anade el limite de
-- hándicap pero no la generacion de resultados dejaria la aplicacion arrancando
-- y fallando en la primera escritura, que es peor que no migrar.
--
-- AVISO HONESTO: este SQL no se ha ejecutado contra un PostgreSQL. El entorno
-- donde se genero no tiene base de datos. Lo que esta verificado es que las
-- columnas, tipos y valores por omision coinciden con prisma/schema.prisma, no
-- que Postgres lo acepte. Pruebalo primero en una rama de desarrollo de Neon:
-- son instantaneas y desechables.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Limite maximo de hándicap aplicable  (seccion 5)
--
-- En DECIMAS y como INTEGER, no DECIMAL: es una entrada del motor de hándicap,
-- y la regla de este esquema es que nada que decida una clasificacion pasa por
-- coma flotante. 26,4 se guarda como 264.
--
-- NULL significa "sin limite", que es el estado en el que queda toda base de
-- datos existente al aplicar esta migracion. Nadie cambia de hándicap de juego
-- por migrar.
-- ----------------------------------------------------------------------------

ALTER TABLE "Competition"
  ADD COLUMN IF NOT EXISTS "maxHandicapIndexTenths" INTEGER;

-- ----------------------------------------------------------------------------
-- 2. Generacion de resultados  (seccion 3.5)
--
-- La incrementa el vaciado de tarjetas. Es lo que permite rechazar una
-- operacion offline creada ANTES del vaciado, en lugar de aplicarla y devolver
-- a la vida un resultado ya borrado.
--
-- Arranca en 0 y las operaciones antiguas, que no traen generacion, se leen
-- tambien como 0: por eso el valor por omision no puede ser otro.
-- ----------------------------------------------------------------------------

ALTER TABLE "Competition"
  ADD COLUMN IF NOT EXISTS "scoreResetVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SyncMutation"
  ADD COLUMN IF NOT EXISTS "scoreGeneration" INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 3. Hándicap exacto aplicable por jugador  (seccion 5.2)
--
-- El hándicap exacto original NO se toca: sigue en "handicapIndexTenths", sigue
-- mostrandose y sigue decidiendo el segundo criterio de desempate.
--
-- "appliedHandicapIndexTenths" guarda min(exacto, limite), que es la entrada
-- real del calculo. Se guarda en vez de recalcularse al vuelo porque sin ella no
-- se puede reconstruir un hándicap de juego antiguo, que es justo lo que hace
-- falta si alguien reclama.
--
-- La condicion "esta limitado" NO se guarda: es la comparacion de estas dos
-- columnas. Una tercera columna booleana podria discrepar de ellas.
-- ----------------------------------------------------------------------------

ALTER TABLE "CompetitionPlayer"
  ADD COLUMN IF NOT EXISTS "appliedHandicapIndexTenths" INTEGER;

-- Relleno inicial: sin limite configurado, el aplicable ES el exacto. Sin este
-- paso los jugadores existentes se quedarian con el aplicable a NULL y la ficha
-- del administrador mostraria un hueco donde deberia estar su hándicap.
UPDATE "CompetitionPlayer"
  SET "appliedHandicapIndexTenths" = "handicapIndexTenths"
  WHERE "appliedHandicapIndexTenths" IS NULL
    AND "handicapIndexTenths" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Restricciones nuevas
--
-- Mismo criterio que prisma/sql/constraints.sql: las garantias de integridad
-- deportiva no dependen de que todo el codigo de la aplicacion se porte bien.
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "Competition"
    -- Rango del limite: de scratch a 54,0. Un limite plus no limita a nadie de
    -- los que el limite pretende afectar.
    ADD CONSTRAINT "max_handicap_range"
      CHECK ("maxHandicapIndexTenths" IS NULL OR "maxHandicapIndexTenths" BETWEEN 0 AND 540),
    ADD CONSTRAINT "score_reset_version_non_negative"
      CHECK ("scoreResetVersion" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionPlayer"
    ADD CONSTRAINT "applied_handicap_range"
      CHECK ("appliedHandicapIndexTenths" IS NULL
             OR "appliedHandicapIndexTenths" BETWEEN -100 AND 540),
    -- El aplicable nunca puede ser MAYOR que el exacto: el limite solo puede
    -- bajar un hándicap, nunca subirlo. Si algun dia una ruta nueva lo
    -- invirtiese, la base de datos lo rechaza.
    ADD CONSTRAINT "applied_handicap_not_above_exact"
      CHECK ("appliedHandicapIndexTenths" IS NULL
             OR "handicapIndexTenths" IS NULL
             OR "appliedHandicapIndexTenths" <= "handicapIndexTenths");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SyncMutation"
    ADD CONSTRAINT "score_generation_non_negative" CHECK ("scoreGeneration" >= 0),
    -- Las dos unicas operaciones que existen sobre un hoyo.
    ADD CONSTRAINT "sync_operation_known" CHECK ("operation" IN ('WRITE', 'CLEAR'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Colores de jugador  (seccion 10)
--
-- La paleta pastel se sustituye por acentos profundos. La conversion es
-- DETERMINISTA: cada tono pastel antiguo tiene un unico destino, asi que dos
-- ejecuciones dan el mismo resultado y ningun jugador cambia de color dos veces.
--
-- Solo se tocan los trece valores de la paleta ANTIGUA. Un color elegido a mano
-- por el administrador no coincide con ninguno de ellos y por tanto se conserva
-- intacto, que es lo que pide la seccion 10.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  mapping TEXT[][] := ARRAY[
    ['#cfe3d4', '#1b563b'],  -- verde pastel      -> verde esmeralda oscuro
    ['#f2c9c0', '#8c3b2e'],  -- salmon pastel     -> terracota
    ['#cddcf0', '#1d4e79'],  -- azul pastel       -> azul atlantico
    ['#f4e3b2', '#8a6a1f'],  -- amarillo pastel   -> ocre
    ['#dcd0ea', '#4a3168'],  -- lila pastel       -> morado profundo
    ['#c9e4e0', '#1f5c60'],  -- turquesa pastel   -> azul petroleo
    ['#f0d3e2', '#7a2540'],  -- rosa pastel       -> burdeos
    ['#dfe8c4', '#55631f'],  -- verde claro       -> verde oliva
    ['#f5d9bd', '#9c5a24'],  -- melocoton pastel  -> cobre
    ['#c8d9e8', '#1f3a5f'],  -- azul grisaceo     -> azul marino
    ['#e6dcc8', '#6b5433'],  -- arena pastel      -> bronce
    ['#d4e8cf', '#2f6b46'],  -- menta pastel      -> verde bosque
    ['#ead6cd', '#7d4a3a']   -- nude pastel       -> castano rojizo
  ];
  pair TEXT[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY mapping LOOP
    UPDATE "User" SET "defaultColor" = pair[2] WHERE lower("defaultColor") = pair[1];
    UPDATE "CompetitionPlayer" SET "color" = pair[2] WHERE lower("color") = pair[1];
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- Comprobacion posterior. Ejecutar por separado, fuera de la transaccion.
--
--   SELECT "scoreResetVersion", "maxHandicapIndexTenths" FROM "Competition";
--   SELECT "handicapIndexTenths", "appliedHandicapIndexTenths", "color"
--     FROM "CompetitionPlayer";
--
-- Lo que se espera despues de migrar: scoreResetVersion = 0,
-- maxHandicapIndexTenths = NULL, y el aplicable igual al exacto en todos los
-- jugadores. Ningun hándicap de juego cambia por aplicar esta migracion.
-- =============================================================================
