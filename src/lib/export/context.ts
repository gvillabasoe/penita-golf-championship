/**
 * Puente entre la base de datos y los documentos del torneo.
 *
 * Las rutas de exportacion reciben estructuras deliberadamente pequenas y
 * estables. De este modo, el sistema PDF no conoce Prisma ni repite el mapeo
 * de jugadores, partidos y parejas en cada endpoint.
 */

import type {
  CompetitionContext,
  FlightView,
  PlayerScorecard,
} from '../data/queries';
import type {
  CompetitionHeader,
  FlightDrawDocument,
  LeaderboardExportRow,
  PairLeaderboardExportRow,
  PairScorecardDocument,
  ScorecardDocument,
  ScorecardPdfPlayer,
} from './pdf';
import type { PairRankingRow, PairScore } from '../golf/pairs';
import type { RankingRow } from '../golf/types';

export function toExportHeader(context: CompetitionContext): CompetitionHeader {
  return {
    name: context.name,
    edition: context.edition,
    courseName: 'Club de Golf Ulzama',
    routeName: 'Ulzama',
    teeColor: context.teeColor,
    category: context.category,
    modality: context.modality,
    date: context.date?.toISOString() ?? null,
    slopeRating: context.snapshot.slopeRating,
    courseRatingTenths: context.snapshot.courseRatingTenths,
    parTotal: context.snapshot.parTotal,
    handicapAllowancePercent: context.allowancePercent,
    handicapRuleVersion: context.ruleVersion,
  };
}

export function toExportRows(rows: RankingRow[]): LeaderboardExportRow[] {
  return rows.map((row) => ({
    position: row.position,
    isSharedPosition: row.isSharedPosition,
    displayName: row.displayName,
    color: row.color,
    handicapIndexTenths: row.handicapIndexTenths,
    playingHandicap: row.playingHandicap,
    points: row.points,
    numericStrokes: row.numericStrokes,
    adjustedStrokes: row.adjustedStrokes,
    pickups: row.pickups,
    holesCompleted: row.holesCompleted,
    progressPercent: row.progressPercent,
  }));
}

export function toPairExportRows(rows: PairRankingRow[]): PairLeaderboardExportRow[] {
  return rows.map((row) => ({
    pairNumber: row.pairNumber,
    position: row.position,
    isSharedPosition: row.isSharedPosition,
    displayName: row.displayName,
    colors: row.colors,
    scoringMode: row.scoringMode,
    isSolo: row.isSolo,
    handicapIndexTenths: row.handicapIndexTenths ?? 0,
    playingHandicap: row.playingHandicap ?? 0,
    points: row.points,
    numericStrokes: row.numericStrokes,
    adjustedStrokes: row.adjustedStrokes,
    pickups: row.pickups,
    holesCompleted: row.holesCompleted,
    holesAvailable: row.holesAvailable,
    progressPercent: row.progressPercent,
  }));
}

export function toScorecardPlayer(card: PlayerScorecard): ScorecardPdfPlayer {
  return {
    displayName: card.displayName,
    color: card.color,
    handicapIndexTenths: card.handicapIndexTenths ?? 0,
    playingHandicap: card.playingHandicap ?? 0,
    flightName: card.flightName,
    teeTime: card.teeTime?.toISOString() ?? null,
    status: card.status,
  };
}

export function toScorecardDocument(card: PlayerScorecard): ScorecardDocument {
  return {
    player: toScorecardPlayer(card),
    results: card.results,
    totals: card.totals,
  };
}

export function toFlightDrawDocuments(flights: FlightView[]): FlightDrawDocument[] {
  return flights.map((flight) => ({
    id: flight.id,
    name: flight.name,
    order: flight.order,
    teeTime: flight.teeTime?.toISOString() ?? null,
    status: flight.status,
    members: flight.members.map((member) => ({
      competitionPlayerId: member.competitionPlayerId,
      displayName: member.displayName,
      color: member.color,
      handicapIndexTenths: member.handicapIndexTenths,
      playingHandicap: member.playingHandicap,
      knowsCourse: member.knowsCourse,
    })),
  }));
}

/**
 * Une las parejas derivadas con el nombre del partido de cada integrante.
 * Ese dato no interviene en el calculo deportivo, pero permite acreditar en el
 * documento que los dos miembros proceden de partidos distintos.
 */
export function toPairScorecardDocuments(
  pairs: PairScore[],
  cards: PlayerScorecard[],
): PairScorecardDocument[] {
  const flightByPlayer = new Map(
    cards.map((card) => [card.competitionPlayerId, card.flightName] as const),
  );

  return pairs.map((pair) => ({
    pairNumber: pair.pairNumber,
    displayName: pair.displayName,
    colors: pair.colors,
    scoringMode: pair.scoringMode,
    isSolo: pair.isSolo,
    handicapIndexTenths: pair.handicapIndexTenths,
    playingHandicap: pair.playingHandicap,
    points: pair.points,
    members: pair.members.map((member) => ({
      competitionPlayerId: member.competitionPlayerId,
      displayName: member.displayName,
      color: member.color,
      handicapIndexTenths: member.handicapIndexTenths,
      playingHandicap: member.playingHandicap,
      flightName: flightByPlayer.get(member.competitionPlayerId) ?? null,
      status: member.status,
      results: member.results,
      totals: member.totals,
    })),
    results: pair.results,
    totals: pair.totals,
    sources: pair.sources,
  }));
}
