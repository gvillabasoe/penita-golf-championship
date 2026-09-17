/**
 * Estado de guardado y clasificacion (secciones 41, 45, 47, 51).
 */

import type { SaveStatus } from '@/lib/scorecard/session';
import type { RankingRow } from '@/lib/golf/types';
import type { RevealState, Role } from '@/lib/reveal/controller';
import { playerFacingMessage, visibleGroupCount } from '@/lib/reveal/controller';

export interface SaveStatusBadgeProps {
  status: SaveStatus;
}

/**
 * Siempre visible en la cabecera. `aria-live="polite"` para que el lector de
 * pantalla anuncie el cambio de estado sin interrumpir lo que este leyendo.
 */
export function SaveStatusBadge({ status }: SaveStatusBadgeProps) {
  return (
    <span
      className={`save-status save-status--${status.state.toLowerCase()} glass`}
      role="status"
      aria-live="polite"
      aria-label={status.ariaLabel}
    >
      <span aria-hidden="true">{status.label}</span>
    </span>
  );
}

const PODIUM_CLASS: Record<number, string> = {
  1: 'podium--1',
  2: 'podium--2',
  3: 'podium--3',
};

export interface LeaderboardCardProps {
  row: RankingRow;
  isRevealed: boolean;
  /** Enfasis temporal en la tarjeta que acaba de aparecer. */
  isLatest?: boolean;
  /** Muestra la nota de desempate. Solo para el administrador. */
  showTieNote?: boolean;
}

export function LeaderboardCard({
  row,
  isRevealed,
  isLatest = false,
  showTieNote = false,
}: LeaderboardCardProps) {
  const classNames = [
    'leaderboard-card',
    'reveal-card',
    PODIUM_CLASS[row.position] ?? '',
    isLatest ? 'leaderboard-card--latest' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const positionLabel = row.isSharedPosition
    ? `Posicion ${row.position} compartida`
    : `Posicion ${row.position}`;

  return (
    <li
      className={classNames}
      data-revealed={isRevealed ? 'true' : 'false'}
      aria-hidden={isRevealed ? undefined : 'true'}
    >
      <span className="leaderboard-card__position" aria-label={positionLabel}>
        {row.isSharedPosition ? '=' : ''}
        {row.position}
      </span>

      <span
        className="leaderboard-card__color"
        style={{ backgroundColor: row.color }}
        aria-hidden="true"
      />

      <span className="leaderboard-card__name">{row.displayName}</span>

      <span className="leaderboard-card__handicaps">
        <span aria-label={`Hándicap exacto ${row.handicapIndexTenths / 10}`}>
          {(row.handicapIndexTenths / 10).toFixed(1).replace('.', ',')}
        </span>
        <span aria-label={`Hándicap de juego ${row.playingHandicap}`}>
          HJ {row.playingHandicap}
        </span>
      </span>

      <span className="leaderboard-card__points" aria-label={`${row.points} puntos Stableford`}>
        {row.points}
      </span>

      {/*
        Se muestran los golpes que el jugador escribio, que son los que reconoce.
        El ajustado solo aparece cuando hay rayas, porque solo entonces difiere,
        y va tambien en la etiqueta accesible para que se pueda auditar un
        desempate sin abrir el panel.
      */}
      <span
        className="leaderboard-card__strokes"
        aria-label={
          row.pickups > 0
            ? `${row.numericStrokes} golpes escritos, ${row.pickups} ${row.pickups === 1 ? 'raya' : 'rayas'}, ${row.adjustedStrokes} golpes ajustados`
            : `${row.numericStrokes} golpes`
        }
      >
        {row.numericStrokes}
        {row.pickups > 0 ? (
          <span aria-hidden="true">
            {' '}
            ({row.pickups}R · aj. {row.adjustedStrokes})
          </span>
        ) : null}
      </span>

      {/* La barra es decorativa: no afecta a la clasificacion. */}
      <span className="leaderboard-card__bar" aria-hidden="true">
        <span
          className="leaderboard-card__bar-fill"
          style={{ width: `${row.progressPercent}%`, backgroundColor: row.color }}
        />
      </span>

      {showTieNote && row.tieBreakNote ? (
        <span className="leaderboard-card__note alert" role="note">
          {row.tieBreakNote}
        </span>
      ) : null}
    </li>
  );
}

export interface LeaderboardProps {
  /** Filas ya ordenadas por `buildRanking`. */
  rows: RankingRow[];
  /** Grupos de posicion en el orden de revelacion, cada uno con indices de `rows`. */
  revealOrder: number[][];
  state: RevealState;
  role: Role;
}

/**
 * Clasificacion con revelacion progresiva.
 *
 * La visibilidad NO se decide aqui: se pregunta a `visibleGroupCount`, la misma
 * funcion que gobierna la maquina de estados y que tiene sus propios tests. Si la
 * interfaz decidiera por su cuenta cuantas posiciones pintar, podria filtrar el
 * ganador antes de tiempo, que es el unico error irreparable de toda la
 * aplicacion: una vez visto, no se puede volver a no haberlo visto.
 */
export function Leaderboard({ rows, revealOrder, state, role }: LeaderboardProps) {
  const visibleGroups = visibleGroupCount(state, role);
  const message = playerFacingMessage(state);

  // Grupos revelados: se cuentan desde el final del orden de revelacion, porque
  // se revela de la ultima posicion hacia la primera.
  const revealedIndices = new Set<number>(
    revealOrder.slice(0, visibleGroups).flat(),
  );
  const latestGroup = visibleGroups > 0 ? revealOrder[visibleGroups - 1] : [];
  const latestIndices = new Set<number>(state.status === 'PUBLISHED' ? [] : latestGroup);

  if (message !== null && visibleGroups === 0) {
    return (
      <div className="leaderboard leaderboard--hidden glass" role="status">
        <p>{message}</p>
      </div>
    );
  }

  return (
    <div className="leaderboard">
      {state.status === 'REVEALING' && role === 'ADMIN' ? (
        <p className="leaderboard__provisional alert" role="note">
          Clasificacion provisional: solo visible para el administrador
        </p>
      ) : null}

      <ol className="leaderboard__rows" aria-label="Clasificacion">
        {rows.map((row, index) =>
          revealedIndices.has(index) ? (
            <LeaderboardCard
              key={row.competitionPlayerId}
              row={row}
              isRevealed
              isLatest={latestIndices.has(index)}
              showTieNote={role === 'ADMIN'}
            />
          ) : null,
        )}
      </ol>
    </div>
  );
}
