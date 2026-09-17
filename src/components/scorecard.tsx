/**
 * Tarjeta de juego (secciones 11, 35 y 37).
 *
 * Es una LISTA de hoyos, no una tabla de escritorio encogida. A 320 px una tabla
 * de 18 columnas es ilegible, y la seccion 11 lo prohibe explicitamente. Cada
 * fila muestra los seis datos obligatorios: numero, par, stroke index, golpes
 * recibidos, golpes brutos y puntos.
 *
 * Fondo opaco en toda la tarjeta: se usa jugando, al sol, con una mano.
 */

import { PointsCell, ScoreNumber, StrokesReceivedDots } from './score';
import type { HoleResult, ScorecardTotals } from '@/lib/golf/types';

export interface HoleRowProps {
  result: HoleResult;
  distance: number;
  isCurrent?: boolean;
  /** El hoyo tiene una escritura pendiente de sincronizar. */
  isPending?: boolean;
  /** El administrador ha corregido este hoyo. */
  isOverridden?: boolean;
  href?: string;
}

export function HoleRow({
  result,
  distance,
  isCurrent = false,
  isPending = false,
  isOverridden = false,
  href,
}: HoleRowProps) {
  const hasResult = result.grossStrokes !== null || result.isPickup;
  const classNames = [
    'hole-row',
    isCurrent ? 'hole-row--current' : '',
    hasResult ? 'hole-row--played' : 'hole-row--pending',
    isOverridden ? 'hole-row--overridden' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="hole-row__number" aria-label={`Hoyo ${result.holeNumber}`}>
        {result.holeNumber}
      </span>

      <span className="hole-row__meta">
        <span aria-label={`Par ${result.par}`}>Par {result.par}</span>
        <span aria-label={`Stroke index ${result.strokeIndex}`}>SI {result.strokeIndex}</span>
        <span aria-label={`${distance} metros`}>{distance} m</span>
      </span>

      <StrokesReceivedDots strokesReceived={result.strokesReceived} />
      <ScoreNumber result={result} />
      <PointsCell
        points={result.stablefordPoints}
        isPickup={result.isPickup}
        hasResult={hasResult}
      />

      {isPending ? (
        <span className="hole-row__pending" aria-label="Pendiente de sincronizacion">
          {'\u21bb'}
        </span>
      ) : null}
      {isOverridden ? (
        <span className="hole-row__overridden" aria-label="Corregido por el administrador">
          {'\u270e'}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a className={classNames} href={href} aria-current={isCurrent ? 'step' : undefined}>
        {content}
      </a>
    );
  }

  return (
    <div className={classNames} aria-current={isCurrent ? 'step' : undefined}>
      {content}
    </div>
  );
}

export interface NineSummaryProps {
  label: string;
  summary: { numericStrokes: number; points: number; holesPlayed: number; pickups: number };
}

export function NineSummary({ label, summary }: NineSummaryProps) {
  return (
    <div className="nine-summary solid">
      <span className="nine-summary__label">{label}</span>
      <span aria-label={`${summary.numericStrokes} golpes`}>{summary.numericStrokes}</span>
      <span aria-label={`${summary.points} puntos Stableford`}>{summary.points} pts</span>
      {summary.pickups > 0 ? (
        <span className="nine-summary__pickups" aria-label={`${summary.pickups} rayas`}>
          {summary.pickups} {summary.pickups === 1 ? 'raya' : 'rayas'}
        </span>
      ) : null}
    </div>
  );
}

export interface TotalsPanelProps {
  totals: ScorecardTotals;
}

/**
 * Totales.
 *
 * Lo importante de este componente es lo que NO hace: si hay una sola raya, no
 * publica un bruto total. La seccion 37 lo prohibe, y con razon: sumar solo los
 * hoyos jugados y presentarlo como el bruto de la vuelta es un numero falso que
 * alguien acabaria comparando con el de otro.
 */
export function TotalsPanel({ totals }: TotalsPanelProps) {
  const { total } = totals;

  return (
    <section className="totals-panel solid" aria-label="Totales de la tarjeta">
      <NineSummary label="Ida (1-9)" summary={totals.out} />
      <NineSummary label="Vuelta (10-18)" summary={totals.in} />

      <div className="totals-panel__total">
        <span className="totals-panel__label">Total</span>

        <span aria-label={`${total.numericStrokes} golpes numericos`}>
          {total.numericStrokes} golpes
        </span>
        <span aria-label={`${total.points} puntos Stableford`}>{total.points} pts</span>
        <span aria-label={`${total.holesPlayed} de 18 hoyos`}>{total.holesPlayed}/18</span>

        {total.isGrossComplete && total.grossToPar !== null ? (
          <span
            className="totals-panel__to-par"
            aria-label={`Resultado bruto ${total.grossToPar === 0 ? 'par del campo' : total.grossToPar > 0 ? `${total.grossToPar} sobre par` : `${Math.abs(total.grossToPar)} bajo par`}`}
          >
            {total.grossToPar === 0 ? 'Par' : total.grossToPar > 0 ? `+${total.grossToPar}` : total.grossToPar}
          </span>
        ) : (
          <span className="totals-panel__incomplete" role="note">
            Resultado bruto incompleto
            {total.pickups > 0
              ? ` (${total.pickups} ${total.pickups === 1 ? 'raya' : 'rayas'})`
              : ''}
          </span>
        )}
      </div>
    </section>
  );
}

export interface ScorecardListProps {
  results: HoleResult[];
  distances: Map<number, number>;
  totals: ScorecardTotals;
  currentHole?: number;
  pendingHoles?: number[];
  overriddenHoles?: number[];
  /** Solo lectura: tarjeta de otro jugador o tarjeta bloqueada. */
  readOnly?: boolean;
  holeHref?: (holeNumber: number) => string;
}

export function ScorecardList({
  results,
  distances,
  totals,
  currentHole,
  pendingHoles = [],
  overriddenHoles = [],
  readOnly = false,
  holeHref,
}: ScorecardListProps) {
  const pending = new Set(pendingHoles);
  const overridden = new Set(overriddenHoles);

  const renderHoles = (from: number, to: number) =>
    results
      .filter((r) => r.holeNumber >= from && r.holeNumber <= to)
      .map((result) => (
        <li key={result.holeNumber}>
          <HoleRow
            result={result}
            distance={distances.get(result.holeNumber) ?? 0}
            isCurrent={result.holeNumber === currentHole}
            isPending={pending.has(result.holeNumber)}
            isOverridden={overridden.has(result.holeNumber)}
            href={readOnly || !holeHref ? undefined : holeHref(result.holeNumber)}
          />
        </li>
      ));

  return (
    <div className="scorecard solid">
      {readOnly ? (
        <p className="scorecard__read-only" role="note">
          Solo lectura
        </p>
      ) : null}

      <h2 className="scorecard__heading">Ida</h2>
      <ol className="scorecard__holes" aria-label="Hoyos 1 a 9">
        {renderHoles(1, 9)}
      </ol>
      <NineSummary label="Ida" summary={totals.out} />

      <h2 className="scorecard__heading">Vuelta</h2>
      <ol className="scorecard__holes" aria-label="Hoyos 10 a 18" start={10}>
        {renderHoles(10, 18)}
      </ol>
      <NineSummary label="Vuelta" summary={totals.in} />

      <TotalsPanel totals={totals} />
    </div>
  );
}
