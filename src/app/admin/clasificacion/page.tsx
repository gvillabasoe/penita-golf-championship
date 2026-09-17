import { getCompetition, getRanking } from '@/lib/data/queries';
import { Leaderboard } from '@/components/leaderboard';

export const metadata = { title: 'Admin · Clasificacion' };

export default async function AdminRankingPage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

  const { rows, order, state } = await getRanking(context);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Clasificacion provisional</h1>
          <p className="muted">Estado: {state.status}</p>
        </div>
      </header>

      <p className="muted">
        Criterios: mas puntos, menor hándicap exacto y menor suma de golpes ajustada. Las rayas se
        cuentan como doble bogey neto, para que levantar la bola no de ventaja.
      </p>

      <Leaderboard rows={rows} revealOrder={order} state={state} role="ADMIN" />
    </div>
  );
}
