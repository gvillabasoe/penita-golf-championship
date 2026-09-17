import { getCompetition, getRanking } from '@/lib/data/queries';
import { RevealControls } from '@/components/client/reveal-controls';
import { availableActions } from '@/lib/reveal/controller';
import { rankingFingerprint } from '@/lib/golf/ranking';

export const metadata = { title: 'Admin · Revelacion' };

export default async function AdminRevealPage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

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
      <header className="page-header">
        <div>
          <h1>Revelacion</h1>
          <p className="muted">
            {state.revealedCount}/{order.length} posiciones reveladas
            {state.isPaused ? ' · en pausa' : ''}
          </p>
        </div>
      </header>

      <p className="muted">
        Se revela desde la ultima posicion hacia la primera, sin saltos y con una pausa minima
        entre posiciones. Si se corrige una tarjeta a mitad, la presentacion se bloquea sola y hay
        que reiniciarla con una clasificacion actualizada.
      </p>

      <RevealControls actions={actions.map((a) => ({ action: a.action, enabled: a.enabled, reason: a.reason }))} />
    </div>
  );
}
