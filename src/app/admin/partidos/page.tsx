import { getCompetition, getFlights } from '@/lib/data/queries';
import { DrawPanel } from '@/components/client/draw-panel';
import { AdminSection, StateBlock, StatusBadge } from '@/components/ui';
import { IconUsers } from '@/components/ui/icons';
import { formatTenths } from '@/lib/golf/decimal';

export const metadata = { title: 'Admin · Partidos' };

const timeFormat = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

export default async function AdminFlightsPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconUsers />}>
        Confirma el campo e inscribe a los jugadores antes de sortear los partidos.
      </StateBlock>
    );
  }

  const flights = await getFlights(context);

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Partidos</h1>
        <StatusBadge tone="neutral">{flights.length} partidos</StatusBadge>
      </div>

      <DrawPanel />

      {flights.length === 0 ? (
        <StateBlock title="Todavia no hay partidos" icon={<IconUsers />}>
          Usa el sorteo para repartir a los jugadores. La semilla queda guardada, asi que el
          mismo sorteo se puede reproducir despues.
        </StateBlock>
      ) : null}

      {flights.map((flight) => (
        <AdminSection
          key={flight.id}
          title={flight.name}
          action={
            <StatusBadge tone={flight.teeTime ? 'green' : 'warning'}>
              {flight.teeTime ? timeFormat.format(flight.teeTime) : 'Sin hora'}
            </StatusBadge>
          }
        >
          <ul className="flight-card__members">
            {flight.members.map((member) => (
              <li key={member.competitionPlayerId}>
                <div className="player-card">
                  <span
                    className="player-card__color"
                    style={{ backgroundColor: member.color }}
                    aria-hidden="true"
                  />
                  <div className="player-card__body">
                    <p className="player-card__name">{member.displayName}</p>
                    <p className="player-card__meta">
                      <span>
                        HCP{' '}
                        {member.handicapIndexTenths === null
                          ? '\u2014'
                          : formatTenths(member.handicapIndexTenths)}
                      </span>
                      {member.handicapCap.isCapped ? (
                        <span>Aplicable {member.handicapCap.appliedLabel}</span>
                      ) : null}
                      <span>HJ {member.playingHandicap ?? '\u2014'}</span>
                    </p>
                  </div>
                  <div className="player-card__score">
                    <span className="player-card__points">{member.points}</span>
                    <span className="player-card__holes">{member.holesCompleted}/18</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </AdminSection>
      ))}
    </div>
  );
}
