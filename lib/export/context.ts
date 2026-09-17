/**
 * Puente entre la base de datos y las exportaciones.
 *
 * Existe para que las rutas de exportacion no repitan el mapeo cuatro veces.
 */

import type { CompetitionContext, PlayerScorecard } from '../data/queries';
import type { CompetitionHeader, LeaderboardExportRow } from './pdf';
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
    handicapIndexTenths: row.handicapIndexTenths,
    playingHandicap: row.playingHandicap,
    points: row.points,
    numericStrokes: row.numericStrokes,
    adjustedStrokes: row.adjustedStrokes,
    pickups: row.pickups,
  }));
}

export function toScorecardPlayer(card: PlayerScorecard) {
  return {
    displayName: card.displayName,
    handicapIndexTenths: card.handicapIndexTenths ?? 0,
    playingHandicap: card.playingHandicap ?? 0,
    flightName: card.flightName,
    teeTime: card.teeTime?.toISOString() ?? null,
  };
}
