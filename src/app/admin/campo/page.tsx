import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { validateCourseSnapshot } from '@/lib/golf/course';
import { roundingPolicyDivergences } from '@/lib/golf/handicap';
import { RulesForm } from '@/components/client/rules-form';
import { HandicapCapPanel } from '@/components/client/handicap-cap-panel';
import { AdminSection, Alert, StateBlock, StatTile } from '@/components/ui';
import { IconGrid } from '@/components/ui/icons';
import { formatTenths } from '@/lib/golf/decimal';

export const metadata = { title: 'Admin · Campo y modalidad' };

/**
 * Campo y modalidad.
 *
 * Aqui vive toda la configuracion que entra en el calculo: la valoracion
 * congelada, los 18 hoyos, las reglas de redondeo y el limite de hándicap. El
 * limite se ha puesto en esta seccion y no en una pestana nueva porque es un
 * parametro de calculo mas, y separarlo de las reglas con las que se combina
 * obligaria a saltar de pantalla para entender un hándicap de juego.
 */
export default async function AdminCoursePage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconGrid />}>
        Hay que importar y confirmar una valoracion del campo antes de configurar nada mas.
      </StateBlock>
    );
  }

  const [issues, cards] = await Promise.all([
    Promise.resolve(validateCourseSnapshot(context.snapshot)),
    getAllScorecards(context),
  ]);

  const divergences = roundingPolicyDivergences(context.snapshot, context.allowancePercent, 0, 400);
  const capped = cards.filter((card) => card.handicapCap.isCapped).length;
  const hasScores = cards.some((card) => card.totals.total.holesPlayed > 0);

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Campo y modalidad</h1>
      </div>

      <AdminSection
        title="Valoracion activa"
        description="Congelada para esta edicion. Si la fuente cambia se crea otro snapshot; este no se toca."
      >
        <div className="dashboard-grid">
          <StatTile
            label="Valor de campo"
            value={formatTenths(context.snapshot.courseRatingTenths)}
          />
          <StatTile label="Slope" value={context.snapshot.slopeRating} />
          <StatTile label="Par" value={context.snapshot.parTotal} />
          <StatTile label="Metros" value={context.snapshot.distanceTotal} />
        </div>

        <div className="table-scroll">
          <table className="data">
            <tbody>
              <tr>
                <th>Club</th>
                <td>Club de Golf Ulzama (4401)</td>
              </tr>
              <tr>
                <th>Recorrido</th>
                <td>
                  Ulzama · barras {context.teeColor.toLowerCase()} ·{' '}
                  {context.category.toLowerCase()}
                </td>
              </tr>
              <tr>
                <th>Vigencia</th>
                <td>julio de 2024</td>
              </tr>
            </tbody>
          </table>
        </div>

        {issues.length === 0 ? (
          <Alert tone="success" role="status">
            Los datos del campo pasan todas las validaciones.
          </Alert>
        ) : (
          <Alert tone="danger" role="alert">
            {issues.length} incidencia(s): {issues.map((i) => i.message).join(' ')}
          </Alert>
        )}
      </AdminSection>

      <AdminSection title="Hoyos" description="Par, stroke index y distancia de cada hoyo.">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Hoyo</th>
                <th>Par</th>
                <th>SI</th>
                <th>Metros</th>
              </tr>
            </thead>
            <tbody>
              {context.snapshot.holes.map((hole) => (
                <tr key={hole.holeNumber}>
                  <td>{hole.holeNumber}</td>
                  <td>{hole.par}</td>
                  <td>{hole.strokeIndex}</td>
                  <td>{hole.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <HandicapCapPanel
        currentLabel={
          context.maxHandicapIndexTenths === null
            ? null
            : formatTenths(context.maxHandicapIndexTenths)
        }
        cappedPlayers={capped}
        hasScores={hasScores}
        disabled={context.status === 'CLOSED'}
      />

      <RulesForm
        allowancePercent={context.allowancePercent}
        ruleVersion={context.ruleVersion}
        divergenceCount={divergences.length}
        competitionInPlay={context.status === 'IN_PLAY'}
      />
    </div>
  );
}
