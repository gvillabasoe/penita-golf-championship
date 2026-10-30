/**
 * Clasificacion paralela por parejas.
 *
 * Ninguna tarjeta nueva se almacena: los resultados de pareja se derivan de
 * las dos tarjetas individuales. Asi una correccion administrativa en un hoyo
 * recalcula inmediatamente tanto la clasificacion individual como la de pareja
 * y no puede quedar una copia desincronizada.
 */

import { computeTotals } from './stableford';
import type {
  HoleResult,
  RankingRow,
  ScorecardStatus,
  ScorecardTotals,
} from './types';

export const PAIR_SCORING_MODES = ['BEST_BALL', 'COMBINED_POINTS'] as const;
export type PairScoringMode = (typeof PAIR_SCORING_MODES)[number];

export const PAIR_SCORING_LABELS: Record<PairScoringMode, string> = {
  BEST_BALL: 'Dobles · mejor bola Stableford',
  COMBINED_POINTS: 'Suma de puntos individuales',
};

export function isPairScoringMode(value: unknown): value is PairScoringMode {
  return typeof value === 'string' && PAIR_SCORING_MODES.includes(value as PairScoringMode);
}

export interface PairMemberScore {
  competitionPlayerId: string;
  displayName: string;
  color: string;
  handicapIndexTenths: number | null;
  playingHandicap: number | null;
  status: ScorecardStatus;
  results: HoleResult[];
  totals: ScorecardTotals;
}

export interface BestBallSource {
  holeNumber: number;
  competitionPlayerId: string;
  displayName: string;
  shortLabel: string;
  color: string;
}

export interface PairScore {
  pairNumber: number;
  displayName: string;
  members: PairMemberScore[];
  colors: string[];
  scoringMode: PairScoringMode;
  /** Suma de los hándicaps exactos. null si falta el de algun integrante. */
  handicapIndexTenths: number | null;
  /** Suma de los hándicaps de juego. null si falta el de algun integrante. */
  playingHandicap: number | null;
  points: number;
  numericStrokes: number;
  adjustedStrokes: number;
  pickups: number;
  holesCompleted: number;
  holesAvailable: number;
  /** Solo existe en mejor bola: la tarjeta unica derivada hoyo a hoyo. */
  results: HoleResult[] | null;
  totals: ScorecardTotals | null;
  sources: BestBallSource[];
  /** Una pareja sin dos HCP completos se muestra, pero no entra en el ranking. */
  isEligible: boolean;
}

export interface PairRankingRow extends PairScore {
  position: number;
  isSharedPosition: boolean;
  resolvedBy: RankingRow['resolvedBy'];
  progressPercent: number;
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });

function hasResult(result: HoleResult): boolean {
  return result.grossStrokes !== null || result.isPickup;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const chosen = parts.length === 1 ? parts : [parts[0], parts[parts.length - 1]];
  return chosen
    .map((part) => part.slice(0, 1).toLocaleUpperCase('es'))
    .join('');
}

/**
 * Decide que resultado cuenta en un hoyo de mejor bola.
 *
 * Primero compara puntos Stableford, que ya incorporan los golpes recibidos.
 * Los criterios posteriores solo deciden que tarjeta se representa cuando los
 * puntos son iguales; nunca cambian la puntuacion de la pareja.
 */
function betterHole(
  left: { member: PairMemberScore; result: HoleResult },
  right: { member: PairMemberScore; result: HoleResult },
) {
  const leftPlayed = hasResult(left.result);
  const rightPlayed = hasResult(right.result);
  if (leftPlayed !== rightPlayed) return leftPlayed ? left : right;
  if (!leftPlayed && !rightPlayed) return null;

  if (left.result.stablefordPoints !== right.result.stablefordPoints) {
    return left.result.stablefordPoints > right.result.stablefordPoints ? left : right;
  }

  const leftNet = left.result.netStrokes ?? Number.POSITIVE_INFINITY;
  const rightNet = right.result.netStrokes ?? Number.POSITIVE_INFINITY;
  if (leftNet !== rightNet) return leftNet < rightNet ? left : right;

  const leftGross = left.result.grossStrokes ?? Number.POSITIVE_INFINITY;
  const rightGross = right.result.grossStrokes ?? Number.POSITIVE_INFINITY;
  if (leftGross !== rightGross) return leftGross < rightGross ? left : right;

  return collator.compare(left.member.displayName, right.member.displayName) <= 0 ? left : right;
}

function blankBestBallHole(template: HoleResult): HoleResult {
  return {
    holeNumber: template.holeNumber,
    par: template.par,
    strokeIndex: template.strokeIndex,
    // Hasta que alguien juega el hoyo no hay un jugador elegido y, por tanto,
    // tampoco un reparto de golpes que representar en la tarjeta de pareja.
    strokesReceived: 0,
    grossStrokes: null,
    isPickup: false,
    netStrokes: null,
    grossToPar: null,
    netToPar: null,
    stablefordPoints: 0,
    grossCategory: 'PICKUP',
  };
}

export function buildBestBall(
  members: readonly [PairMemberScore, PairMemberScore],
): { results: HoleResult[]; totals: ScorecardTotals; sources: BestBallSource[] } {
  const byMember = members.map((member) => ({
    member,
    byHole: new Map(member.results.map((result) => [result.holeNumber, result])),
  }));
  const template = members[0].results;
  const sources: BestBallSource[] = [];

  const results = template.map((hole) => {
    const left = byMember[0].byHole.get(hole.holeNumber) ?? hole;
    const right = byMember[1].byHole.get(hole.holeNumber) ?? hole;
    const selected = betterHole(
      { member: byMember[0].member, result: left },
      { member: byMember[1].member, result: right },
    );

    if (!selected) return blankBestBallHole(hole);

    sources.push({
      holeNumber: hole.holeNumber,
      competitionPlayerId: selected.member.competitionPlayerId,
      displayName: selected.member.displayName,
      shortLabel: initials(selected.member.displayName),
      color: selected.member.color,
    });
    return { ...selected.result };
  });

  return { results, totals: computeTotals(results), sources };
}

function sumNullable(values: Array<number | null>): number | null {
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value as number), 0)
    : null;
}

export function buildPairScore(
  pairNumber: number,
  rawMembers: PairMemberScore[],
  scoringMode: PairScoringMode,
): PairScore {
  const members = [...rawMembers].sort((a, b) => collator.compare(a.displayName, b.displayName));
  const complete = members.length === 2;
  const handicapIndexTenths = sumNullable(members.map((member) => member.handicapIndexTenths));
  const playingHandicap = sumNullable(members.map((member) => member.playingHandicap));

  let results: HoleResult[] | null = null;
  let totals: ScorecardTotals | null = null;
  let sources: BestBallSource[] = [];

  if (complete && scoringMode === 'BEST_BALL') {
    const bestBall = buildBestBall(members as [PairMemberScore, PairMemberScore]);
    results = bestBall.results;
    totals = bestBall.totals;
    sources = bestBall.sources;
  }

  const points =
    scoringMode === 'BEST_BALL'
      ? totals?.total.points ?? 0
      : members.reduce((sum, member) => sum + member.totals.total.points, 0);
  const numericStrokes =
    scoringMode === 'BEST_BALL'
      ? totals?.total.numericStrokes ?? 0
      : members.reduce((sum, member) => sum + member.totals.total.numericStrokes, 0);
  const adjustedStrokes =
    scoringMode === 'BEST_BALL'
      ? totals?.total.adjustedStrokes ?? 0
      : members.reduce((sum, member) => sum + member.totals.total.adjustedStrokes, 0);
  const pickups =
    scoringMode === 'BEST_BALL'
      ? totals?.total.pickups ?? 0
      : members.reduce((sum, member) => sum + member.totals.total.pickups, 0);
  const holesCompleted =
    scoringMode === 'BEST_BALL'
      ? totals?.total.holesPlayed ?? 0
      : members.reduce((sum, member) => sum + member.totals.total.holesPlayed, 0);

  return {
    pairNumber,
    displayName: members.map((member) => member.displayName).join(' / ') || `Pareja ${pairNumber}`,
    members,
    colors: members.map((member) => member.color),
    scoringMode,
    handicapIndexTenths,
    playingHandicap,
    points,
    numericStrokes,
    adjustedStrokes,
    pickups,
    holesCompleted,
    holesAvailable: scoringMode === 'BEST_BALL' ? 18 : members.length * 18,
    results,
    totals,
    sources,
    isEligible:
      complete &&
      handicapIndexTenths !== null &&
      playingHandicap !== null &&
      members.every((member) => member.results.length === 18),
  };
}

function comparePairs(a: PairScore, b: PairScore): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.handicapIndexTenths !== b.handicapIndexTenths) {
    return (a.handicapIndexTenths as number) - (b.handicapIndexTenths as number);
  }
  if (a.adjustedStrokes !== b.adjustedStrokes) return a.adjustedStrokes - b.adjustedStrokes;
  return 0;
}

function pairResolvedBy(a: PairScore, b: PairScore): RankingRow['resolvedBy'] {
  if (a.points !== b.points) return 'POINTS';
  if (a.handicapIndexTenths !== b.handicapIndexTenths) return 'HANDICAP_INDEX';
  if (a.adjustedStrokes !== b.adjustedStrokes) return 'ADJUSTED_STROKES';
  return 'TIE';
}

export function buildPairRanking(scores: PairScore[]): PairRankingRow[] {
  const sorted = scores
    .filter((score) => score.isEligible)
    .sort((a, b) => comparePairs(a, b) || collator.compare(a.displayName, b.displayName));
  const leaderPoints = sorted[0]?.points ?? 0;
  const rows: PairRankingRow[] = [];
  let currentPosition = 0;

  sorted.forEach((score, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const tied = previous !== null && comparePairs(previous, score) === 0;
    if (!tied) currentPosition = index + 1;

    rows.push({
      ...score,
      position: currentPosition,
      isSharedPosition: false,
      resolvedBy: index === 0 ? 'LEADER' : pairResolvedBy(previous as PairScore, score),
      progressPercent: leaderPoints > 0 ? Math.round((score.points / leaderPoints) * 100) : 0,
    });
  });

  const counts = new Map<number, number>();
  rows.forEach((row) => counts.set(row.position, (counts.get(row.position) ?? 0) + 1));
  rows.forEach((row) => {
    row.isSharedPosition = (counts.get(row.position) ?? 0) > 1;
  });

  return rows;
}
