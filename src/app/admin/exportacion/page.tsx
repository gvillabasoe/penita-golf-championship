import type { ReactNode } from 'react';

import {
  getAllScorecards,
  getCompetition,
  getFlights,
  getPairCompetition,
} from '@/lib/data/queries';
import { canExport } from '@/lib/export/guards';
import { AdminSection, Alert, ButtonLink, StateBlock, StatusBadge } from '@/components/ui';
import { IconGrid } from '@/components/ui/icons';
import { PAIR_SCORING_LABELS } from '@/lib/golf/pairs';

export const metadata = { title: 'Admin · Exportacion' };

function ExportOption({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <article className="export-option">
      <div className="export-option__copy">
        <span className="export-option__eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        <p className="muted">{description}</p>
      </div>
      <div className="export-option__actions">{children}</div>
    </article>
  );
}

export default async function AdminExportPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconGrid />}>
        No hay nada que exportar todavia.
      </StateBlock>
    );
  }

  const [cards, flights] = await Promise.all([
    getAllScorecards(context),
    getFlights(context),
  ]);
  const pairView = context.pairModeEnabled
    ? await getPairCompetition(context, cards)
    : { pairs: [], ranking: [], unpaired: [] };

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
  const hasCards = cards.length > 0;
  const hasConfirmedFlights =
    context.flightsConfirmedAt !== null && flights.some((flight) => flight.status === 'CONFIRMED');
  const hasPairs = context.pairModeEnabled && pairView.pairs.length > 0;
  const classificationLabel = finalDecision.allowed ? 'Definitivo' : 'Provisional';

  return (
    <div className="stack">
      <div className="section-header export-page__header">
        <div>
          <h1>Exportacion</h1>
          <p className="muted">
            Documentos A4 oficiales con la identidad visual del campeonato.
          </p>
        </div>
        <StatusBadge tone={finalDecision.allowed ? 'green' : 'warning'}>
          {classificationLabel}
        </StatusBadge>
      </div>

      <AdminSection
        title="PDF completo"
        description="Sorteos, clasificaciones y todas las tarjetas, ordenados por secciones."
      >
        <div className="export-feature">
          <div className="export-feature__copy">
            <span className="export-option__eyebrow">Dossier oficial</span>
            <h3>{context.name}</h3>
            <p>
              Incluye portada, partidos, clasificacion individual, tarjetas individuales
              {hasPairs ? ', parejas, clasificacion por parejas y sus tarjetas' : ''}.
              Las seeds aparecen al final de cada seccion de sorteo.
            </p>
          </div>
          {hasCards ? (
            <ButtonLink href="/api/export/full" tone="premium" size="lg">
              Descargar PDF completo
            </ButtonLink>
          ) : (
            <span className="muted export-option__unavailable">
              Añade participantes activos para generar el dossier.
            </span>
          )}
        </div>
        {!finalDecision.allowed ? (
          <Alert role="note">
            El dossier se generara claramente marcado como provisional hasta publicar la
            clasificacion.
          </Alert>
        ) : null}
      </AdminSection>

      <AdminSection
        title="Clasificaciones"
        description="Maquetacion propia para lectura rapida, podio, desempates y progreso."
      >
        <div className="export-grid">
          <ExportOption
            eyebrow="Individual"
            title="Clasificacion individual"
            description="Tabla A4 con posiciones, HCP, puntos Stableford y seed del sorteo de partidos."
          >
            {finalDecision.allowed ? (
              <>
                <ButtonLink href="/api/export/leaderboard?format=pdf">
                  PDF definitivo
                </ButtonLink>
                <ButtonLink href="/api/export/leaderboard?format=png" tone="secondary">
                  Imagen para WhatsApp
                </ButtonLink>
              </>
            ) : provisionalDecision.allowed ? (
              <ButtonLink href="/api/export/leaderboard-provisional">
                PDF provisional
              </ButtonLink>
            ) : (
              <Alert role="note">{finalDecision.reason}</Alert>
            )}
          </ExportOption>

          <ExportOption
            eyebrow="Parejas"
            title="Clasificacion por parejas"
            description={
              context.pairModeEnabled
                ? `${PAIR_SCORING_LABELS[context.pairScoringMode]}. Incluye la seed del sorteo de parejas.`
                : 'Activa el modo parejas para generar esta clasificacion.'
            }
          >
            {hasPairs ? (
              <ButtonLink href="/api/export/pair-leaderboard">
                PDF {finalDecision.allowed ? 'definitivo' : 'provisional'}
              </ButtonLink>
            ) : (
              <span className="muted export-option__unavailable">
                {context.pairModeEnabled ? 'Aun no hay parejas sorteadas.' : 'Modo parejas inactivo.'}
              </span>
            )}
          </ExportOption>
        </div>
      </AdminSection>

      <AdminSection
        title="Tarjetas"
        description="Una tarjeta completa por pagina, sin cortes entre hojas."
      >
        <div className="export-grid">
          <ExportOption
            eyebrow={`${cards.length} participantes`}
            title="Tarjetas individuales"
            description="Todas las tarjetas activas, con los 18 hoyos, golpes recibidos, resultado y totales."
          >
            {hasCards ? (
              <ButtonLink href="/api/export/individual-scorecards">
                Descargar todas
              </ButtonLink>
            ) : (
              <span className="muted export-option__unavailable">
                Sin tarjetas disponibles.
              </span>
            )}
          </ExportOption>

          <ExportOption
            eyebrow={hasPairs ? `${pairView.pairs.length} equipos` : 'Parejas'}
            title="Tarjetas de parejas"
            description={
              context.pairScoringMode === 'BEST_BALL'
                ? 'Una tarjeta unica de mejor bola con el jugador que aporta cada hoyo.'
                : 'Las dos tarjetas individuales agrupadas por pareja.'
            }
          >
            {hasPairs ? (
              <ButtonLink href="/api/export/pair-scorecards">Descargar todas</ButtonLink>
            ) : (
              <span className="muted export-option__unavailable">Sin parejas disponibles.</span>
            )}
          </ExportOption>
        </div>

        {cards.some((card) => card.scorecardId !== null) ? (
          <details className="export-details">
            <summary>Descargar una tarjeta individual concreta</summary>
            <ul className="flight-card__members">
              {cards
                .filter((card) => card.scorecardId !== null)
                .map((card) => (
                  <li key={card.competitionPlayerId}>
                    <a href={`/api/export/scorecard/${card.scorecardId}`}>{card.displayName}</a>
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </AdminSection>

      <AdminSection
        title="Sorteos"
        description="Composicion confirmada y seed reproducible al final del documento."
      >
        <div className="button-row">
          {hasConfirmedFlights ? (
            <ButtonLink href="/api/export/flight-draw" tone="secondary">
              Sorteo de partidos
            </ButtonLink>
          ) : (
            <span className="muted">Confirma los partidos para exportar su sorteo.</span>
          )}
          {hasPairs ? (
            <ButtonLink href="/api/export/pair-draw" tone="secondary">
              Sorteo de parejas
            </ButtonLink>
          ) : null}
        </div>
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
