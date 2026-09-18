import { getCompetition, getRanking } from '@/lib/data/queries';
import { Leaderboard } from '@/components/leaderboard';
import { StateBlock, StatusBadge } from '@/components/ui';
import { IconTrophy } from '@/components/ui/icons';

export const metadata = { title: 'Admin · Clasificacion' };

export default async function AdminRankingPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconTrophy />}>
        Sin campo confirmado no hay clasificacion que calcular.
      </StateBlock>
    );
  }

  const { rows, order, state } = await getRanking(context);

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Clasificacion provisional</h1>
        <StatusBadge tone="neutral">{state.status}</StatusBadge>
      </div>

      <p className="muted">
        Criterios, en orden: mas puntos, menor hándicap exacto y menor suma de golpes ajustada.
        Las rayas se cuentan como doble bogey neto, para que levantar la bola no de ventaja. El
        desempate usa el hándicap exacto ORIGINAL, tambien cuando hay limite de HCP.
      </p>

      <Leaderboard rows={rows} revealOrder={order} state={state} role="ADMIN" />
    </div>
  );
}
