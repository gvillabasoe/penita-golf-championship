/**
 * Clasificacion (secciones 45-46).
 *
 * Criterios, en orden:
 *   1. Mas puntos Stableford.
 *   2. Menor hándicap exacto (con todos los decimales almacenados).
 *   3. Menor suma de golpes AJUSTADA.
 *
 * Si persiste el empate tras los tres, se COMPARTE posicion. El orden alfabetico
 * se usa solo para presentar, nunca para romper el empate.
 *
 * ---------------------------------------------------------------------------
 * Por que "ajustada" y no la suma de golpes escritos
 * ---------------------------------------------------------------------------
 * El pliego pedia "menor suma de golpes numericos". Eso tiene un efecto
 * perverso: un hoyo con raya no suma nada, asi que quien levantaba la bola
 * llegaba al desempate con una suma artificialmente baja. Cuanto peor iba un
 * hoyo, mas convenia no terminarlo.
 *
 * La correccion no se ha inventado: los hoyos sin resultado numerico se imputan
 * con las cifras que ya usa el WHS.
 *
 *   - Raya (hoyo empezado y no terminado)  ->  doble bogey neto
 *   - Hoyo no jugado                       ->  par neto
 *
 * El doble bogey neto es exactamente el umbral a partir del cual un hoyo vale 0
 * puntos Stableford. Quien levanta la bola ha hecho al menos eso, asi que
 * contarselo no le regala nada, no le castiga de mas y le quita la ventaja.
 *
 * Cambio autorizado por el organizador el 17/09/2026.
 */

import type { RankingInput, RankingRow } from './types';

const collator = new Intl.Collator('es', { sensitivity: 'base' });

function compareCompetitors(a: RankingInput, b: RankingInput): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.handicapIndexTenths !== b.handicapIndexTenths) {
    return a.handicapIndexTenths - b.handicapIndexTenths;
  }
  if (a.adjustedStrokes !== b.adjustedStrokes) return a.adjustedStrokes - b.adjustedStrokes;
  return 0;
}

function resolvedBy(a: RankingInput, b: RankingInput): RankingRow['resolvedBy'] {
  if (a.points !== b.points) return 'POINTS';
  if (a.handicapIndexTenths !== b.handicapIndexTenths) return 'HANDICAP_INDEX';
  if (a.adjustedStrokes !== b.adjustedStrokes) return 'ADJUSTED_STROKES';
  return 'TIE';
}

export function buildRanking(inputs: RankingInput[]): RankingRow[] {
  const sorted = [...inputs].sort((a, b) => {
    const byCriteria = compareCompetitors(a, b);
    if (byCriteria !== 0) return byCriteria;
    // Solo presentacion: no rompe el empate deportivo.
    return collator.compare(a.displayName, b.displayName);
  });

  const leaderPoints = sorted.length > 0 ? sorted[0].points : 0;

  const rows: RankingRow[] = [];
  let currentPosition = 0;

  sorted.forEach((competitor, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const tiedWithPrevious = previous !== null && compareCompetitors(previous, competitor) === 0;

    if (!tiedWithPrevious) currentPosition = index + 1;

    /**
     * Nota informativa, no un aviso de problema: el desempate ya es justo. Se
     * emite solo cuando se decidio con golpes imputados, para que se pueda
     * explicar en la entrega de premios sin tener que reconstruirlo.
     */
    let note: string | null = null;
    if (
      previous !== null &&
      resolvedBy(previous, competitor) === 'ADJUSTED_STROKES' &&
      (previous.pickups > 0 || competitor.pickups > 0)
    ) {
      note =
        'Desempate por golpes ajustados: las rayas se han contado como doble bogey neto.';
    }

    rows.push({
      ...competitor,
      position: currentPosition,
      isSharedPosition: false,
      resolvedBy: index === 0 ? 'LEADER' : resolvedBy(previous as RankingInput, competitor),
      tieBreakNote: note,
      progressPercent:
        leaderPoints > 0 ? Math.round((competitor.points / leaderPoints) * 100) : 0,
    });
  });

  // Marca las posiciones compartidas (1, 2, 2, 4).
  const counts = new Map<number, number>();
  rows.forEach((r) => counts.set(r.position, (counts.get(r.position) ?? 0) + 1));
  rows.forEach((r) => {
    r.isSharedPosition = (counts.get(r.position) ?? 0) > 1;
  });

  return rows;
}

/**
 * Orden de revelacion (seccion 49): ultima, penultima, resto ascendente hasta la
 * cuarta, y despues tercera, segunda, primera.
 *
 * Con N posiciones devuelve los indices de `ranking` en el orden en que deben
 * aparecer. Las posiciones compartidas se revelan juntas (mismo paso).
 */
export function revealOrder(ranking: RankingRow[]): number[][] {
  if (ranking.length === 0) return [];

  const groups = new Map<number, number[]>();
  ranking.forEach((row, index) => {
    const bucket = groups.get(row.position) ?? [];
    bucket.push(index);
    groups.set(row.position, bucket);
  });

  const positionsDesc = [...groups.keys()].sort((a, b) => b - a);
  const podium = positionsDesc.filter((p) => p <= 3).sort((a, b) => b - a);
  const rest = positionsDesc.filter((p) => p > 3);

  return [...rest, ...podium].map((p) => groups.get(p) as number[]);
}

/** Snapshot inmutable de la clasificacion, para la revelacion (seccion 48). */
export function rankingFingerprint(ranking: RankingRow[]): string {
  const payload = ranking
    .map(
      (r) =>
        `${r.position}:${r.competitionPlayerId}:${r.points}:${r.handicapIndexTenths}:${r.adjustedStrokes}`,
    )
    .join('|');
  // Hash determinista simple (FNV-1a 32 bits). Solo detecta cambios, no es
  // criptografico: basta para invalidar un snapshot desactualizado.
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
