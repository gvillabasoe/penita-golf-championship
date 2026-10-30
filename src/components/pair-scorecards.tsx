import { ScorecardGrid } from '@/components/scorecard-grid';
import { CardStatusBadge, StateBlock, StatusBadge } from '@/components/ui';
import { IconUsers } from '@/components/ui/icons';
import type { HoleSnapshot } from '@/lib/golf/types';
import type { PairScore } from '@/lib/golf/pairs';

export function PairScorecards({
  pairs,
  holes,
  currentCompetitionPlayerId,
  role,
  classificationPublished,
}: {
  pairs: PairScore[];
  holes: HoleSnapshot[];
  currentCompetitionPlayerId: string | null;
  role: 'PLAYER' | 'ADMIN';
  classificationPublished: boolean;
}) {
  const ownPair = pairs.find((pair) =>
    pair.members.some((member) => member.competitionPlayerId === currentCompetitionPlayerId),
  );
  const visiblePairs =
    role === 'ADMIN' || classificationPublished ? pairs : ownPair ? [ownPair] : [];

  if (visiblePairs.length === 0) {
    return (
      <StateBlock title="No tienes una pareja asignada" icon={<IconUsers />}>
        El administrador debe completar la composicion de parejas para mostrar tu tarjeta.
      </StateBlock>
    );
  }

  return (
    <section className="pair-scorecards stack" aria-label="Tarjetas de parejas">
      <div className="section-header">
        <h2>{role === 'ADMIN' || classificationPublished ? 'Tarjetas de parejas' : 'Tu pareja'}</h2>
        {!classificationPublished && role !== 'ADMIN' ? (
          <StatusBadge tone="neutral">Solo tu tarjeta</StatusBadge>
        ) : null}
      </div>

      {visiblePairs.map((pair) => (
        <article
          key={pair.pairNumber}
          id={`pareja-${pair.pairNumber}`}
          className="pair-scorecard-card stack"
        >
          <header className="pair-scorecard-card__header">
            <div>
              <p className="eyebrow">Pareja {pair.pairNumber}</p>
              <h3>{pair.displayName}</h3>
            </div>
            <div className="button-row">
              <StatusBadge tone="green">{pair.points} puntos</StatusBadge>
              {!pair.isEligible ? <StatusBadge tone="warning">Falta HCP</StatusBadge> : null}
            </div>
          </header>

          {pair.scoringMode === 'BEST_BALL' && pair.results && pair.totals ? (
            <>
              <p className="muted">
                En cada hoyo se muestra el resultado que aporta mas puntos Stableford. La fila
                Jugador identifica de quien sale el resultado elegido.
              </p>
              <ScorecardGrid
                results={pair.results}
                holes={holes}
                totals={pair.totals}
                playerName={`Pareja ${pair.pairNumber}: ${pair.displayName}`}
                sources={pair.sources}
              />
            </>
          ) : (
            <div className="pair-member-scorecards stack">
              <p className="muted">
                La puntuacion de la pareja es la suma de estas dos tarjetas individuales.
              </p>
              {pair.members.map((member) => (
                <section key={member.competitionPlayerId} className="pair-member-scorecard stack">
                  <div className="section-header">
                    <h4>
                      <span
                        className="pair-member-dot"
                        style={{ backgroundColor: member.color }}
                        aria-hidden="true"
                      />
                      {member.displayName}
                    </h4>
                    <CardStatusBadge status={member.status} />
                  </div>
                  <ScorecardGrid
                    results={member.results}
                    holes={holes}
                    totals={member.totals}
                    playerName={member.displayName}
                  />
                </section>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
