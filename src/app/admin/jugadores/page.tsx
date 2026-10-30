import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { HandicapForm } from '@/components/client/handicap-form';
import { CreatePlayerForm } from '@/components/client/create-player-form';
import { PlayerAccessPanel } from '@/components/client/player-access-panel';
import { AdminSection, StateBlock, StatusBadge } from '@/components/ui';
import { IconUsers } from '@/components/ui/icons';
import { formatTenths } from '@/lib/golf/decimal';

export const metadata = { title: 'Admin · Jugadores' };

/**
 * Jugadores.
 *
 * Una ficha por jugador con su hándicap exacto, el aplicable cuando el limite lo
 * cambia, y el de juego resultante. Los tres valores se muestran juntos a
 * proposito: es el sitio donde alguien comprueba por que a un jugador le salen
 * los golpes que le salen, y tenerlos separados obliga a reconstruir el calculo
 * de memoria.
 */
export default async function AdminPlayersPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconUsers />}>
        Confirma una valoracion de campo antes de asignar hándicaps.
      </StateBlock>
    );
  }

  const cards = await getAllScorecards(context, { includeInactive: true });
  const activeCards = cards.filter((card) => card.isActive);
  const capped = activeCards.filter((card) => card.handicapCap.isCapped);

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Jugadores</h1>
        <div className="button-row">
          <StatusBadge tone="neutral">{activeCards.length} activos</StatusBadge>
          {cards.length !== activeCards.length ? (
            <StatusBadge tone="danger">{cards.length - activeCards.length} de baja</StatusBadge>
          ) : null}
        </div>
      </div>

      <p className="muted">
        El hándicap exacto se introduce con coma o con punto. Un hándicap plus se escribe con el
        signo mas delante: +2,4. Al guardarlo se recalculan hándicap de campo, hándicap de juego,
        reparto de golpes, netos, puntos y clasificacion.
      </p>

      {context.maxHandicapIndexTenths !== null ? (
        <p className="muted">
          <StatusBadge tone="gold">
            Limite {formatTenths(context.maxHandicapIndexTenths)}
          </StatusBadge>{' '}
          {capped.length === 0
            ? 'Ningun jugador lo supera.'
            : `${capped.length} jugador(es) compiten con el valor limitado. Su hándicap exacto se conserva.`}
        </p>
      ) : null}

      <CreatePlayerForm />

      {cards.length === 0 ? (
        <StateBlock title="Todavia no hay jugadores inscritos" icon={<IconUsers />}>
          Añade el primero con el formulario de arriba.
        </StateBlock>
      ) : null}

      {cards.map((card) => (
        <AdminSection
          key={card.competitionPlayerId}
          title={card.displayName}
          action={
            <div className="button-row">
              {card.handicapCap.badge ? (
                <StatusBadge tone="gold">{card.handicapCap.badge}</StatusBadge>
              ) : null}
              {!card.isActive ? <StatusBadge tone="danger">De baja</StatusBadge> : null}
              {card.pairNumber !== null ? (
                <StatusBadge tone="green">Pareja {card.pairNumber}</StatusBadge>
              ) : null}
              {card.isActive && card.flightName ? (
                <StatusBadge tone="neutral">{card.flightName}</StatusBadge>
              ) : card.isActive ? (
                <StatusBadge tone="warning">Sin partido</StatusBadge>
              ) : null}
            </div>
          }
        >
          <div className="table-scroll">
            <table className="data">
              <tbody>
                <tr>
                  <th>HCP exacto</th>
                  <td>{card.handicapCap.exactLabel ?? 'Sin hándicap'}</td>
                </tr>
                {card.handicapCap.isCapped ? (
                  <tr>
                    <th>HCP aplicable</th>
                    <td>{card.handicapCap.appliedLabel}</td>
                  </tr>
                ) : null}
                <tr>
                  <th>HCP de juego</th>
                  <td>{card.playingHandicap ?? '\u2014'}</td>
                </tr>
                <tr>
                  <th>Conoce el campo</th>
                  <td>{card.knowsCourse ? 'Sí' : 'No'}</td>
                </tr>
                <tr>
                  <th>Color</th>
                  <td>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        verticalAlign: 'middle',
                        marginRight: 6,
                        backgroundColor: card.color,
                      }}
                    />
                    {card.color}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <HandicapForm
            competitionPlayerId={card.competitionPlayerId}
            current={card.handicapCap.exactLabel ?? ''}
          />

          <PlayerAccessPanel
            competitionPlayerId={card.competitionPlayerId}
            displayName={card.displayName}
            isActive={card.isActive}
            userRole={card.userRole}
            knowsCourse={card.knowsCourse}
          />
        </AdminSection>
      ))}
    </div>
  );
}
