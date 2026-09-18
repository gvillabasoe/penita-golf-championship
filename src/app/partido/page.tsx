import { requireSession } from '@/lib/auth/server';
import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { ScorecardGrid } from '@/components/scorecard-grid';
import { BottomNav } from '@/components/client/bottom-nav';
import { ReviewButton } from '@/components/client/review-button';
import { cardAccess, canReviewCard } from '@/lib/scorecard/visibility';
import { AppHeader } from '@/components/ui/app-header';
import {
  Alert,
  CardStatusBadge,
  DataChip,
  StateBlock,
  StatusBadge,
} from '@/components/ui';
import { IconLock, IconUsers } from '@/components/ui/icons';

export const metadata = { title: 'Mi partido · Peñita Golf' };

const timeFormat = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

/**
 * Ver partido.
 *
 * Cada jugador en una tarjeta compacta: color, nombre, hándicaps, puntos, hoyos
 * y estado. La propia se distingue con borde verde Y con una insignia, y las de
 * los demas dicen explicitamente que son de solo lectura.
 *
 * Los permisos NO cambian: quien ve que tarjeta lo decide `cardAccess`, que ya
 * tiene sus tests. Esta pantalla solo pinta lo que aquella funcion autoriza.
 */
export default async function FlightPage() {
  const user = await requireSession('/partido');
  const context = await getCompetition();

  if (!context || !user.competitionPlayerId) {
    return (
      <>
        <AppHeader screen="Mi partido" />
        <main className="container stack">
          <StateBlock title="El campeonato todavia no esta configurado" icon={<IconUsers />}>
            Cuando el organizador confirme el campo y sortee los partidos, aqui aparecera el
            tuyo.
          </StateBlock>
        </main>
        <BottomNav role={user.role} />
      </>
    );
  }

  const viewer = {
    competitionPlayerId: user.competitionPlayerId,
    role: user.role,
    flightId: user.flightId,
  };

  const all = await getAllScorecards(context);
  const visible = all.filter((card) => {
    const access = cardAccess(
      viewer,
      {
        competitionPlayerId: card.competitionPlayerId,
        flightId: card.flightId,
        status: card.status,
      },
      context.classificationStatus,
    );
    return access.access !== 'NONE';
  });

  const mine = visible.find((card) => card.competitionPlayerId === user.competitionPlayerId);

  return (
    <>
      <AppHeader screen={mine?.flightName ?? 'Mi partido'} />

      <main className="container stack">
        {/* Cabecera del partido: hora de salida y campo. */}
        <section className="flight-card" aria-label="Datos del partido">
          <div className="flight-card__header">
            <div>
              <p className="eyebrow">Hora de salida</p>
              <p className="flight-card__tee-time">
                {mine?.teeTime ? timeFormat.format(mine.teeTime) : 'Sin hora'}
              </p>
            </div>
            <div className="button-row">
              <DataChip label="Campo" value="Ulzama" />
              <DataChip label="Barras" value={context.teeColor.toLowerCase()} />
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="muted">
              Todavia no hay tarjetas visibles. Las de otros partidos no se ven hasta que se
              publica la clasificacion.
            </p>
          ) : (
            <ul className="flight-card__members">
              {visible.map((card) => {
                const own = card.competitionPlayerId === user.competitionPlayerId;

                return (
                  <li key={card.competitionPlayerId}>
                    <div className={`player-card${own ? ' player-card--own' : ''}`}>
                      <span
                        className="player-card__color"
                        style={{ backgroundColor: card.color }}
                        aria-hidden="true"
                      />
                      <div className="player-card__body">
                        <p className="player-card__name">
                          {card.displayName}
                          {own ? <StatusBadge tone="green">Tu tarjeta</StatusBadge> : null}
                          {card.status === 'LOCKED' ? (
                            <StatusBadge tone="warning" icon={<IconLock size={14} />}>
                              Bloqueada
                            </StatusBadge>
                          ) : null}
                        </p>
                        <p className="player-card__meta">
                          <span>
                            HCP {card.handicapCap.exactLabel ?? '\u2014'}
                          </span>
                          {card.handicapCap.isCapped ? (
                            <span>Aplicable {card.handicapCap.appliedLabel}</span>
                          ) : null}
                          <span>HJ {card.playingHandicap ?? '\u2014'}</span>
                          <span>{card.totals.total.pickups} rayas</span>
                        </p>
                        {card.handicapCap.badge ? (
                          <p className="player-card__meta">
                            <StatusBadge tone="gold">{card.handicapCap.badge}</StatusBadge>
                          </p>
                        ) : null}
                      </div>
                      <div className="player-card__score">
                        <span
                          className="player-card__points"
                          aria-label={`${card.totals.total.points} puntos Stableford`}
                        >
                          {card.totals.total.points}
                        </span>
                        <span className="player-card__holes">
                          {card.totals.total.holesPlayed}/18
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Tarjeta de cada jugador visible. */}
        {visible.map((card) => {
          const own = card.competitionPlayerId === user.competitionPlayerId;
          const eligibility = canReviewCard(viewer, {
            competitionPlayerId: card.competitionPlayerId,
            flightId: card.flightId,
            status: card.status,
          });

          return (
            <section
              key={card.competitionPlayerId}
              className="stack"
              aria-label={`Tarjeta de ${card.displayName}`}
            >
              <div className="section-header">
                <h2>{card.displayName}</h2>
                <div className="button-row">
                  <CardStatusBadge status={card.status} />
                  {!own ? <StatusBadge tone="neutral">Solo lectura</StatusBadge> : null}
                </div>
              </div>

              <ScorecardGrid
                results={card.results}
                holes={context.snapshot.holes}
                totals={card.totals}
                playerName={card.displayName}
              />

              {eligibility.canReview ? (
                <ReviewButton
                  competitionPlayerId={card.competitionPlayerId}
                  displayName={card.displayName}
                />
              ) : eligibility.reason !== null && !own ? (
                <Alert role="note">{eligibility.reason}</Alert>
              ) : null}
            </section>
          );
        })}
      </main>

      <BottomNav role={user.role} />
    </>
  );
}
