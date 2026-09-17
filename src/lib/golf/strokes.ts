/**
 * Reparto de golpes por hoyo.
 *
 * Hándicap de juego >= 0 (seccion 29 del pliego):
 *   base      = floor(HJ / 18)
 *   resto     = HJ mod 18
 *   recibidos = base + (strokeIndex <= resto ? 1 : 0)
 *
 * Hándicap de juego < 0 ("plus"): el jugador DEVUELVE golpes. Se asignan en
 * orden inverso empezando por el stroke index 18:
 *   recibidos = -(base + (strokeIndex >= 19 - resto ? 1 : 0))
 *
 * Nota de trazabilidad: el reparto inverso para plus handicaps es la practica
 * estandar del WHS, pero no aparece literalmente en la documentacion publica
 * de RFEG que se ha podido consultar. Esta aislado detras de esta funcion y
 * documentado en docs/handicap-calculation.md para que el administrador pueda
 * revisarlo. Los 13 jugadores de esta edicion no se ven afectados salvo que
 * alguno tenga hándicap plus.
 */

import type { HoleSnapshot, StrokeAllocation } from './types';

export function strokesReceivedOnHole(playingHandicap: number, strokeIndex: number): number {
  if (!Number.isInteger(playingHandicap)) {
    throw new Error('El hándicap de juego debe ser un entero.');
  }
  if (!Number.isInteger(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) {
    throw new Error(`Stroke index fuera de rango 1-18: ${strokeIndex}`);
  }

  if (playingHandicap === 0) return 0;

  const magnitude = Math.abs(playingHandicap);
  const base = Math.floor(magnitude / 18);
  const remainder = magnitude % 18;

  if (playingHandicap > 0) {
    return base + (strokeIndex <= remainder ? 1 : 0);
  }
  // Plus: se empieza a devolver por el SI 18 hacia atras.
  const returned = base + (strokeIndex >= 19 - remainder ? 1 : 0);
  return returned === 0 ? 0 : -returned; // evita -0
}

export function allocateStrokes(
  playingHandicap: number,
  holes: HoleSnapshot[],
): StrokeAllocation[] {
  return holes.map((hole) => ({
    holeNumber: hole.holeNumber,
    strokeIndex: hole.strokeIndex,
    strokesReceived: strokesReceivedOnHole(playingHandicap, hole.strokeIndex),
  }));
}

/** El reparto debe sumar exactamente el hándicap de juego. Invariante verificada en tests. */
export function totalAllocatedStrokes(allocation: StrokeAllocation[]): number {
  return allocation.reduce((sum, a) => sum + a.strokesReceived, 0);
}

/** Etiqueta accesible exigida por la seccion 10. */
export function strokesReceivedLabel(strokesReceived: number): string {
  if (strokesReceived === 0) return 'No recibe golpes en este hoyo';
  if (strokesReceived === 1) return 'Recibe 1 golpe en este hoyo';
  if (strokesReceived > 1) return `Recibe ${strokesReceived} golpes en este hoyo`;
  if (strokesReceived === -1) return 'Devuelve 1 golpe en este hoyo';
  return `Devuelve ${Math.abs(strokesReceived)} golpes en este hoyo`;
}
