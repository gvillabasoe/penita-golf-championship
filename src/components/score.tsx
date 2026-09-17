/**
 * Celdas de resultado (secciones 33 y 34).
 *
 * Regla que gobierna estos dos componentes: **la forma es la que informa**, no el
 * color. Circulo = bajo par, cuadrado = sobre par, nada = par. Un daltonico
 * distingue circulo de cuadrado, y el lector de pantalla lee la etiqueta
 * completa. El color solo acompana.
 *
 * Fondos siempre opacos: son informacion critica y no llevan cristal.
 */

import { resultLabel } from '@/lib/golf/stableford';
import type { GrossCategory, HoleResult } from '@/lib/golf/types';

const GROSS_CLASS: Record<GrossCategory, string> = {
  HOLE_IN_ONE: 'score-number--hole-in-one',
  ALBATROS: 'score-number--albatros',
  EAGLE: 'score-number--eagle',
  BIRDIE: 'score-number--birdie',
  PAR: 'score-number--par',
  BOGEY: 'score-number--bogey',
  DOUBLE_BOGEY: 'score-number--double',
  TRIPLE_BOGEY_OR_WORSE: 'score-number--triple',
  PICKUP: 'score-number--pickup',
};

export interface ScoreNumberProps {
  result: HoleResult;
  /** Tamano compacto para las vistas de resumen. */
  compact?: boolean;
}

export function ScoreNumber({ result, compact = false }: ScoreNumberProps) {
  const label = resultLabel(result);

  return (
    <span
      className={`score-number ${GROSS_CLASS[result.grossCategory]}${compact ? ' score-number--compact' : ''}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {result.isPickup || result.grossStrokes === null ? '\u2014' : result.grossStrokes}
    </span>
  );
}

export interface PointsCellProps {
  points: number;
  isPickup: boolean;
  /** Muestra el numero incluso cuando el hoyo no se ha jugado. */
  hasResult: boolean;
}

export function PointsCell({ points, isPickup, hasResult }: PointsCellProps) {
  if (!hasResult) {
    return (
      <span className="points-cell points-cell--empty" aria-label="Hoyo sin jugar">
        {'\u00b7'}
      </span>
    );
  }

  const label = isPickup
    ? 'Raya, 0 puntos Stableford'
    : `${points} ${points === 1 ? 'punto' : 'puntos'} Stableford`;

  return (
    <span
      className={`points-cell points-cell--${points}${isPickup ? ' points-cell--pickup' : ''}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {points}
    </span>
  );
}

export interface StrokesReceivedDotsProps {
  strokesReceived: number;
}

/**
 * Golpes recibidos en el hoyo. Se dibujan como puntos y ademas se escribe el
 * numero: la seccion 11 exige que los golpes recibidos sean visibles en cada
 * hoyo, y contar puntos al sol con guante puesto no es fiable.
 */
export function StrokesReceivedDots({ strokesReceived }: StrokesReceivedDotsProps) {
  if (strokesReceived === 0) {
    return (
      <span className="strokes-received strokes-received--none" aria-label="No recibe golpes">
        {'\u2013'}
      </span>
    );
  }

  const giving = strokesReceived < 0;
  const count = Math.abs(strokesReceived);
  const label = giving
    ? `Devuelve ${count} ${count === 1 ? 'golpe' : 'golpes'}`
    : `Recibe ${count} ${count === 1 ? 'golpe' : 'golpes'}`;

  return (
    <span
      className={`strokes-received${giving ? ' strokes-received--giving' : ''}`}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{giving ? '\u2212' : ''}{'\u2022'.repeat(count)}</span>
      <span className="strokes-received__count" aria-hidden="true">
        {giving ? `-${count}` : `+${count}`}
      </span>
    </span>
  );
}
