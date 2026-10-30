import Link from 'next/link';

import { getCompetition, getFlights } from '@/lib/data/queries';
import { DrawPanel } from '@/components/client/draw-panel';
import { TeeTimeForm } from '@/components/client/tee-time-form';
import { AdminSection, Alert, StateBlock, StatusBadge } from '@/components/ui';
import { timeInputInMadrid } from '@/lib/admin/schedule';
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
  const confirmed = context.flightsConfirmedAt !== null;

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Partidos</h1>
        <div className="button-row">
          <StatusBadge tone={confirmed ? 'green' : 'warning'}>
            {confirmed ? 'Confirmados' : 'Pendientes de confirmación'}
          </StatusBadge>
          <StatusBadge tone="neutral">{flights.length} partidos guardados</StatusBadge>
        </div>
      </div>

      <p className="muted">
        El sorteo combina aleatoriedad y equilibrio: reparte niveles de HCP, separa los cuatro HCP más altos siempre que sea posible y distribuye a quienes conocen el campo para acompañar a jugadores que no lo conocen.
      </p>

      {context.date === null ? (
        <Alert tone="warning" role="status">
          Para fijar las horas de salida, fija antes la fecha del campeonato en{' '}
          <Link href="/admin">Resumen</Link>. Puedes sortear igualmente y guardar los partidos sin hora.
        </Alert>
      ) : null}

      <DrawPanel isConfirmed={confirmed} />

      {confirmed ? (
        <Alert tone="success" role="status">
          Los partidos están confirmados. Ya puedes ir a <Link href="/admin/parejas">Parejas</Link> y realizar la segunda fase.
        </Alert>
      ) : null}

      {flights.length === 0 ? (
        <StateBlock title="Todavía no hay partidos" icon={<IconUsers />}>
          Usa el sorteo para repartir a los participantes. Las parejas permanecerán bloqueadas hasta confirmar la propuesta.
        </StateBlock>
      ) : null}

      {flights.length > 0 ? (
        <div className="section-header">
          <h2>Composición guardada</h2>
          <StatusBadge tone={confirmed ? 'green' : 'warning'}>
            {confirmed ? 'Vigente' : 'No confirmada'}
          </StatusBadge>
        </div>
      ) : null}

      {flights.map((flight) => (
        <AdminSection
          key={flight.id}
          title={flight.name}
          action={
            <div className="button-row">
              <StatusBadge tone={flight.status === 'CONFIRMED' ? 'green' : 'warning'}>
                {flight.status === 'CONFIRMED' ? 'Confirmado' : 'Borrador'}
              </StatusBadge>
              <StatusBadge tone={flight.teeTime ? 'green' : 'warning'}>
                {flight.teeTime ? timeFormat.format(flight.teeTime) : 'Sin hora'}
              </StatusBadge>
            </div>
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
                    <p className="player-card__name">
                      {member.displayName}
                      {member.knowsCourse ? <StatusBadge tone="green">Conoce el campo</StatusBadge> : null}
                    </p>
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

          <TeeTimeForm
            flightId={flight.id}
            flightName={flight.name}
            current={flight.teeTime ? timeInputInMadrid(flight.teeTime) : ''}
            hasCompetitionDate={context.date !== null}
          />
        </AdminSection>
      ))}
    </div>
  );
}
