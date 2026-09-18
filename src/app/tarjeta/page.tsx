import { requireSession } from '@/lib/auth/server';
import { getCompetition, getScorecard } from '@/lib/data/queries';
import { ScorecardList } from '@/components/scorecard';
import { ScorecardGrid } from '@/components/scorecard-grid';
import { BottomNav } from '@/components/client/bottom-nav';
import { FinishCardButton } from '@/components/client/finish-card';
import { LogoutButton } from '@/components/client/logout-button';
import { nextPendingHole, lastPlayedHole, checkCanFinish } from '@/lib/scorecard/session';
import { AppHeader } from '@/components/ui/app-header';
import { TournamentHero } from '@/components/ui/tournament-hero';
import {
  Alert,
  ButtonLink,
  CardStatusBadge,
  DataChip,
  StateBlock,
  StatTile,
  StatusBadge,
} from '@/components/ui';
import { IconFlag, IconLock, IconUsers } from '@/components/ui/icons';

export const metadata = { title: 'Mi tarjeta · Peñita Golf' };

const timeFormat = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Madrid',
});

/**
 * Pantalla principal del jugador.
 *
 * Estructura, de arriba abajo: cabecera, gran tarjeta resumen con el resultado
 * grande y los 18 hoyos comprimidos, la accion principal, los datos del partido
 * y la tarjeta completa.
 *
 * La accion principal cambia de texto segun el estado y es siempre el elemento
 * mas grande de la pantalla: en mitad de una vuelta, lo unico que hace falta es
 * llegar al siguiente hoyo de un toque.
 */
export default async function ScorecardPage() {
  const user = await requireSession('/tarjeta');
  const context = await getCompetition();

  if (!context) {
    return (
      <>
        <AppHeader screen="Mi tarjeta" />
        <main className="container stack">
          <StateBlock title="El campeonato todavia no esta configurado" icon={<IconFlag />}>
            El organizador tiene que confirmar la valoracion del campo antes de que se puedan
            apuntar resultados. Habla con el.
          </StateBlock>
        </main>
        <BottomNav role={user.role} />
      </>
    );
  }

  if (!user.competitionPlayerId) {
    return (
      <>
        <AppHeader screen="Mi tarjeta" />
        <main className="container stack">
          <StateBlock title="No estas inscrito en esta edicion" icon={<IconUsers />}>
            Tu usuario existe, pero no figura entre los participantes del I Peñita Golf
            Championship. Habla con el organizador.
          </StateBlock>
        </main>
        <BottomNav role={user.role} />
      </>
    );
  }

  const card = await getScorecard(context, user.competitionPlayerId);
  if (!card) {
    return (
      <>
        <AppHeader screen="Mi tarjeta" />
        <main className="container stack">
          <StateBlock title="No se encuentra tu tarjeta" variant="error" icon={<IconFlag />}>
            Estas inscrito pero no hay una tarjeta creada a tu nombre. Avisa al organizador.
          </StateBlock>
        </main>
        <BottomNav role={user.role} />
      </>
    );
  }

  const next = nextPendingHole(card.results, lastPlayedHole(card.results) ?? 0);
  const finish = checkCanFinish(card.results);
  const played = card.totals.total.holesPlayed;
  const isLocked = card.status === 'LOCKED';

  /**
   * Texto de la accion principal.
   *
   * Tres estados y tres textos distintos, porque "Continuar" en un hoyo 1 sin
   * empezar es mentira, y "Comenzar" con quince hoyos apuntados asusta.
   */
  const cta =
    next === null
      ? { label: 'Revisar tarjeta', href: '#tarjeta-completa' }
      : played === 0
        ? { label: 'Comenzar vuelta', href: `/tarjeta/${next}` }
        : { label: `Continuar vuelta · hoyo ${next}`, href: `/tarjeta/${next}` };

  return (
    <>
      <AppHeader
        screen="Mi tarjeta"
        action={<LogoutButton />}
      />

      <main className="container stack">
        <TournamentHero
          course="Ulzama · Bariain"
          date={context.date ? dateFormat.format(context.date) : 'Fecha por confirmar'}
          courseLine={`18 hoyos · Par ${context.snapshot.parTotal}`}
          score={card.totals.total.points}
          scoreNote={`${played}/18 hoyos`}
          chips={
            <>
              <StatusBadge tone="onGreen">Individual Stableford</StatusBadge>
              <StatusBadge tone="onGreen">
                Barras {context.teeColor.toLowerCase()}
              </StatusBadge>
              <CardStatusBadge status={card.status} />
            </>
          }
          nines={{
            out: card.results.filter((r) => r.holeNumber <= 9),
            outTotal: card.totals.out.points,
            in: card.results.filter((r) => r.holeNumber >= 10),
            inTotal: card.totals.in.points,
          }}
        />

        <div className="stack--tight">
          <ButtonLink href={cta.href} size="lg" block>
            {cta.label}
          </ButtonLink>
          <ButtonLink href="/partido" tone="secondary" block>
            Ver mi partido
          </ButtonLink>
        </div>

        {isLocked ? (
          <Alert role="status">
            Tu tarjeta esta bloqueada por el organizador: puedes consultarla, pero no cambiarla.
          </Alert>
        ) : null}

        {card.playingHandicap === null ? (
          <Alert tone="danger" role="alert">
            Todavia no tienes hándicap de juego. Habla con el organizador antes de empezar: los
            puntos no se pueden calcular sin el.
          </Alert>
        ) : null}

        {/* Hándicaps. El exacto se muestra siempre; el aplicable solo cuando el
            limite lo cambia, para no meter ruido a quien no le afecta. */}
        <section className="surface" style={{ padding: 'var(--space-4)' }} aria-label="Mis hándicaps">
          <div className="stat-grid">
            <StatTile
              label="HCP exacto"
              value={card.handicapCap.exactLabel ?? '\u2014'}
              ariaLabel={
                card.handicapCap.exactLabel
                  ? `Hándicap exacto ${card.handicapCap.exactLabel}`
                  : 'Sin hándicap exacto'
              }
            />
            {card.handicapCap.isCapped ? (
              <StatTile
                label="HCP aplicable"
                value={card.handicapCap.appliedLabel ?? '\u2014'}
                ariaLabel={`Hándicap aplicable ${card.handicapCap.appliedLabel}`}
              />
            ) : null}
            <StatTile
              label="HCP de juego"
              value={card.playingHandicap ?? '\u2014'}
              accent
              ariaLabel={
                card.playingHandicap === null
                  ? 'Sin hándicap de juego'
                  : `Hándicap de juego ${card.playingHandicap}`
              }
            />
          </div>

          {card.handicapCap.badge ? (
            <p className="muted" style={{ marginTop: 'var(--space-3)' }}>
              <StatusBadge tone="gold">{card.handicapCap.badge}</StatusBadge>{' '}
              El organizador ha fijado un maximo. Tu hándicap exacto se conserva y sigue
              contando para el desempate.
            </p>
          ) : null}
        </section>

        {/* Mi partido */}
        <section className="surface" style={{ padding: 'var(--space-4)' }} aria-label="Mi partido">
          <p className="eyebrow">Mi partido</p>
          {card.flightName ? (
            <div
              className="button-row"
              style={{ marginTop: 'var(--space-2)', alignItems: 'center' }}
            >
              <DataChip label="Partido" value={card.flightName} />
              <DataChip
                label="Salida"
                value={card.teeTime ? timeFormat.format(card.teeTime) : '\u2014'}
                ariaLabel={
                  card.teeTime
                    ? `Hora de salida ${timeFormat.format(card.teeTime)}`
                    : 'Sin hora de salida'
                }
              />
              <DataChip label="Barras" value={context.teeColor.toLowerCase()} />
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
              Todavia no tienes partido asignado. El organizador lo sortea antes de la salida.
            </p>
          )}
        </section>

        {/* Ida y vuelta */}
        <div className="stat-grid">
          <StatTile
            label="Ida"
            value={card.totals.out.points}
            ariaLabel={`Ida: ${card.totals.out.points} puntos`}
          />
          <StatTile
            label="Vuelta"
            value={card.totals.in.points}
            ariaLabel={`Vuelta: ${card.totals.in.points} puntos`}
          />
          <StatTile
            label="Rayas"
            value={card.totals.total.pickups}
            ariaLabel={`${card.totals.total.pickups} rayas`}
          />
        </div>

        <section id="tarjeta-completa" className="stack" aria-label="Tarjeta completa">
          <div className="section-header">
            <h2>Tarjeta completa</h2>
          </div>
          <ScorecardGrid
            results={card.results}
            holes={context.snapshot.holes}
            totals={card.totals}
            playerName={card.displayName}
            initialView={played > 9 ? 'IN' : 'OUT'}
          />
        </section>

        <section className="stack" aria-label="Hoyo a hoyo">
          <div className="section-header">
            <h2>Hoyo a hoyo</h2>
            {isLocked ? <StatusBadge tone="warning" icon={<IconLock size={14} />}>Bloqueada</StatusBadge> : null}
          </div>
          <ScorecardList
            results={card.results}
            distances={context.distances}
            totals={card.totals}
            currentHole={next ?? undefined}
            overriddenHoles={card.overriddenHoles}
            readOnly={isLocked}
            holeHref={(hole) => `/tarjeta/${hole}`}
          />
        </section>

        {!isLocked && !card.playerConfirmedFinish ? (
          <FinishCardButton canFinish={finish.canFinish} message={finish.message} />
        ) : null}

        {card.playerConfirmedFinish ? (
          <Alert tone="success" role="status">
            Tarjeta finalizada
            {card.reviewedAt
              ? ' y revisada por un jugador de tu partido.'
              : '. Falta que la revise alguien de tu partido.'}
          </Alert>
        ) : null}
      </main>

      <BottomNav role={user.role} />
    </>
  );
}
