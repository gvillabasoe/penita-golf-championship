import { getCompetition, getRanking } from '@/lib/data/queries';
import { RevealControls } from '@/components/client/reveal-controls';
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

      <div className="dashboard-grid">
        <StatTile
          label="Reveladas"
          value={`${state.revealedCount}/${order.length}`}
          ariaLabel={`${state.revealedCount} de ${order.length} posiciones reveladas`}
        />
        <StatTile label="Estado" value={state.status} />
        <StatTile label="Pausa" value={state.isPaused ? 'Si' : 'No'} />
      </div>

      <AdminSection
        title="Como funciona"
        description="Se revela desde la ultima posicion hacia la primera, sin saltos y con una pausa minima entre posiciones. Si se corrige una tarjeta a mitad, la presentacion se bloquea sola y hay que reiniciarla con una clasificacion actualizada."
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
