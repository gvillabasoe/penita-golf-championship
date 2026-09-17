/**
 * Logica Stableford y categorias de resultado bruto (secciones 31-33 y 37).
 *
 * Puntos: clamp(2 - netToPar, 0, 5). Raya -> 0. Tope 5 puntos en esta edicion.
 * La categoria visual del BRUTO nunca depende de los golpes recibidos.
 */

import { clamp } from './decimal';
import type {
  GrossCategory,
  HoleResult,
  HoleSnapshot,
  ScorecardTotals,
  ScorecardStatus,
} from './types';

export const MAX_STABLEFORD_POINTS = 5;

/**
 * Doble bogey neto: el tope que el WHS fija para un hoyo empezado y no
 * terminado. Es exactamente el umbral a partir del cual el hoyo vale 0 puntos.
 *
 * Se usa para imputar una raya en el desempate: quien levanta la bola ha hecho
 * AL MENOS esto, asi que contarle esta cifra no le regala nada ni le castiga de
 * mas, y elimina la ventaja de no terminar el hoyo.
 */
export function netDoubleBogey(par: number, strokesReceived: number): number {
  return par + 2 + strokesReceived;
}

/**
 * Par neto: lo que el WHS asigna a un hoyo NO jugado, que es distinto de un hoyo
 * empezado y abandonado. Solo aparece en clasificaciones provisionales, con la
 * vuelta a medias.
 */
export function netPar(par: number, strokesReceived: number): number {
  return par + strokesReceived;
}
export const MIN_GROSS_STROKES = 1;
export const MAX_GROSS_STROKES = 9; // teclado del jugador: 1-9 y raya

export function stablefordPoints(netToPar: number): number {
  if (!Number.isInteger(netToPar)) throw new Error('netToPar debe ser entero.');
  return clamp(2 - netToPar, 0, MAX_STABLEFORD_POINTS);
}

export function grossCategory(grossStrokes: number | null, par: number): GrossCategory {
  if (grossStrokes === null) return 'PICKUP';
  if (grossStrokes === 1) return 'HOLE_IN_ONE';
  const toPar = grossStrokes - par;
  if (toPar <= -3) return 'ALBATROS';
  if (toPar === -2) return 'EAGLE';
  if (toPar === -1) return 'BIRDIE';
  if (toPar === 0) return 'PAR';
  if (toPar === 1) return 'BOGEY';
  if (toPar === 2) return 'DOUBLE_BOGEY';
  return 'TRIPLE_BOGEY_OR_WORSE';
}

const GROSS_LABELS: Record<GrossCategory, string> = {
  HOLE_IN_ONE: 'Hoyo en uno',
  ALBATROS: 'Albatros',
  EAGLE: 'Eagle',
  BIRDIE: 'Birdie',
  PAR: 'Par',
  BOGEY: 'Bogey',
  DOUBLE_BOGEY: 'Doble bogey',
  TRIPLE_BOGEY_OR_WORSE: 'Triple bogey o peor',
  PICKUP: 'Raya',
};

/** Etiqueta accesible: "Birdie, 3 golpes" / "Raya, 0 puntos". */
export function resultLabel(result: HoleResult): string {
  const name = GROSS_LABELS[result.grossCategory];
  if (result.isPickup) return `${name}, sin puntuacion`;
  return `${name}, ${result.grossStrokes} golpes, ${result.stablefordPoints} puntos Stableford`;
}

export interface HoleScoreInput {
  holeNumber: number;
  /** null cuando hay raya. */
  grossStrokes: number | null;
  isPickup: boolean;
}

export function resolveHole(
  hole: HoleSnapshot,
  strokesReceived: number,
  input: HoleScoreInput | undefined,
): HoleResult {
  const base = {
    holeNumber: hole.holeNumber,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    strokesReceived,
  };

  if (!input || (input.grossStrokes === null && !input.isPickup)) {
    // Hoyo sin jugar: no es raya, simplemente no hay resultado.
    return {
      ...base,
      grossStrokes: null,
      isPickup: false,
      netStrokes: null,
      grossToPar: null,
      netToPar: null,
      stablefordPoints: 0,
      grossCategory: 'PICKUP',
    };
  }

  if (input.isPickup) {
    return {
      ...base,
      grossStrokes: null,
      isPickup: true,
      netStrokes: null,
      grossToPar: null,
      netToPar: null,
      stablefordPoints: 0,
      grossCategory: 'PICKUP',
    };
  }

  const gross = input.grossStrokes as number;
  if (!Number.isInteger(gross) || gross < MIN_GROSS_STROKES) {
    throw new Error(`Golpes brutos no validos en el hoyo ${hole.holeNumber}: ${gross}`);
  }

  const netStrokes = gross - strokesReceived;
  const netToPar = netStrokes - hole.par;

  return {
    ...base,
    grossStrokes: gross,
    isPickup: false,
    netStrokes,
    grossToPar: gross - hole.par,
    netToPar,
    stablefordPoints: stablefordPoints(netToPar),
    grossCategory: grossCategory(gross, hole.par),
  };
}

export function resolveScorecard(
  holes: HoleSnapshot[],
  strokesByHole: Map<number, number>,
  inputs: Map<number, HoleScoreInput>,
): HoleResult[] {
  return holes.map((hole) =>
    resolveHole(hole, strokesByHole.get(hole.holeNumber) ?? 0, inputs.get(hole.holeNumber)),
  );
}

function sumRange(results: HoleResult[], from: number, to: number) {
  const slice = results.filter((r) => r.holeNumber >= from && r.holeNumber <= to);
  return {
    numericStrokes: slice.reduce((s, r) => s + (r.grossStrokes ?? 0), 0),
    adjustedStrokes: slice.reduce((s, r) => {
      if (r.grossStrokes !== null) return s + r.grossStrokes;
      if (r.isPickup) return s + netDoubleBogey(r.par, r.strokesReceived);
      return s + netPar(r.par, r.strokesReceived);
    }, 0),
    imputedHoles: slice.filter((r) => r.grossStrokes === null).length,
    points: slice.reduce((s, r) => s + r.stablefordPoints, 0),
    holesPlayed: slice.filter((r) => r.grossStrokes !== null || r.isPickup).length,
    pickups: slice.filter((r) => r.isPickup).length,
  };
}

export function computeTotals(results: HoleResult[]): ScorecardTotals {
  const out = sumRange(results, 1, 9);
  const inn = sumRange(results, 10, 18);
  const holesPlayed = out.holesPlayed + inn.holesPlayed;
  const pickups = out.pickups + inn.pickups;
  const isGrossComplete = holesPlayed === results.length && pickups === 0;

  return {
    out,
    in: inn,
    total: {
      numericStrokes: out.numericStrokes + inn.numericStrokes,
      adjustedStrokes: out.adjustedStrokes + inn.adjustedStrokes,
      imputedHoles: out.imputedHoles + inn.imputedHoles,
      points: out.points + inn.points,
      holesPlayed,
      pickups,
      grossToPar: isGrossComplete
        ? results.reduce((s, r) => s + (r.grossToPar ?? 0), 0)
        : null,
      isGrossComplete,
    },
  };
}

/**
 * Estado derivado de la tarjeta. `FINISHED` exige confirmacion explicita del
 * jugador, por eso se recibe como parametro: 18 resultados no bastan.
 */
export function deriveStatus(
  results: HoleResult[],
  playerConfirmedFinish: boolean,
  reviewed: boolean,
  locked: boolean,
): ScorecardStatus {
  if (locked) return 'LOCKED';
  const played = results.filter((r) => r.grossStrokes !== null || r.isPickup).length;
  if (played === 0) return 'NOT_STARTED';
  if (played < results.length) return 'IN_PLAY';
  if (!playerConfirmedFinish) return 'IN_PLAY';
  return reviewed ? 'REVIEWED' : 'FINISHED';
}

export function canFinish(results: HoleResult[]): { ok: boolean; missingHoles: number[] } {
  const missingHoles = results
    .filter((r) => r.grossStrokes === null && !r.isPickup)
    .map((r) => r.holeNumber);
  return { ok: missingHoles.length === 0, missingHoles };
}

/** Resultado que merece confirmacion adicional (seccion 44), sin bloquearlo. */
export function isUnusualResult(result: HoleResult): boolean {
  if (result.isPickup || result.grossStrokes === null) return false;
  if (result.grossStrokes === 1) return true; // hoyo en uno
  if (result.grossToPar !== null && result.grossToPar <= -2) return true; // eagle o mejor
  if (result.grossToPar !== null && result.grossToPar >= 4) return true; // +4 o peor
  return false;
}
