import { requireSession } from '@/lib/auth/server';
import { getCompetition, getRanking } from '@/lib/data/queries';
import { Leaderboard } from '@/components/leaderboard';
import { BottomNav } from '@/components/client/bottom-nav';
import { AutoRefresh } from '@/components/client/auto-refresh';

export const metadata = { title: 'Clasificacion · Peñita Golf' };

export default async function LeaderboardPage() {
  const user = await requireSession('/clasificacion');
  const context = await getCompetition();

  if (!context) {
    return (
      <main className="container stack">
        <p className="alert" role="alert">El campeonato todavia no esta configurado.</p>
        <BottomNav role={user.role} />
      </main>
    );
  }

  const { rows, order, state } = await getRanking(context);

  return (
    <main className="container stack">
      <header className="page-header">
        <div>
          <h1>Clasificacion</h1>
          <p className="muted">{context.edition}</p>
        </div>
      </header>

      {/*
        Durante la revelacion todos los dispositivos tienen que ir a la vez, y
        sin WebSockets: se refresca cada pocos segundos. Fuera de la revelacion
        no hace falta y no se refresca.
      */}
      {state.status === 'REVEALING' ? <AutoRefresh intervalMs={4000} /> : null}

      <Leaderboard rows={rows} revealOrder={order} state={state} role={user.role} />

      <BottomNav role={user.role} />
    </main>
  );
}
