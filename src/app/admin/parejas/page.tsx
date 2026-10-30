import Link from 'next/link';

import { getCompetition, getPairCompetition } from '@/lib/data/queries';
import { PairSettingsForm } from '@/components/client/pair-settings-form';
import { PairDrawPanel } from '@/components/client/pair-draw-panel';
import { PairManager } from '@/components/client/pair-manager';
import { AdminSection, Alert, StateBlock, StatusBadge } from '@/components/ui';
import { IconUsers } from '@/components/ui/icons';
import { PAIR_SCORING_LABELS } from '@/lib/golf/pairs';

export const metadata = { title: 'Admin · Parejas' };

export default async function AdminPairsPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconUsers />}>
        Confirma el campo antes de crear las parejas.
      </StateBlock>
    );
  }

  const { pairs, unpaired } = await getPairCompetition(context);
  const flightsConfirmed = context.flightsConfirmedAt !== null;
  const pairActionsEnabled = flightsConfirmed && context.pairModeEnabled;

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Parejas</h1>
        <div className="button-row">
          <StatusBadge tone={context.pairModeEnabled ? 'green' : 'neutral'}>
            {context.pairModeEnabled ? 'Modo activo' : 'Modo desactivado'}
          </StatusBadge>
          <StatusBadge tone={flightsConfirmed ? 'green' : 'warning'}>
            {flightsConfirmed ? 'Partidos confirmados' : 'Partidos pendientes'}
          </StatusBadge>
          <StatusBadge tone="neutral">{pairs.length} equipos</StatusBadge>
        </div>
      </div>

      <p className="muted">
        El orden es obligatorio: primero se configuran y confirman los partidos; después se sortean las parejas sobre esa composición. La clasificación individual no se modifica.
      </p>

      {!flightsConfirmed ? (
        <Alert tone="warning" role="status">
          El sorteo de parejas está bloqueado. Ve a <Link href="/admin/partidos">Partidos</Link>, genera una propuesta, revísala y pulsa “Confirmar partidos”.
        </Alert>
      ) : null}

      <PairSettingsForm
        enabled={context.pairModeEnabled}
        scoringMode={context.pairScoringMode}
      />

      <AdminSection
        title="Sorteo automático"
        description={`Modalidad actual: ${PAIR_SCORING_LABELS[context.pairScoringMode]}. Si hay un número impar, una persona jugará individual y sus puntos contarán x2.`}
      >
        <PairDrawPanel
          pairModeEnabled={context.pairModeEnabled}
          flightsConfirmed={flightsConfirmed}
          hasPairs={pairs.length > 0}
        />
      </AdminSection>

      <AdminSection
        title="Revisión y ajustes manuales"
        description="Cada pareja debe unir jugadores de partidos distintos. Disolver un equipo no borra ninguna tarjeta."
      >
        <PairManager
          enabled={pairActionsEnabled}
          availablePlayers={unpaired.map((player) => ({
            competitionPlayerId: player.competitionPlayerId,
            displayName: player.displayName,
            color: player.color,
            flightId: player.flightId,
            flightName: player.flightName,
          }))}
          pairs={pairs.map((pair) => ({
            pairNumber: pair.pairNumber,
            displayName: pair.displayName,
            members: pair.members.map((member) => ({
              competitionPlayerId: member.competitionPlayerId,
              displayName: member.displayName,
              color: member.color,
            })),
            isEligible: pair.isEligible,
            isSolo: pair.isSolo,
          }))}
        />
      </AdminSection>
    </div>
  );
}
