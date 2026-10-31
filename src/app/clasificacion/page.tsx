import Link from 'next/link';

import { requireSession } from '@/lib/auth/server';
import { getCompetition, getPairCompetition, getRanking } from '@/lib/data/queries';
import { Leaderboard } from '@/components/leaderboard';
import { PairLeaderboard } from '@/components/pair-leaderboard';
import { PairScorecards } from '@/components/pair-scorecards';
import { BottomNav } from '@/components/client/bottom-nav';
import { AppHeader } from '@/components/ui/app-header';
import { StateBlock, StatusBadge } from '@/components/ui';
import { IconTrophy } from '@/components/ui/icons';
import { PAIR_SCORING_LABELS } from '@/lib/golf/pairs';

export const metadata = { title: 'Clasificacion · Peñita Golf' };

/** Clasificacion individual y, cuando esta activado, vista paralela por parejas. */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const user = await requireSession('/clasificacion');
  const context = await getCompetition();

  if (!context) {
    return (
      <>
        <AppHeader screen="Clasificacion" />
        <main className="container stack page-content">
          <StateBlock title="El campeonato todavia no esta configurado" icon={<IconTrophy />}>
            No hay clasificacion que mostrar hasta que el organizador confirme el campo y los
            jugadores empiecen a apuntar.
          </StateBlock>
        </main>
        <BottomNav role={user.role} />
      </>
    );
  }

  const params = await searchParams;
  const pairView = context.pairModeEnabled && params.vista === 'parejas';
  const [{ rows }, pairCompetition] = await Promise.all([
    getRanking(context),
    pairView ? getPairCompetition(context) : Promise.resolve(null),
  ]);
  const isOfficial = context.classificationStatus === 'PUBLISHED';
  const canSeeFullClassification = user.role === 'ADMIN' || isOfficial;

  return (
    <>
      <AppHeader
        screen="Clasificacion"
        action={
          <StatusBadge tone="onGreen">
            {isOfficial ? 'Oficial' : 'Provisional'}
          </StatusBadge>
        }
      />

      <main className="container stack page-content classification-page">
        {context.pairModeEnabled ? (
          <nav className="segmented classification-switch" aria-label="Tipo de clasificacion">
            <Link
              className="segmented__option"
              href="/clasificacion"
              aria-current={!pairView ? 'page' : undefined}
            >
              Individual
            </Link>
            <Link
              className="segmented__option"
              href="/clasificacion?vista=parejas"
              aria-current={pairView ? 'page' : undefined}
            >
              Parejas
            </Link>
          </nav>
        ) : null}

        <section className="classification-overview" aria-label="Resumen de la clasificacion">
          <div className="classification-overview__copy">
            <p className="eyebrow">
              {pairView ? 'Clasificacion de parejas' : 'Clasificacion del campeonato'}
            </p>
            <h2>{context.edition}</h2>
          </div>
          <div className="classification-overview__meta" aria-label="Datos de la competicion">
            <span>
              {pairView
                ? PAIR_SCORING_LABELS[context.pairScoringMode]
                : 'Individual Stableford'}
            </span>
            <span>
              {pairView ? `${pairCompetition?.pairs.length ?? 0} parejas` : `${rows.length} jugadores`}
            </span>
          </div>
        </section>

        {pairView && pairCompetition ? (
          <>
            <PairLeaderboard
              rows={pairCompetition.ranking}
              visible={canSeeFullClassification}
              role={user.role}
            />

            <PairScorecards
              pairs={pairCompetition.pairs}
              holes={context.snapshot.holes}
              currentCompetitionPlayerId={user.competitionPlayerId}
              role={user.role}
              classificationPublished={isOfficial}
            />

            {canSeeFullClassification ? (
              <p className="muted">
                Desempates de parejas: mas puntos, menor suma de hándicap exacto y menor suma de
                golpes ajustados. En mejor bola, cada hoyo usa los puntos Stableford del mejor
                resultado; en suma, se agregan las dos tarjetas completas.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <Leaderboard
              rows={rows}
              visible={canSeeFullClassification}
              role={user.role}
            />

            {canSeeFullClassification ? (
              <p className="muted">
                Criterios de desempate, en orden: mas puntos, menor hándicap exacto y menor suma de
                golpes ajustada. Las rayas se cuentan como doble bogey neto, para que levantar la
                bola no de ventaja.
              </p>
            ) : null}
          </>
        )}
      </main>

      <BottomNav role={user.role} />
    </>
  );
}
