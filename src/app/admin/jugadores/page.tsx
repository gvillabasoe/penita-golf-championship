import { getAllScorecards, getCompetition } from '@/lib/data/queries';
import { HandicapForm } from '@/components/client/handicap-form';

export const metadata = { title: 'Admin · Jugadores' };

export default async function AdminPlayersPage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

  const cards = await getAllScorecards(context);

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Jugadores</h1>
      </header>

      <p className="muted">
        El hándicap exacto se introduce con coma o con punto. Un hándicap plus se escribe con el
        signo mas delante: +2,4. Al guardarlo se recalculan hándicap de campo, hándicap de juego,
        reparto de golpes, netos, puntos y clasificacion.
      </p>

      {cards.map((card) => (
        <section key={card.competitionPlayerId} className="card stack">
          <div className="page-header">
            <div>
              <h2>{card.displayName}</h2>
              <p className="muted">
                {card.handicapIndexTenths !== null
                  ? `Hcp ${(card.handicapIndexTenths / 10).toFixed(1).replace('.', ',')} · HJ ${card.playingHandicap}`
                  : 'Sin hándicap'}
                {card.flightName ? ` · ${card.flightName}` : ' · sin partido'}
              </p>
            </div>
          </div>

          <HandicapForm
            competitionPlayerId={card.competitionPlayerId}
            current={
              card.handicapIndexTenths === null
                ? ''
                : (card.handicapIndexTenths / 10).toFixed(1).replace('.', ',')
            }
          />
        </section>
      ))}
    </div>
  );
}
