import { getCompetition } from '@/lib/data/queries';
import { validateCourseSnapshot } from '@/lib/golf/course';
import { roundingPolicyDivergences } from '@/lib/golf/handicap';
import { RulesForm } from '@/components/client/rules-form';

export const metadata = { title: 'Admin · Campo y modalidad' };

export default async function AdminCoursePage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

  const issues = validateCourseSnapshot(context.snapshot);
  const divergences = roundingPolicyDivergences(context.snapshot, context.allowancePercent, 0, 400);

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Campo y modalidad</h1>
      </header>

      <section className="card" aria-label="Valoracion activa">
        <h2>Valoracion activa</h2>
        <table className="data">
          <tbody>
            <tr><th>Club</th><td>Club de Golf Ulzama (4401)</td></tr>
            <tr><th>Recorrido</th><td>Ulzama · barras {context.teeColor.toLowerCase()} · {context.category.toLowerCase()}</td></tr>
            <tr><th>Valor de Campo</th><td>{(context.snapshot.courseRatingTenths / 10).toFixed(1).replace('.', ',')}</td></tr>
            <tr><th>Slope</th><td>{context.snapshot.slopeRating}</td></tr>
            <tr><th>Par</th><td>{context.snapshot.parTotal}</td></tr>
            <tr><th>Distancia</th><td>{context.snapshot.distanceTotal} m</td></tr>
            <tr><th>Vigencia</th><td>julio de 2024</td></tr>
          </tbody>
        </table>
        <p className="muted">
          {issues.length === 0
            ? 'Los datos del campo pasan todas las validaciones.'
            : `${issues.length} incidencia(s): ${issues.map((i) => i.message).join(' ')}`}
        </p>
      </section>

      <section className="card" aria-label="Hoyos">
        <h2>Hoyos</h2>
        <table className="data">
          <thead>
            <tr><th>Hoyo</th><th>Par</th><th>SI</th><th>Metros</th></tr>
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
      </section>

      <RulesForm
        allowancePercent={context.allowancePercent}
        ruleVersion={context.ruleVersion}
        divergenceCount={divergences.length}
        competitionInPlay={context.status === 'IN_PLAY'}
      />
    </div>
  );
}
