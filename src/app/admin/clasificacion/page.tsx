import { getCompetition, getPairCompetition, getRanking } from '@/lib/data/queries';
import { Leaderboard } from '@/components/leaderboard';
import { PairLeaderboard } from '@/components/pair-leaderboard';
import { ClassificationPublicationSwitch } from '@/components/client/classification-publication-switch';
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

  const [{ rows, order, state }, pairCompetition] = await Promise.all([
    getRanking(context),
    context.pairModeEnabled ? getPairCompetition(context) : Promise.resolve(null),
  ]);
  const isOfficial =
    state.status === 'PUBLISHED' && context.classificationStatus === 'PUBLISHED';

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Clasificacion {isOfficial ? 'oficial' : 'provisional'}</h1>
        <StatusBadge tone={isOfficial ? 'green' : 'gold'}>
          {isOfficial ? 'Oficial' : 'Provisional'}
        </StatusBadge>
      </div>

      <ClassificationPublicationSwitch official={isOfficial} />

      <p className="muted">
        Criterios, en orden: mas puntos, menor hándicap exacto y menor suma de golpes ajustada.
        Las rayas se cuentan como doble bogey neto, para que levantar la bola no de ventaja. El
        desempate usa el hándicap exacto ORIGINAL, tambien cuando hay limite de HCP.
      </p>

      <Leaderboard rows={rows} revealOrder={order} state={state} role="ADMIN" />

      {pairCompetition ? (
        <>
          <div className="section-header">
            <h2>Clasificacion {isOfficial ? 'oficial' : 'provisional'} de parejas</h2>
            <StatusBadge tone={isOfficial ? 'green' : 'gold'}>
              {isOfficial ? 'Oficial' : `${pairCompetition.pairs.length} parejas`}
            </StatusBadge>
          </div>
          <p className="muted">
            Criterios: mas puntos, menor suma de hándicap exacto y menor suma de golpes ajustados.
          </p>
          <PairLeaderboard
            rows={pairCompetition.ranking}
            visible
            role="ADMIN"
            showCardLinks={false}
          />
        </>
      ) : null}
    </div>
  );
}
