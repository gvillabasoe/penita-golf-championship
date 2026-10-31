import { getCompetition, getRanking } from '@/lib/data/queries';
import { RevealControls } from '@/components/client/reveal-controls';
import { ClassificationPublicationSwitch } from '@/components/client/classification-publication-switch';
import { availableActions } from '@/lib/reveal/controller';
import { rankingFingerprint } from '@/lib/golf/ranking';
import { AdminSection, StateBlock, StatTile } from '@/components/ui';
import { IconTrophy } from '@/components/ui/icons';

export const metadata = { title: 'Admin · Revelacion' };

export default async function AdminRevealPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconTrophy />}>
        Sin clasificacion no hay nada que revelar.
      </StateBlock>
    );
  }

  const { rows, order, state } = await getRanking(context);
  const fingerprint = rankingFingerprint(rows);
  const isOfficial =
    state.status === 'PUBLISHED' && context.classificationStatus === 'PUBLISHED';

  const actions = availableActions(state, {
    actorId: 'preview',
    actorRole: 'ADMIN',
    currentFingerprint: fingerprint,
    totalGroups: order.length,
    snapshotId: 'preview',
  });

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Revelacion</h1>
      </div>

      <ClassificationPublicationSwitch official={isOfficial} />

      <div className="dashboard-grid">
        <StatTile
          label="Reveladas"
          value={`${state.revealedCount}/${order.length}`}
          ariaLabel={`${state.revealedCount} de ${order.length} posiciones reveladas`}
        />
        <StatTile
          label="Publicacion"
          value={isOfficial ? 'Oficial' : 'Provisional'}
        />
        <StatTile label="Pausa" value={state.isPaused ? 'Si' : 'No'} />
      </div>

      <AdminSection
        title="Presentacion progresiva opcional"
        description="Puedes revelar desde la ultima posicion hacia la primera. Esta presentacion no es necesaria para publicar: el paso de provisional a oficial se controla exclusivamente con el interruptor superior."
      >
        <RevealControls
          actions={actions.map((a) => ({
            action: a.action,
            enabled: a.enabled,
            reason: a.reason,
          }))}
        />
      </AdminSection>
    </div>
  );
}
