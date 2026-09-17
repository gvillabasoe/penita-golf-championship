import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { canExport } from '@/lib/export/guards';

export const metadata = { title: 'Admin · Exportacion' };

export default async function AdminExportPage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

  const cards = await getAllScorecards(context);

  const finalDecision = canExport({
    kind: 'LEADERBOARD_FINAL',
    role: 'ADMIN',
    classificationStatus: context.classificationStatus,
  });
  const provisionalDecision = canExport({
    kind: 'LEADERBOARD_PROVISIONAL',
    role: 'ADMIN',
    classificationStatus: context.classificationStatus,
  });

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Exportacion</h1>
      </header>

      <section className="card stack" aria-label="Clasificacion">
        <h2>Clasificacion</h2>

        {finalDecision.allowed ? (
          <>
            <a className="button button--primary" href="/api/export/leaderboard?format=pdf">
              PDF definitivo
            </a>
            <a className="button button--secondary" href="/api/export/leaderboard?format=png">
              Imagen para WhatsApp
            </a>
          </>
        ) : (
          <p className="alert" role="note">
            {finalDecision.reason}
          </p>
        )}

        {provisionalDecision.allowed ? (
          <a className="button button--secondary" href="/api/export/leaderboard-provisional">
            PDF provisional (marcado)
          </a>
        ) : null}
      </section>

      <section className="card stack" aria-label="Tarjetas">
        <h2>Tarjetas</h2>
        <ul>
          {cards
            .filter((card) => card.scorecardId !== null)
            .map((card) => (
              <li key={card.competitionPlayerId}>
                <a href={`/api/export/scorecard/${card.scorecardId}`}>{card.displayName}</a>
              </li>
            ))}
        </ul>
      </section>

      <section className="card stack" aria-label="Otros">
        <h2>Otros documentos</h2>
        <a href="/api/export/audit">Historial de auditoria</a>
        <a href="/api/export/course-config">Configuracion del campo</a>
      </section>
    </div>
  );
}
