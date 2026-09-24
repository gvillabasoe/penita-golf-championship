/**
 * Estado de guardado y clasificacion.
 *
 * La clasificacion se presenta como un leaderboard deportivo compacto: posicion
 * a la izquierda, identidad y datos en el centro, y puntos claramente separados
 * a la derecha. La barra sigue siendo puramente informativa.
 */

import type { SaveStatus } from '@/lib/scorecard/session';
import type { RankingRow } from '@/lib/golf/types';
import type { RevealState, Role } from '@/lib/reveal/controller';
import { playerFacingMessage, visibleGroupCount } from '@/lib/reveal/controller';

export interface SaveStatusBadgeProps {
  status: SaveStatus;
}

export function SaveStatusBadge({ status }: SaveStatusBadgeProps) {
  return (
    <span
      className={`save-status save-status--${status.state.toLowerCase()}`}
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

const PODIUM_LABEL: Record<number, string> = {
  1: 'Oro',
  2: 'Plata',
  3: 'Bronce',
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

  const handicapLabel = (row.handicapIndexTenths / 10).toFixed(1).replace('.', ',');
  const strokesLabel =
    row.pickups > 0
      ? `${row.numericStrokes} golpes escritos, ${row.pickups} ${row.pickups === 1 ? 'raya' : 'rayas'}, ${row.adjustedStrokes} golpes ajustados`
      : `${row.numericStrokes} golpes`;

  return (
    <li
      className={classNames}
      data-revealed={isRevealed ? 'true' : 'false'}
      aria-hidden={isRevealed ? undefined : 'true'}
    >
      <div className="leaderboard-card__rank">
        <span className="leaderboard-card__position" aria-label={positionLabel}>
          {row.isSharedPosition ? '=' : ''}
          {row.position}
        </span>
        <span className="leaderboard-card__rank-label" aria-hidden="true">
          {PODIUM_LABEL[row.position] ?? 'puesto'}
        </span>
      </div>

      <span
        className="leaderboard-card__color"
        style={{ backgroundColor: row.color }}
        aria-hidden="true"
      />

      <div className="leaderboard-card__content">
        <div className="leaderboard-card__headline">
          <span className="leaderboard-card__name">{row.displayName}</span>
          <span
            className="leaderboard-card__score"
            aria-label={`${row.points} puntos Stableford`}
          >
            <strong className="leaderboard-card__points">{row.points}</strong>
            <span>pts</span>
          </span>
        </div>

        <div className="leaderboard-card__meta">
          <span aria-label={`Hándicap exacto ${row.handicapIndexTenths / 10}`}>
            HCP <strong>{handicapLabel}</strong>
          </span>
          <span aria-label={`Hándicap de juego ${row.playingHandicap}`}>
            HJ <strong>{row.playingHandicap}</strong>
          </span>
          <span className="leaderboard-card__strokes" aria-label={strokesLabel}>
            <strong>{row.numericStrokes}</strong> golpes
            {row.pickups > 0 ? (
              <span aria-hidden="true">
                {' '}· {row.pickups}R · aj. {row.adjustedStrokes}
              </span>
            ) : null}
          </span>
        </div>

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
      </div>
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
 * La visibilidad se obtiene de la misma maquina de estados de la revelacion; la
 * interfaz nunca decide por su cuenta que posiciones pueden mostrarse.
 */
export function Leaderboard({ rows, revealOrder, state, role }: LeaderboardProps) {
  const visibleGroups = visibleGroupCount(state, role);
  const message = playerFacingMessage(state);

  const revealedIndices = new Set<number>(revealOrder.slice(0, visibleGroups).flat());
  const latestGroup = visibleGroups > 0 ? revealOrder[visibleGroups - 1] : [];
  const latestIndices = new Set<number>(state.status === 'PUBLISHED' ? [] : latestGroup);

  if (message !== null && visibleGroups === 0) {
    return (
      <div className="leaderboard leaderboard--hidden" role="status">
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
