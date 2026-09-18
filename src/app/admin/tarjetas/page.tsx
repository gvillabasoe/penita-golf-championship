import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { ScorecardGrid } from '@/components/scorecard-grid';
import { LockButton } from '@/components/client/lock-button';
import { ResetScoresPanel } from '@/components/client/reset-scores-panel';
import {
  AdminSection,
  CardStatusBadge,
  StateBlock,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import { IconFlag } from '@/components/ui/icons';

export const metadata = { title: 'Admin · Tarjetas' };

/**
 * Tarjetas.
 *
 * Primero el estado agregado, despues tarjeta por tarjeta, y AL FINAL, separada
 * por completo del flujo normal, la zona de acciones criticas. Ese orden importa:
 * el boton de vaciar todos los resultados no puede estar a la misma altura ni en
 * la misma superficie que el de bloquear una tarjeta.
 */
export default async function AdminScorecardsPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconFlag />}>
        Sin una valoracion de campo confirmada no hay tarjetas que administrar.
      </StateBlock>
    );
  }

  const cards = await getAllScorecards(context);
  const totalHoles = cards.reduce((sum, card) => sum + card.totals.total.holesPlayed, 0);
  const overridden = cards.reduce((sum, card) => sum + card.overriddenHoles.length, 0);

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Tarjetas</h1>
        <StatusBadge tone="neutral">{cards.length} jugadores</StatusBadge>
      </div>

      <div className="dashboard-grid">
        <StatTile label="Hoyos apuntados" value={totalHoles} />
        <StatTile label="Hoyos corregidos" value={overridden} />
        <StatTile
          label="Bloqueadas"
          value={cards.filter((card) => card.status === 'LOCKED').length}
        />
      </div>

      <p className="muted">
        Una correccion administrativa exige motivo por escrito, queda marcada en el hoyo y el
        jugador no puede pisarla sin autorizacion.
      </p>

      {cards.length === 0 ? (
        <StateBlock title="Todavia no hay jugadores inscritos" icon={<IconFlag />}>
          Inscribe a los participantes antes de administrar tarjetas.
        </StateBlock>
      ) : null}

      {cards.map((card) => (
        <AdminSection
          key={card.competitionPlayerId}
          title={card.displayName}
          description={
            <>
              {card.totals.total.points} puntos · {card.totals.total.holesPlayed}/18 hoyos ·{' '}
              {card.totals.total.pickups} rayas
              {card.overriddenHoles.length > 0
                ? ` · corregidos: ${card.overriddenHoles.join(', ')}`
                : ''}
            </>
          }
          action={
            <div className="button-row">
              <CardStatusBadge status={card.status} />
              {card.scorecardId ? (
                <LockButton
                  scorecardId={card.scorecardId}
                  locked={card.status === 'LOCKED'}
                />
              ) : null}
            </div>
          }
        >
          {card.handicapCap.badge ? (
            <p className="muted">
              <StatusBadge tone="gold">{card.handicapCap.badge}</StatusBadge> HCP exacto{' '}
              {card.handicapCap.exactLabel} · HJ {card.playingHandicap ?? '\u2014'}
            </p>
          ) : null}

          <ScorecardGrid
            results={card.results}
            distances={context.distances}
            totals={card.totals}
            playerName={card.displayName}
          />
        </AdminSection>
      ))}

      <ResetScoresPanel />
    </div>
  );
}
