import Link from 'next/link';

import { getAllScorecards, getCompetition, getFlights } from '@/lib/data/queries';
import { assertReadyToPlay } from '@/lib/golf/competition-config';
import { AdminSection, Alert, StateBlock, StatTile, StatusBadge } from '@/components/ui';
import { IconAlert, IconCheck, IconSliders } from '@/components/ui/icons';
import { formatTenths } from '@/lib/golf/decimal';

export const metadata = { title: 'Admin · Resumen' };

const AREA_LINKS: Record<string, string> = {
  CAMPO: '/admin/campo',
  JUGADORES: '/admin/jugadores',
  PARTIDOS: '/admin/partidos',
  REGLAS: '/admin/campo',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  HIDDEN: 'Oculta',
  REVEALING: 'En revelacion',
  PUBLISHED: 'Publicada',
};

/**
 * Resumen del panel.
 *
 * Es un cuadro de mando, no una lista de formularios: arriba el estado en
 * cifras, despues las incidencias que impiden empezar —cada una con enlace al
 * sitio donde se arregla— y al final la configuracion congelada.
 */
export default async function AdminSummaryPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion con valoracion confirmada" icon={<IconSliders />}>
        Hay que crear la competicion y confirmar una valoracion del campo antes de poder
        administrar nada.
      </StateBlock>
    );
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
  const capped = cards.filter((card) => card.handicapCap.isCapped).length;
  const totalPoints = cards.reduce((sum, card) => sum + card.totals.total.points, 0);
  const holesPlayed = cards.reduce((sum, card) => sum + card.totals.total.holesPlayed, 0);

  return (
    <div className="stack">
      <div className="section-header">
        <div>
          <p className="eyebrow">{context.edition}</p>
          <h1>Resumen</h1>
        </div>
        <StatusBadge tone={context.status === 'IN_PLAY' ? 'green' : 'neutral'}>
          {context.status === 'IN_PLAY' ? 'En juego' : context.status}
        </StatusBadge>
      </div>

      {/* Estado del campeonato en cifras. */}
      <div className="dashboard-grid">
        <StatTile label="Jugadores" value={cards.length} />
        <StatTile label="Partidos" value={flights.length} />
        <StatTile
          label="Hoyos apuntados"
          value={`${holesPlayed}/${cards.length * 18}`}
          ariaLabel={`${holesPlayed} de ${cards.length * 18} hoyos apuntados`}
        />
        <StatTile label="Puntos totales" value={totalPoints} accent />
      </div>

      {issues.length === 0 ? (
        <Alert tone="success" role="status">
          Todo listo. No hay incidencias que impidan empezar.
        </Alert>
      ) : (
        <AdminSection
          title={`Incidencias (${issues.length})`}
          description="Cada una enlaza con el sitio donde se resuelve."
        >
          <ul className="critical-zone__facts">
            {issues.map((issue) => (
              <li key={issue.code}>
                <IconAlert size={14} /> {issue.message}{' '}
                <Link href={AREA_LINKS[issue.area] ?? '/admin'}>Resolver</Link>
              </li>
            ))}
          </ul>
        </AdminSection>
      )}

      <AdminSection title="Tarjetas" description="Estado de las tarjetas del campeonato.">
        <div className="dashboard-grid">
          <StatTile label="Sin comenzar" value={byStatus('NOT_STARTED')} />
          <StatTile label="En juego" value={byStatus('IN_PLAY')} />
          <StatTile label="Finalizadas" value={byStatus('FINISHED')} />
          <StatTile label="Revisadas" value={byStatus('REVIEWED')} />
          <StatTile label="Bloqueadas" value={byStatus('LOCKED')} />
        </div>
        <Link href="/admin/tarjetas">Ver y corregir tarjetas</Link>
      </AdminSection>

      <AdminSection
        title="Configuracion congelada"
        description="Lo que se esta jugando. Cambiarlo con la vuelta empezada exige un motivo por escrito."
      >
        <div className="table-scroll">
          <table className="data">
            <tbody>
              <tr>
                <th>Campo</th>
                <td>Ulzama · barras {context.teeColor.toLowerCase()}</td>
              </tr>
              <tr>
                <th>Valoracion</th>
                <td>
                  Vc {formatTenths(context.snapshot.courseRatingTenths)} · Slope{' '}
                  {context.snapshot.slopeRating} · Par {context.snapshot.parTotal}
                </td>
              </tr>
              <tr>
                <th>Asignacion</th>
                <td>{context.allowancePercent} %</td>
              </tr>
              <tr>
                <th>Limite de HCP</th>
                <td>
                  {context.maxHandicapIndexTenths === null ? (
                    'Sin limite'
                  ) : (
                    <>
                      {formatTenths(context.maxHandicapIndexTenths)}{' '}
                      <StatusBadge tone="gold">{capped} limitado(s)</StatusBadge>
                    </>
                  )}
                </td>
              </tr>
              <tr>
                <th>Reglas</th>
                <td>{context.ruleVersion}</td>
              </tr>
              <tr>
                <th>Clasificacion</th>
                <td>
                  {CLASSIFICATION_LABEL[context.classificationStatus] ??
                    context.classificationStatus}
                </td>
              </tr>
              <tr>
                <th>Generacion de resultados</th>
                <td>
                  {context.scoreGeneration}
                  {context.scoreGeneration > 0 ? (
                    <>
                      {' '}
                      <StatusBadge tone="warning">
                        {context.scoreGeneration} vaciado(s)
                      </StatusBadge>
                    </>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">
          <IconCheck size={14} /> La generacion sube cada vez que se vacian las tarjetas. Es lo
          que impide que un movil sin cobertura devuelva a la vida un resultado ya borrado.
        </p>
      </AdminSection>
    </div>
  );
}
