import Link from 'next/link';

import { requireSession } from '@/lib/auth/server';
import { getCompetition, getScorecard } from '@/lib/data/queries';
import { ScorecardList } from '@/components/scorecard';
import { BottomNav } from '@/components/client/bottom-nav';
import { FinishCardButton } from '@/components/client/finish-card';
import { nextPendingHole, lastPlayedHole, checkCanFinish } from '@/lib/scorecard/session';
import { logoutAction } from '@/lib/actions/auth';

export const metadata = { title: 'Mi tarjeta · Peñita Golf' };

export default async function ScorecardPage() {
  const user = await requireSession('/tarjeta');
  const context = await getCompetition();

  if (!context) {
    return (
      <main className="container stack">
        <header className="page-header">
          <h1>Mi tarjeta</h1>
        </header>
        <p className="alert" role="alert">
          El campeonato todavia no esta configurado. Habla con el organizador.
        </p>
        <BottomNav role={user.role} />
      </main>
    );
  }

  if (!user.competitionPlayerId) {
    return (
      <main className="container stack">
        <header className="page-header">
          <h1>Mi tarjeta</h1>
        </header>
        <p className="alert" role="alert">
          No estas inscrito en esta edicion. Habla con el organizador.
        </p>
        <BottomNav role={user.role} />
      </main>
    );
  }

  const card = await getScorecard(context, user.competitionPlayerId);
  if (!card) {
    return (
      <main className="container stack">
        <p className="alert" role="alert">No se encuentra tu tarjeta.</p>
        <BottomNav role={user.role} />
      </main>
    );
  }

  const next = nextPendingHole(card.results, lastPlayedHole(card.results) ?? 0);
  const finish = checkCanFinish(card.results);

  return (
    <main className="container stack">
      <header className="page-header">
        <div>
          <h1>Mi tarjeta</h1>
          <p className="muted">
            {card.displayName}
            {card.playingHandicap !== null ? ` · HJ ${card.playingHandicap}` : ' · sin hándicap'}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="button button--secondary">
            Salir
          </button>
        </form>
      </header>

      <section className="card stack" aria-label="Resumen">
        <div className="summary-row">
          <span>
            <strong>{card.totals.total.points}</strong> puntos
          </span>
          <span>
            {card.totals.total.holesPlayed}/18 hoyos
          </span>
          {card.flightName ? (
            <span>
              {card.flightName}
              {card.teeTime
                ? ` · ${new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(card.teeTime)}`
                : ''}
            </span>
          ) : (
            <span className="muted">Sin partido asignado</span>
          )}
        </div>

        <div className="summary-actions">
          {next !== null ? (
            <Link className="button button--primary" href={`/tarjeta/${next}`}>
              Apuntar hoyo {next}
            </Link>
          ) : (
            <span className="muted">Todos los hoyos apuntados</span>
          )}
          <Link className="button button--secondary" href="/partido">
            Ver partido
          </Link>
        </div>

        {card.playingHandicap === null ? (
          <p className="alert" role="alert">
            Todavia no tienes hándicap de juego. Habla con el organizador antes de empezar: los
            puntos no se pueden calcular sin el.
          </p>
        ) : null}
      </section>

      <ScorecardList
        results={card.results}
        distances={context.distances}
        totals={card.totals}
        currentHole={next ?? undefined}
        overriddenHoles={card.overriddenHoles}
        readOnly={card.status === 'LOCKED'}
        holeHref={(hole) => `/tarjeta/${hole}`}
      />

      {card.status !== 'LOCKED' && !card.playerConfirmedFinish ? (
        <FinishCardButton canFinish={finish.canFinish} message={finish.message} />
      ) : null}

      {card.playerConfirmedFinish ? (
        <p className="card" role="status">
          Tarjeta finalizada
          {card.reviewedAt ? ' y revisada.' : '. Falta que la revise alguien de tu partido.'}
        </p>
      ) : null}

      <BottomNav role={user.role} />
    </main>
  );
}
