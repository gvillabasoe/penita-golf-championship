import Link from 'next/link';

import { getAllScorecards, getCompetition, getFlights } from '@/lib/data/queries';
import { assertReadyToPlay } from '@/lib/golf/competition-config';

export const metadata = { title: 'Admin · Resumen' };

const AREA_LINKS: Record<string, string> = {
  CAMPO: '/admin/campo',
  JUGADORES: '/admin/jugadores',
  PARTIDOS: '/admin/partidos',
  REGLAS: '/admin/campo',
};

export default async function AdminSummaryPage() {
  const context = await getCompetition();
  if (!context) {
    return <p className="alert">No hay competicion con valoracion confirmada.</p>;
  }

  const [cards, flights] = await Promise.all([
    getAllScorecards(context),
    getFlights(context),
  ]);

  const issues = assertReadyToPlay({
    config: {
      status: context.status,
      allowancePercent: context.allowancePercent,
      roundingPolicy: 'ROUND_TWICE',
      ruleVersion: context.ruleVersion,
      confirmedSnapshotId: context.snapshot.snapshotId,
    },
    activePlayers: cards.length,
    playersWithoutHandicap: cards.filter((c) => c.handicapIndexTenths === null).length,
    playersWithoutFlight: cards.filter((c) => c.flightId === null).length,
    flightsWithoutTeeTime: flights.filter((f) => f.teeTime === null).length,
    duplicatedPlayers: 0,
  });

  const byStatus = (status: string) => cards.filter((c) => c.status === status).length;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Resumen</h1>
          <p className="muted">{context.edition}</p>
        </div>
      </header>

      {issues.length === 0 ? (
        <p className="card" role="status">
          Todo listo. No hay incidencias que impidan empezar.
        </p>
      ) : (
        <section className="card stack" aria-label="Incidencias">
          <h2>Incidencias ({issues.length})</h2>
          <ul>
            {issues.map((issue) => (
              <li key={issue.code}>
                {issue.message}{' '}
                <Link href={AREA_LINKS[issue.area] ?? '/admin'}>Resolver</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-label="Estado de las tarjetas">
        <h2>Tarjetas</h2>
        <table className="data">
          <tbody>
            <tr><th>Sin comenzar</th><td>{byStatus('NOT_STARTED')}</td></tr>
            <tr><th>En juego</th><td>{byStatus('IN_PLAY')}</td></tr>
            <tr><th>Finalizadas</th><td>{byStatus('FINISHED')}</td></tr>
            <tr><th>Revisadas</th><td>{byStatus('REVIEWED')}</td></tr>
            <tr><th>Bloqueadas</th><td>{byStatus('LOCKED')}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card" aria-label="Configuracion">
        <h2>Configuracion</h2>
        <table className="data">
          <tbody>
            <tr><th>Campo</th><td>Ulzama · barras {context.teeColor.toLowerCase()}</td></tr>
            <tr>
              <th>Valoracion</th>
              <td>
                Vc {(context.snapshot.courseRatingTenths / 10).toFixed(1).replace('.', ',')} · Slope{' '}
                {context.snapshot.slopeRating} · Par {context.snapshot.parTotal}
              </td>
            </tr>
            <tr><th>Asignacion</th><td>{context.allowancePercent} %</td></tr>
            <tr><th>Reglas</th><td>{context.ruleVersion}</td></tr>
            <tr><th>Clasificacion</th><td>{context.classificationStatus}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
