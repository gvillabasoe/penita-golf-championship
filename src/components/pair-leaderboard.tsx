import type { PairRankingRow } from '@/lib/golf/pairs';
import { formatTenths } from '@/lib/golf/decimal';

const PODIUM_CLASS: Record<number, string> = {
  1: 'podium--1',
  2: 'podium--2',
  3: 'podium--3',
};

export function PairLeaderboard({
  rows,
  visible,
  role,
  showCardLinks = true,
}: {
  rows: PairRankingRow[];
  visible: boolean;
  role: 'PLAYER' | 'ADMIN';
  showCardLinks?: boolean;
}) {
  if (!visible) {
    return (
      <div className="leaderboard leaderboard--hidden" role="status">
        <p>La clasificacion de parejas se publicara al cerrar la revelacion individual.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="leaderboard leaderboard--hidden" role="status">
        <p>Todavia no hay parejas completas con hándicap configurado.</p>
      </div>
    );
  }

  return (
    <div className="leaderboard">
      {role === 'ADMIN' ? (
        <p className="leaderboard__provisional alert" role="note">
          Clasificacion de parejas calculada en tiempo real
        </p>
      ) : null}

      <ol className="leaderboard__rows" aria-label="Clasificacion de parejas">
        {rows.map((row) => {
          const positionLabel = row.isSharedPosition
            ? `Posicion ${row.position} compartida`
            : `Posicion ${row.position}`;
          const hcpLabel = formatTenths(row.handicapIndexTenths ?? 0);

          return (
            <li
              key={row.pairNumber}
              className={`leaderboard-card pair-leaderboard-card reveal-card ${PODIUM_CLASS[row.position] ?? ''}`}
              data-revealed="true"
            >
              <div className="leaderboard-card__rank">
                <span className="leaderboard-card__position" aria-label={positionLabel}>
                  {row.isSharedPosition ? '=' : ''}
                  {row.position}
                </span>
              </div>

              <span className="pair-swatches pair-swatches--vertical" aria-hidden="true">
                {row.colors.map((color, index) => (
                  <span key={`${row.pairNumber}-${index}`} style={{ backgroundColor: color }} />
                ))}
              </span>

              <div className="leaderboard-card__content">
                <div className="leaderboard-card__headline">
                  <span className="leaderboard-card__name">{row.displayName}</span>
                  <span
                    className="leaderboard-card__score"
                    aria-label={`${row.points} puntos de pareja`}
                  >
                    <strong className="leaderboard-card__points">{row.points}</strong>
                    <span>pts</span>
                  </span>
                </div>

                <div className="leaderboard-card__meta">
                  <span aria-label={`Suma de hándicap exacto ${hcpLabel}`}>
                    HCP total <strong>{hcpLabel}</strong>
                  </span>
                  <span aria-label={`Suma de hándicap de juego ${row.playingHandicap}`}>
                    HJ total <strong>{row.playingHandicap}</strong>
                  </span>
                  <span>
                    <strong>{row.holesCompleted}</strong>/{row.holesAvailable} resultados
                  </span>
                  {showCardLinks ? (
                    <a className="pair-card-link" href={`#pareja-${row.pairNumber}`}>
                      Ver tarjeta
                    </a>
                  ) : null}
                </div>

                <span className="leaderboard-card__bar" aria-hidden="true">
                  <span
                    className="leaderboard-card__bar-fill pair-progress"
                    style={{ width: `${row.progressPercent}%` }}
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
