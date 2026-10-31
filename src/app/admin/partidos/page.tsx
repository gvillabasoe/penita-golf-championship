import Link from 'next/link';

import { getAllScorecards, getCompetition, getFlights } from '@/lib/data/queries';
import { DrawPanel } from '@/components/client/draw-panel';
import { ManualFlightManager } from '@/components/client/manual-flight-manager';
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
        Confirma el campo e inscribe a los jugadores antes de configurar los partidos.
      </StateBlock>
    );
  }

  const [flights, players] = await Promise.all([
    getFlights(context),
    getAllScorecards(context),
  ]);
  const confirmed = context.flightsConfirmedAt !== null;
  const hasPairs = players.some((player) => player.pairNumber !== null);

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
        Puedes utilizar el sorteo equilibrado o construir los partidos manualmente. En ambos casos debes revisar y confirmar la composición antes de crear o sortear las parejas.
      </p>

      {context.date === null ? (
        <Alert tone="warning" role="status">
          Para fijar las horas de salida, fija antes la fecha del campeonato en{' '}
          <Link href="/admin">Resumen</Link>. Puedes sortear igualmente y guardar los partidos sin hora.
        </Alert>
      ) : null}

      <DrawPanel isConfirmed={confirmed} />

      <ManualFlightManager
        key={flights
          .map((flight) =>
            [
              flight.id,
              flight.name,
              flight.teeTime?.toISOString() ?? '',
              ...flight.members.map((member) => member.competitionPlayerId),
            ].join(':'),
          )
          .join('|')}
        isConfirmed={confirmed}
        hasPairs={hasPairs}
        players={players.map((player) => ({
          competitionPlayerId: player.competitionPlayerId,
          displayName: player.displayName,
          color: player.color,
          handicapIndexTenths: player.handicapIndexTenths,
          knowsCourse: player.knowsCourse,
        }))}
        savedFlights={flights.map((flight) => ({
          id: flight.id,
          name: flight.name,
          order: flight.order,
          memberIds: flight.members.map((member) => member.competitionPlayerId),
          teeTime: flight.teeTime?.toISOString() ?? null,
        }))}
      />

      {confirmed ? (
        <Alert tone="success" role="status">
          Los partidos están confirmados. Ya puedes ir a <Link href="/admin/parejas">Parejas</Link> y realizar la segunda fase.
        </Alert>
      ) : null}

      {flights.length === 0 ? (
        <StateBlock title="Todavía no hay partidos" icon={<IconUsers />}>
          Usa el sorteo automático o la configuración manual. Las parejas permanecerán bloqueadas hasta confirmar los partidos.
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

      {confirmed && context.flightDrawSeed ? (
        <div className="draw-seed draw-seed--saved" role="note" aria-label="Semilla del sorteo de partidos confirmado">
          <span>Semilla del sorteo de partidos</span>
          <code>{context.flightDrawSeed}</code>
          <small>
            Guárdala para regenerar esta misma composición con la configuración actual de participantes.
          </small>
        </div>
      ) : confirmed ? (
        <p className="muted draw-seed-note">
          Esta composición se creó o ajustó manualmente. No tiene semilla porque no procede de un sorteo aleatorio.
        </p>
      ) : null}
    </div>
  );
}
