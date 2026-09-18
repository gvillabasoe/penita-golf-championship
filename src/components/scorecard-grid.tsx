'use client';

/**
 * Tarjeta completa en rejilla.
 *
 * ---------------------------------------------------------------------------
 * Por que una rejilla CSS y no una tabla
 * ---------------------------------------------------------------------------
 * A 320 px una tabla de 18 columnas es ilegible, y encogerla hasta que quepa
 * deja numeros de 9 px que no se leen al sol. La referencia resuelve esto
 * partiendo la vuelta en dos mitades, y eso es lo que hace este componente: un
 * control segmentado entre Ida, Vuelta y Total, con nueve hoyos por vista.
 *
 * La rejilla permite ademas fijar la columna de etiquetas (PAR, SI, GOLPES,
 * BRUTO, PUNTOS) mientras solo se desplaza la zona de hoyos, y ese
 * desplazamiento se queda DENTRO del bloque: la pagina nunca tiene scroll
 * horizontal.
 *
 * Lo que no se pierde por no ser una tabla es la semantica: el marcado lleva
 * `role="table"`, `role="row"`, `role="columnheader"` y `role="cell"`, con sus
 * etiquetas, asi que un lector de pantalla lo recorre como la tabla que
 * conceptualmente es.
 *
 * Los resultados conservan sus formas deportivas y el significado de siempre:
 * circulo bajo par, cuadrado sobre par, raya para la bola levantada. Solo han
 * cambiado el color y el grosor del contorno.
 */

import { useState } from 'react';

import { PointsCell, ScoreNumber } from './score';
import type { HoleResult, ScorecardTotals } from '@/lib/golf/types';

type View = 'OUT' | 'IN' | 'TOTAL';

const VIEWS: Array<{ id: View; label: string; from: number; to: number }> = [
  { id: 'OUT', label: 'Ida', from: 1, to: 9 },
  { id: 'IN', label: 'Vuelta', from: 10, to: 18 },
  { id: 'TOTAL', label: 'Total', from: 1, to: 18 },
];

export interface ScorecardGridProps {
  results: HoleResult[];
  distances: Map<number, number>;
  totals: ScorecardTotals;
  /** Nombre del jugador, para la etiqueta accesible de la tabla. */
  playerName?: string;
  /** Vista inicial. */
  initialView?: View;
}

export function ScorecardGrid({
  results,
  distances,
  totals,
  playerName,
  initialView = 'OUT',
}: ScorecardGridProps) {
  const [view, setView] = useState<View>(initialView);
  const current = VIEWS.find((candidate) => candidate.id === view) ?? VIEWS[0];

  const holes = results.filter(
    (result) => result.holeNumber >= current.from && result.holeNumber <= current.to,
  );

  const summary =
    view === 'OUT' ? totals.out : view === 'IN' ? totals.in : totals.total;

  const totalLabel = view === 'OUT' ? 'IDA' : view === 'IN' ? 'VTA' : 'TOT';
  const isFull = view === 'TOTAL';

  const parTotal = holes.reduce((sum, hole) => sum + hole.par, 0);
  const strokesTotal = holes.reduce((sum, hole) => sum + hole.strokesReceived, 0);

  /** Una fila de la rejilla. */
  const row = (
    key: string,
    label: string,
    ariaLabel: string,
    cell: (result: HoleResult) => React.ReactNode,
    total: React.ReactNode,
    extraClass = '',
  ) => (
    <div className={`scorecard-grid__row${extraClass}`} role="row" key={key}>
      <span
        className="scorecard-grid__cell scorecard-grid__label"
        role="rowheader"
        aria-label={ariaLabel}
      >
        {label}
      </span>
      {holes.map((result) => (
        <span className="scorecard-grid__cell" role="cell" key={result.holeNumber}>
          {cell(result)}
        </span>
      ))}
      <span className="scorecard-grid__cell scorecard-grid__total data" role="cell">
        {total}
      </span>
    </div>
  );

  return (
    <div className="scorecard-grid">
      <div
        className="segmented"
        role="group"
        aria-label="Parte de la vuelta que se muestra"
      >
        {VIEWS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className="segmented__option"
            aria-pressed={view === candidate.id}
            onClick={() => setView(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="scorecard-grid__scroll">
        <div
          className={`scorecard-grid__table${isFull ? ' scorecard-grid__table--full' : ''}`}
          role="table"
          aria-label={
            playerName
              ? `Tarjeta de ${playerName}, ${current.label.toLowerCase()}`
              : `Tarjeta, ${current.label.toLowerCase()}`
          }
        >
          {/* Cabecera: numero de hoyo. */}
          <div className="scorecard-grid__row" role="row">
            <span
              className="scorecard-grid__cell scorecard-grid__label scorecard-grid__head"
              role="columnheader"
            >
              Hoyo
            </span>
            {holes.map((result) => (
              <span
                className="scorecard-grid__cell scorecard-grid__head data"
                role="columnheader"
                key={result.holeNumber}
              >
                {result.holeNumber}
              </span>
            ))}
            <span
              className="scorecard-grid__cell scorecard-grid__head scorecard-grid__total"
              role="columnheader"
            >
              {totalLabel}
            </span>
          </div>

          {row('par', 'Par', 'Par del hoyo', (result) => result.par, parTotal)}

          {row(
            'si',
            'SI',
            'Stroke index',
            (result) => result.strokeIndex,
            '',
          )}

          {row(
            'dist',
            'Metros',
            'Distancia en metros',
            (result) => distances.get(result.holeNumber) ?? '\u00b7',
            holes.reduce((sum, hole) => sum + (distances.get(hole.holeNumber) ?? 0), 0),
          )}

          {row(
            'recibidos',
            'Golpes',
            'Golpes recibidos',
            (result) =>
              result.strokesReceived === 0 ? (
                <span aria-hidden="true">{'\u00b7'}</span>
              ) : (
                result.strokesReceived
              ),
            strokesTotal,
          )}

          {row(
            'bruto',
            'Bruto',
            'Resultado bruto',
            (result) => <ScoreNumber result={result} compact />,
            summary.numericStrokes,
          )}

          {row(
            'puntos',
            'Puntos',
            'Puntos Stableford',
            (result) => (
              <PointsCell
                points={result.stablefordPoints}
                isPickup={result.isPickup}
                hasResult={result.grossStrokes !== null || result.isPickup}
              />
            ),
            summary.points,
            ' scorecard-grid__row--points',
          )}
        </div>
      </div>

      <div className="scorecard-grid__footer">
        <span>
          <strong className="data">{summary.holesPlayed}</strong> de {holes.length} hoyos
        </span>
        <span>
          <strong className="data">{summary.points}</strong> puntos
        </span>
        <span>
          <strong className="data">{summary.numericStrokes}</strong> golpes escritos
        </span>
        {summary.pickups > 0 ? (
          <span className="nine-summary__pickups">
            {summary.pickups} {summary.pickups === 1 ? 'raya' : 'rayas'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
