import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { ScorecardList } from '@/components/scorecard';
import { LockButton } from '@/components/client/lock-button';

export const metadata = { title: 'Admin · Tarjetas' };

export default async function AdminScorecardsPage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

  const cards = await getAllScorecards(context);

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Tarjetas</h1>
      </header>

      <p className="muted">
        Una correccion administrativa exige motivo por escrito, queda marcada en el hoyo y el
        jugador no puede pisarla sin autorizacion.
      </p>

      {cards.map((card) => (
        <section key={card.competitionPlayerId} className="stack" aria-label={card.displayName}>
          <div className="page-header">
            <div>
              <h2>{card.displayName}</h2>
              <p className="muted">
                {card.status} · {card.totals.total.points} pts ·{' '}
                {card.totals.total.holesPlayed}/18
                {card.overriddenHoles.length > 0
                  ? ` · corregidos: ${card.overriddenHoles.join(', ')}`
                  : ''}
              </p>
            </div>
            {card.scorecardId ? (
              <LockButton scorecardId={card.scorecardId} locked={card.status === 'LOCKED'} />
            ) : null}
          </div>

          <ScorecardList
            results={card.results}
            distances={context.distances}
            totals={card.totals}
            overriddenHoles={card.overriddenHoles}
            readOnly
          />
        </section>
      ))}
    </div>
  );
}
