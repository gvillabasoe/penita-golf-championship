import { getCompetition, getPairCompetition } from '@/lib/data/queries';
import { PairSettingsForm } from '@/components/client/pair-settings-form';
import { PairManager } from '@/components/client/pair-manager';
import { AdminSection, StateBlock, StatusBadge } from '@/components/ui';
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

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Parejas</h1>
        <div className="button-row">
          <StatusBadge tone={context.pairModeEnabled ? 'green' : 'neutral'}>
            {context.pairModeEnabled ? 'Activo' : 'Desactivado'}
          </StatusBadge>
          <StatusBadge tone="neutral">{pairs.length} parejas</StatusBadge>
        </div>
      </div>

      <p className="muted">
        La clasificacion individual se mantiene intacta. La clasificacion de parejas usa{' '}
        <strong>{PAIR_SCORING_LABELS[context.pairScoringMode]}</strong> y se recalcula desde las
        tarjetas individuales.
      </p>

      <PairSettingsForm
        enabled={context.pairModeEnabled}
        scoringMode={context.pairScoringMode}
      />

      <AdminSection
        title="Composicion de parejas"
        description="Cada jugador activo solo puede pertenecer a una pareja. Disolverla no borra ninguna tarjeta."
      >
        <PairManager
          availablePlayers={unpaired.map((player) => ({
            competitionPlayerId: player.competitionPlayerId,
            displayName: player.displayName,
            color: player.color,
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
          }))}
        />
      </AdminSection>
    </div>
  );
}
