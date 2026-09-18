import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { canExport } from '@/lib/export/guards';
import { AdminSection, Alert, ButtonLink, StateBlock } from '@/components/ui';
import { IconGrid } from '@/components/ui/icons';

export const metadata = { title: 'Admin · Exportacion' };

export default async function AdminExportPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconGrid />}>
        No hay nada que exportar todavia.
      </StateBlock>
    );
  }

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
      <div className="section-header">
        <h1>Exportacion</h1>
      </div>

      <AdminSection
        title="Clasificacion"
        description="El PDF definitivo solo se genera con la clasificacion publicada."
      >
        {finalDecision.allowed ? (
          <div className="button-row">
            <ButtonLink href="/api/export/leaderboard?format=pdf">PDF definitivo</ButtonLink>
            <ButtonLink href="/api/export/leaderboard?format=png" tone="secondary">
              Imagen para WhatsApp
            </ButtonLink>
          </div>
        ) : (
          <Alert role="note">{finalDecision.reason}</Alert>
        )}

        {provisionalDecision.allowed ? (
          <ButtonLink href="/api/export/leaderboard-provisional" tone="secondary">
            PDF provisional (marcado como tal)
          </ButtonLink>
        ) : null}
      </AdminSection>

      <AdminSection title="Tarjetas" description="Una por jugador, con los 18 hoyos.">
        {cards.filter((card) => card.scorecardId !== null).length === 0 ? (
          <p className="muted">Todavia no hay tarjetas creadas.</p>
        ) : (
          <ul className="flight-card__members">
            {cards
              .filter((card) => card.scorecardId !== null)
              .map((card) => (
                <li key={card.competitionPlayerId}>
                  <a href={`/api/export/scorecard/${card.scorecardId}`}>{card.displayName}</a>
                </li>
              ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="Otros documentos">
        <div className="button-row">
          <ButtonLink href="/api/export/audit" tone="secondary" size="sm">
            Historial de auditoria
          </ButtonLink>
          <ButtonLink href="/api/export/course-config" tone="secondary" size="sm">
            Configuracion del campo
          </ButtonLink>
        </div>
      </AdminSection>
    </div>
  );
}
