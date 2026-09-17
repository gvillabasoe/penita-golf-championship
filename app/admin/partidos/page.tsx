import { getCompetition, getFlights } from '@/lib/data/queries';
import { DrawPanel } from '@/components/client/draw-panel';

export const metadata = { title: 'Admin · Partidos' };

export default async function AdminFlightsPage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

  const flights = await getFlights(context);
  const format = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Partidos</h1>
      </header>

      <DrawPanel />

      {flights.length === 0 ? (
        <p className="card">Todavia no hay partidos. Usa el sorteo.</p>
      ) : (
        flights.map((flight) => (
          <section key={flight.id} className="card" aria-label={flight.name}>
            <div className="page-header">
              <div>
                <h2>{flight.name}</h2>
                <p className="muted">
                  {flight.teeTime ? `Salida ${format.format(flight.teeTime)}` : 'Sin hora'}
                </p>
              </div>
            </div>
            <table className="data">
              <thead>
                <tr><th>Jugador</th><th>Hcp</th><th>HJ</th><th>Hoyos</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {flight.members.map((member) => (
                  <tr key={member.competitionPlayerId}>
                    <td>{member.displayName}</td>
                    <td>
                      {member.handicapIndexTenths !== null
                        ? (member.handicapIndexTenths / 10).toFixed(1).replace('.', ',')
                        : '-'}
                    </td>
                    <td>{member.playingHandicap ?? '-'}</td>
                    <td>{member.holesCompleted}/18</td>
                    <td>{member.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
