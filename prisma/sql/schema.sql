-- =============================================================================
-- Peñita Golf Championship - creación del esquema
--
-- GENERADO desde prisma/schema.prisma por scripts/generate-sql.ts.
-- No editar a mano: se regenera con `npm run gen:sql`.
--
-- Cómo aplicarlo:
--   Opción A (recomendada, sin SQL):  npx prisma db push
--   Opción B: pegar este archivo entero en el editor SQL de Neon.
--
-- Va todo en una transacción: si algo falla, no queda nada a medias.
-- Un esquema creado a medias es peor que ninguno.
--
-- Es re-ejecutable: los enums se crean con un bloque condicional y las
-- tablas e índices con IF NOT EXISTS.
--
-- AVISO: este SQL no se ha ejecutado nunca contra un PostgreSQL. Lo que
-- está verificado es que cubre cada modelo, campo, enum, índice y relación
-- del esquema, no que Postgres lo acepte. Pruébalo primero en una rama de
-- desarrollo de Neon: son instantáneas y desechables.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Tipos enumerados (13)
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('PLAYER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'CONFIGURED', 'IN_PLAY', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClassificationStatus" AS ENUM ('HIDDEN', 'REVEALING', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ScorecardStatus" AS ENUM ('NOT_STARTED', 'IN_PLAY', 'FINISHED', 'REVIEWED', 'LOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FlightStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PLAY', 'FINISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TeeName" AS ENUM ('AMARILLAS', 'BLANCAS', 'AZULES', 'ROJAS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PlayerCategory" AS ENUM ('CABALLEROS', 'DAMAS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "Modality" AS ENUM ('INDIVIDUAL_STABLEFORD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "HandicapRoundingPolicy" AS ENUM ('ROUND_ONCE', 'ROUND_TWICE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CourseSourceType" AS ENUM ('WEB_OFICIAL', 'FICHA_PDF', 'CSV', 'MANUAL', 'API_PROVEEDOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'DUPLICATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'RESOLVED_LOCAL', 'RESOLVED_SERVER', 'RESOLVED_MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('OK', 'OBJECTED', 'OUTDATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- Tablas (20)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER'::"Role",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultColor" TEXT NOT NULL,
    "sessionEpoch" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionEpoch" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LoginAttempt" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Madrid',
    "modality" "Modality" NOT NULL DEFAULT 'INDIVIDUAL_STABLEFORD'::"Modality",
    "teeColor" "TeeName" NOT NULL DEFAULT 'AMARILLAS'::"TeeName",
    "category" "PlayerCategory" NOT NULL DEFAULT 'CABALLEROS'::"PlayerCategory",
    "handicapAllowancePercent" INTEGER NOT NULL DEFAULT 95,
    "handicapRoundingPolicy" "HandicapRoundingPolicy" NOT NULL DEFAULT 'ROUND_TWICE'::"HandicapRoundingPolicy",
    "maxHandicapIndexTenths" INTEGER,
    "scoreResetVersion" INTEGER NOT NULL DEFAULT 0,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT'::"CompetitionStatus",
    "classificationStatus" "ClassificationStatus" NOT NULL DEFAULT 'HIDDEN'::"ClassificationStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Course" (
    "id" TEXT NOT NULL,
    "clubCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "providerIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CourseDataSource" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceType" "CourseSourceType" NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "measurementDate" TIMESTAMP(3),
    "ratingDate" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rawMetadata" JSONB,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    CONSTRAINT "CourseDataSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompetitionCourseSnapshot" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "teeName" "TeeName" NOT NULL,
    "category" "PlayerCategory" NOT NULL,
    "slopeRating" INTEGER NOT NULL,
    "courseRatingTenths" INTEGER NOT NULL,
    "parTotal" INTEGER NOT NULL,
    "distanceTotal" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionCourseSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CourseHoleSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "strokeIndex" INTEGER NOT NULL,
    "distance" INTEGER NOT NULL,
    CONSTRAINT "CourseHoleSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompetitionPlayer" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "handicapIndexTenths" INTEGER,
    "appliedHandicapIndexTenths" INTEGER,
    "courseHandicapRawHundredths" INTEGER,
    "courseHandicap" INTEGER,
    "playingHandicapRawHundredths" INTEGER,
    "playingHandicap" INTEGER,
    "isPlayingHandicapOverridden" BOOLEAN NOT NULL DEFAULT false,
    "calculationVersion" TEXT,
    "color" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetitionPlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Flight" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "teeTime" TIMESTAMP(3),
    "status" "FlightStatus" NOT NULL DEFAULT 'DRAFT'::"FlightStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FlightMember" (
    "id" TEXT NOT NULL,
    "flightId" TEXT NOT NULL,
    "competitionPlayerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "FlightMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Scorecard" (
    "id" TEXT NOT NULL,
    "competitionPlayerId" TEXT NOT NULL,
    "status" "ScorecardStatus" NOT NULL DEFAULT 'NOT_STARTED'::"ScorecardStatus",
    "version" INTEGER NOT NULL DEFAULT 0,
    "playerConfirmedFinish" BOOLEAN NOT NULL DEFAULT false,
    "holesCompleted" INTEGER NOT NULL DEFAULT 0,
    "pointsTotal" INTEGER NOT NULL DEFAULT 0,
    "numericStrokesTotal" INTEGER NOT NULL DEFAULT 0,
    "pickupCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Scorecard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HoleScore" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "grossStrokes" INTEGER,
    "isPickup" BOOLEAN NOT NULL DEFAULT false,
    "strokesReceived" INTEGER NOT NULL,
    "netStrokes" INTEGER,
    "grossToPar" INTEGER,
    "netToPar" INTEGER,
    "stablefordPoints" INTEGER NOT NULL DEFAULT 0,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "serverVersion" INTEGER NOT NULL,
    "isOverridden" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HoleScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CardReview" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "scorecardVersion" INTEGER NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'OK'::"ReviewStatus",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SyncMutation" (
    "id" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "scoreGeneration" INTEGER NOT NULL DEFAULT 0,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING'::"SyncStatus",
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    CONSTRAINT "SyncMutation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SyncConflict" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "localValue" JSONB NOT NULL,
    "serverValue" JSONB NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "serverVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN'::"ConflictStatus",
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncConflict_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RankingSnapshot" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isOutdated" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RankingSnapshotRow" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "competitionPlayerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isSharedPosition" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL,
    "handicapIndexTenths" INTEGER NOT NULL,
    "playingHandicap" INTEGER NOT NULL,
    "numericStrokes" INTEGER NOT NULL,
    "pickups" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "RankingSnapshotRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ClassificationReveal" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "status" "ClassificationStatus" NOT NULL DEFAULT 'HIDDEN'::"ClassificationStatus",
    "revealedCount" INTEGER NOT NULL DEFAULT 0,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "nextActionAvailableAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassificationReveal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "reason" TEXT,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "User_normalizedName_idx" ON "User"("normalizedName");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_identifier_createdAt_idx" ON "LoginAttempt"("identifier", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Course_clubCode_key" ON "Course"("clubCode");
CREATE INDEX IF NOT EXISTS "CourseDataSource_courseId_fetchedAt_idx" ON "CourseDataSource"("courseId", "fetchedAt");
CREATE INDEX IF NOT EXISTS "CompetitionCourseSnapshot_competitionId_isActive_idx" ON "CompetitionCourseSnapshot"("competitionId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseHoleSnapshot_snapshotId_holeNumber_key" ON "CourseHoleSnapshot"("snapshotId", "holeNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseHoleSnapshot_snapshotId_strokeIndex_key" ON "CourseHoleSnapshot"("snapshotId", "strokeIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionPlayer_competitionId_userId_key" ON "CompetitionPlayer"("competitionId", "userId");
CREATE INDEX IF NOT EXISTS "CompetitionPlayer_competitionId_isActive_idx" ON "CompetitionPlayer"("competitionId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "Flight_competitionId_order_key" ON "Flight"("competitionId", "order");
CREATE UNIQUE INDEX IF NOT EXISTS "FlightMember_competitionPlayerId_key" ON "FlightMember"("competitionPlayerId");
CREATE UNIQUE INDEX IF NOT EXISTS "FlightMember_flightId_position_key" ON "FlightMember"("flightId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "Scorecard_competitionPlayerId_key" ON "Scorecard"("competitionPlayerId");
CREATE UNIQUE INDEX IF NOT EXISTS "HoleScore_scorecardId_holeNumber_key" ON "HoleScore"("scorecardId", "holeNumber");
CREATE INDEX IF NOT EXISTS "CardReview_scorecardId_createdAt_idx" ON "CardReview"("scorecardId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SyncMutation_clientMutationId_key" ON "SyncMutation"("clientMutationId");
CREATE INDEX IF NOT EXISTS "SyncMutation_userId_createdAt_idx" ON "SyncMutation"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SyncConflict_status_createdAt_idx" ON "SyncConflict"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RankingSnapshot_competitionId_createdAt_idx" ON "RankingSnapshot"("competitionId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "RankingSnapshotRow_snapshotId_competitionPlayerId_key" ON "RankingSnapshotRow"("snapshotId", "competitionPlayerId");
CREATE UNIQUE INDEX IF NOT EXISTS "RankingSnapshotRow_snapshotId_sortOrder_key" ON "RankingSnapshotRow"("snapshotId", "sortOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassificationReveal_competitionId_key" ON "ClassificationReveal"("competitionId");
CREATE INDEX IF NOT EXISTS "AuditLog_competitionId_createdAt_idx" ON "AuditLog"("competitionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- ----------------------------------------------------------------------------
-- Claves foráneas
--
-- Al final a propósito: así el orden de creación de tablas da igual.
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CourseDataSource" ADD CONSTRAINT "CourseDataSource_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionCourseSnapshot" ADD CONSTRAINT "CompetitionCourseSnapshot_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionCourseSnapshot" ADD CONSTRAINT "CompetitionCourseSnapshot_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "CourseDataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CourseHoleSnapshot" ADD CONSTRAINT "CourseHoleSnapshot_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "CompetitionCourseSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionPlayer" ADD CONSTRAINT "CompetitionPlayer_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionPlayer" ADD CONSTRAINT "CompetitionPlayer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitionPlayer" ADD CONSTRAINT "CompetitionPlayer_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "CompetitionCourseSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Flight" ADD CONSTRAINT "Flight_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FlightMember" ADD CONSTRAINT "FlightMember_flightId_fkey"
    FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FlightMember" ADD CONSTRAINT "FlightMember_competitionPlayerId_fkey"
    FOREIGN KEY ("competitionPlayerId") REFERENCES "CompetitionPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_competitionPlayerId_fkey"
    FOREIGN KEY ("competitionPlayerId") REFERENCES "CompetitionPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "HoleScore" ADD CONSTRAINT "HoleScore_scorecardId_fkey"
    FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CardReview" ADD CONSTRAINT "CardReview_scorecardId_fkey"
    FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CardReview" ADD CONSTRAINT "CardReview_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SyncMutation" ADD CONSTRAINT "SyncMutation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SyncConflict" ADD CONSTRAINT "SyncConflict_scorecardId_fkey"
    FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RankingSnapshot" ADD CONSTRAINT "RankingSnapshot_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RankingSnapshotRow" ADD CONSTRAINT "RankingSnapshotRow_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "RankingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RankingSnapshotRow" ADD CONSTRAINT "RankingSnapshotRow_competitionPlayerId_fkey"
    FOREIGN KEY ("competitionPlayerId") REFERENCES "CompetitionPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassificationReveal" ADD CONSTRAINT "ClassificationReveal_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassificationReveal" ADD CONSTRAINT "ClassificationReveal_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "RankingSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- =============================================================================
-- Después de esto:
--
--   1. Las restricciones que Prisma no sabe expresar:
--      pegar prisma/sql/constraints.sql
--
--   2. Los 13 jugadores, la competición y la valoración del campo:
--      npm run db:seed        (ver docs/seed-credentials.md)
--
--   3. Comprobar que todo está:
--      abrir /api/diagnostico
--
-- Nota sobre Prisma: si creas las tablas con este SQL, Prisma no sabe que
-- existen y avisará de "drift" si algún día cambias el esquema. Para eso,
-- `npx prisma db push` reconcilia sin perder datos.
-- =============================================================================
