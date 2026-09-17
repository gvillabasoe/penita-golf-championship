/**
 * Lecturas de la base de datos.
 *
 * Cada funcion traduce lo que devuelve Prisma a los tipos del dominio y delega
 * todo el calculo en los modulos ya probados. Aqui no se decide nada deportivo.
 */

import { prisma } from '../db';
import {
  computeTotals,
  resolveScorecard,
  type HoleScoreInput,
} from '../golf/stableford';
import { allocateStrokes } from '../golf/strokes';
import { buildRanking, revealOrder } from '../golf/ranking';
import type {
  CourseSnapshot,
  HoleResult,
  RankingInput,
  RankingRow,
  ScorecardStatus,
  ScorecardTotals,
} from '../golf/types';
import type { RevealState } from '../reveal/controller';
import { initialRevealState } from '../reveal/controller';

export interface CompetitionContext {
  competitionId: string;
  name: string;
  edition: string;
  date: Date | null;
  modality: string;
  teeColor: string;
  category: string;
  allowancePercent: number;
  ruleVersion: string;
  status: 'DRAFT' | 'CONFIGURED' | 'IN_PLAY' | 'CLOSED';
  classificationStatus: 'HIDDEN' | 'REVEALING' | 'PUBLISHED';
  snapshot: CourseSnapshot & { snapshotId: string };
  distances: Map<number, number>;
}

/** Competicion activa con su configuracion de campo confirmada. */
export async function getCompetition(): Promise<CompetitionContext | null> {
  const competition = await prisma.competition.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      courseSnapshots: {
        where: { isActive: true },
        include: { holes: { orderBy: { holeNumber: 'asc' } } },
        take: 1,
      },
    },
  });

  if (!competition) return null;
  const snapshot = competition.courseSnapshots[0];
  if (!snapshot) return null;

  const holes = snapshot.holes.map((hole) => ({
    holeNumber: hole.holeNumber,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    distance: hole.distance,
  }));

  return {
    competitionId: competition.id,
    name: competition.name,
    edition: competition.edition,
    date: competition.date,
    modality: competition.modality,
    teeColor: competition.teeColor,
    category: competition.category,
    allowancePercent: competition.handicapAllowancePercent,
    ruleVersion: competition.handicapRuleVersion,
    status: competition.status,
    classificationStatus: competition.classificationStatus,
    snapshot: {
      snapshotId: snapshot.id,
      teeName: snapshot.teeName,
      category: snapshot.category,
      slopeRating: snapshot.slopeRating,
      courseRatingTenths: snapshot.courseRatingTenths,
      parTotal: snapshot.parTotal,
      distanceTotal: snapshot.distanceTotal,
      holes,
    },
    distances: new Map(holes.map((hole) => [hole.holeNumber, hole.distance])),
  };
}

export interface PlayerScorecard {
  competitionPlayerId: string;
  userId: string;
  displayName: string;
  color: string;
  handicapIndexTenths: number | null;
  playingHandicap: number | null;
  flightId: string | null;
  flightName: string | null;
  teeTime: Date | null;
  scorecardId: string | null;
  status: ScorecardStatus;
  version: number;
  playerConfirmedFinish: boolean;
  reviewedAt: Date | null;
  results: HoleResult[];
  totals: ScorecardTotals;
  overriddenHoles: number[];
}

function buildResults(
  snapshot: CourseSnapshot,
  playingHandicap: number | null,
  holeScores: Array<{
    holeNumber: number;
    grossStrokes: number | null;
    isPickup: boolean;
  }>,
): { results: HoleResult[]; totals: ScorecardTotals } {
  const strokesByHole = new Map(
    allocateStrokes(playingHandicap ?? 0, snapshot.holes).map((a) => [
      a.holeNumber,
      a.strokesReceived,
    ]),
  );
  const inputs = new Map<number, HoleScoreInput>(
    holeScores.map((score) => [
      score.holeNumber,
      {
        holeNumber: score.holeNumber,
        grossStrokes: score.grossStrokes,
        isPickup: score.isPickup,
      },
    ]),
  );
  const results = resolveScorecard(snapshot.holes, strokesByHole, inputs);
  return { results, totals: computeTotals(results) };
}

const PLAYER_INCLUDE = {
  user: { select: { id: true, displayName: true } },
  flightMember: { include: { flight: { select: { id: true, name: true, teeTime: true } } } },
  scorecard: { include: { holes: { orderBy: { holeNumber: 'asc' as const } } } },
} as const;

/** Todas las tarjetas de la competicion, resueltas. */
export async function getAllScorecards(
  context: CompetitionContext,
): Promise<PlayerScorecard[]> {
  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId, isActive: true },
    include: PLAYER_INCLUDE,
  });

  return players.map((player) => {
    const holeScores = player.scorecard?.holes ?? [];
    const { results, totals } = buildResults(
      context.snapshot,
      player.playingHandicap,
      holeScores.map((h) => ({
        holeNumber: h.holeNumber,
        grossStrokes: h.grossStrokes,
        isPickup: h.isPickup,
      })),
    );

    return {
      competitionPlayerId: player.id,
      userId: player.userId,
      displayName: player.user.displayName,
      color: player.color,
      handicapIndexTenths: player.handicapIndexTenths,
      playingHandicap: player.playingHandicap,
      flightId: player.flightMember?.flightId ?? null,
      flightName: player.flightMember?.flight.name ?? null,
      teeTime: player.flightMember?.flight.teeTime ?? null,
      scorecardId: player.scorecard?.id ?? null,
      status: player.scorecard?.status ?? 'NOT_STARTED',
      version: player.scorecard?.version ?? 0,
      playerConfirmedFinish: player.scorecard?.playerConfirmedFinish ?? false,
      reviewedAt: player.scorecard?.reviewedAt ?? null,
      results,
      totals,
      overriddenHoles: holeScores.filter((h) => h.isOverridden).map((h) => h.holeNumber),
    };
  });
}

/** Tarjeta de un jugador concreto. */
export async function getScorecard(
  context: CompetitionContext,
  competitionPlayerId: string,
): Promise<PlayerScorecard | null> {
  const all = await getAllScorecards(context);
  return all.find((card) => card.competitionPlayerId === competitionPlayerId) ?? null;
}

export interface RankingView {
  rows: RankingRow[];
  order: number[][];
  state: RevealState;
}

/** Clasificacion completa mas el estado de la revelacion. */
export async function getRanking(context: CompetitionContext): Promise<RankingView> {
  const cards = await getAllScorecards(context);

  const inputs: RankingInput[] = cards
    .filter((card) => card.handicapIndexTenths !== null && card.playingHandicap !== null)
    .map((card) => ({
      competitionPlayerId: card.competitionPlayerId,
      displayName: card.displayName,
      color: card.color,
      handicapIndexTenths: card.handicapIndexTenths as number,
      playingHandicap: card.playingHandicap as number,
      points: card.totals.total.points,
      numericStrokes: card.totals.total.numericStrokes,
      adjustedStrokes: card.totals.total.adjustedStrokes,
      pickups: card.totals.total.pickups,
      holesCompleted: card.totals.total.holesPlayed,
      scorecardStatus: card.status,
    }));

  const rows = buildRanking(inputs);
  const order = revealOrder(rows);

  const reveal = await prisma.classificationReveal.findUnique({
    where: { competitionId: context.competitionId },
  });

  const state: RevealState = reveal
    ? {
        status: reveal.status,
        snapshotId: reveal.snapshotId,
        snapshotFingerprint: null,
        revealedCount: reveal.revealedCount,
        totalGroups: order.length,
        isPaused: reveal.isPaused,
        nextActionAvailableAt: reveal.nextActionAvailableAt?.getTime() ?? 0,
        publishedAt: reveal.publishedAt?.toISOString() ?? null,
        updatedById: reveal.updatedById,
      }
    : { ...initialRevealState(), totalGroups: order.length };

  return { rows, order, state };
}

export interface FlightView {
  id: string;
  name: string;
  order: number;
  teeTime: Date | null;
  status: string;
  members: Array<{
    competitionPlayerId: string;
    displayName: string;
    handicapIndexTenths: number | null;
    playingHandicap: number | null;
    status: ScorecardStatus;
    holesCompleted: number;
  }>;
}

export async function getFlights(context: CompetitionContext): Promise<FlightView[]> {
  const [flights, cards] = await Promise.all([
    prisma.flight.findMany({
      where: { competitionId: context.competitionId },
      orderBy: { order: 'asc' },
      include: { members: { orderBy: { position: 'asc' } } },
    }),
    getAllScorecards(context),
  ]);

  const byId = new Map(cards.map((card) => [card.competitionPlayerId, card]));

  return flights.map((flight) => ({
    id: flight.id,
    name: flight.name,
    order: flight.order,
    teeTime: flight.teeTime,
    status: flight.status,
    members: flight.members.map((member) => {
      const card = byId.get(member.competitionPlayerId);
      return {
        competitionPlayerId: member.competitionPlayerId,
        displayName: card?.displayName ?? '(desconocido)',
        handicapIndexTenths: card?.handicapIndexTenths ?? null,
        playingHandicap: card?.playingHandicap ?? null,
        status: card?.status ?? 'NOT_STARTED',
        holesCompleted: card?.totals.total.holesPlayed ?? 0,
      };
    }),
  }));
}

/** Lista para el selector del login. Sin datos sensibles. */
export async function getLoginRoster(): Promise<
  Array<{ id: string; firstName: string; lastName: string; displayName: string; normalizedName: string; isActive: boolean }>
> {
  return prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      normalizedName: true,
      isActive: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}

/** Historial de auditoria, mas reciente primero. */
export async function getAuditLog(context: CompetitionContext, take = 200) {
  return prisma.auditLog.findMany({
    where: { competitionId: context.competitionId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { actor: { select: { displayName: true } } },
  });
}
