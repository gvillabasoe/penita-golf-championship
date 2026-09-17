import { requireSession } from '@/lib/auth/server';
import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { ScorecardList } from '@/components/scorecard';
import { BottomNav } from '@/components/client/bottom-nav';
import { ReviewButton } from '@/components/client/review-button';
import { cardAccess, canReviewCard } from '@/lib/scorecard/visibility';

export const metadata = { title: 'Mi partido · Peñita Golf' };

export default async function FlightPage() {
  const user = await requireSession('/partido');
  const context = await getCompetition();
  if (!context || !user.competitionPlayerId) {
    return (
      <main className="container stack">
        <p className="alert" role="alert">El campeonato todavia no esta configurado.</p>
        <BottomNav role={user.role} />
      </main>
    );
  }

  const viewer = {
    competitionPlayerId: user.competitionPlayerId,
    role: user.role,
    flightId: user.flightId,
  };

  const all = await getAllScorecards(context);
  const visible = all.filter((card) => {
    const access = cardAccess(
      viewer,
      {
        competitionPlayerId: card.competitionPlayerId,
        flightId: card.flightId,
        status: card.status,
      },
      context.classificationStatus,
    );
    return access.access !== 'NONE';
  });

  const mine = visible.find((card) => card.competitionPlayerId === user.competitionPlayerId);

  return (
    <main className="container stack">
      <header className="page-header">
        <div>
          <h1>{mine?.flightName ?? 'Mi partido'}</h1>
          <p className="muted">
            {mine?.teeTime
              ? `Salida ${new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(mine.teeTime)}`
              : 'Sin hora de salida'}
          </p>
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="card">No hay tarjetas visibles todavia.</p>
      ) : null}

      {visible.map((card) => {
        const own = card.competitionPlayerId === user.competitionPlayerId;
        const eligibility = canReviewCard(viewer, {
          competitionPlayerId: card.competitionPlayerId,
          flightId: card.flightId,
          status: card.status,
        });

        return (
          <section key={card.competitionPlayerId} className="stack" aria-label={card.displayName}>
            <div className="page-header">
              <div>
                <h2>{card.displayName}</h2>
                <p className="muted">
                  {card.handicapIndexTenths !== null
                    ? `Hcp ${(card.handicapIndexTenths / 10).toFixed(1).replace('.', ',')}`
                    : 'Sin hándicap'}
                  {card.playingHandicap !== null ? ` · HJ ${card.playingHandicap}` : ''} ·{' '}
                  {card.totals.total.points} pts · {card.totals.total.holesPlayed}/18
                </p>
              </div>
            </div>

            <ScorecardList
              results={card.results}
              distances={context.distances}
              totals={card.totals}
              overriddenHoles={card.overriddenHoles}
              readOnly={!own || card.status === 'LOCKED'}
              holeHref={own ? (hole) => `/tarjeta/${hole}` : undefined}
            />

            {eligibility.canReview ? (
              <ReviewButton
                competitionPlayerId={card.competitionPlayerId}
                displayName={card.displayName}
              />
            ) : null}
          </section>
        );
      })}

      <BottomNav role={user.role} />
    </main>
  );
}
