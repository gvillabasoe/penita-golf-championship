import { requireSession } from '@/lib/auth/server';
import { getCompetition, getRanking } from '@/lib/data/queries';
import { Leaderboard } from '@/components/leaderboard';
import { BottomNav } from '@/components/client/bottom-nav';
import { AutoRefresh } from '@/components/client/auto-refresh';
import { AppHeader } from '@/components/ui/app-header';
import { StateBlock, StatusBadge } from '@/components/ui';
import { IconTrophy } from '@/components/ui/icons';

export const metadata = { title: 'Clasificacion · Peñita Golf' };

const REVEAL_LABEL: Record<string, { label: string; tone: 'neutral' | 'gold' | 'green' }> = {
  HIDDEN: { label: 'Sin publicar', tone: 'neutral' },
  REVEALING: { label: 'En revelacion', tone: 'gold' },
  PUBLISHED: { label: 'Publicada', tone: 'green' },
};

/**
 * Clasificacion.
 *
 * El leaderboard oficial del campeonato. La visibilidad NO se decide aqui: la
 * decide `visibleGroupCount` dentro de `Leaderboard`, que es la misma funcion
 * que gobierna la maquina de estados de la revelacion. Si esta pantalla
 * decidiese por su cuenta cuantas posiciones pintar, podria filtrar al ganador
 * antes de tiempo, que es el unico error irreparable de toda la aplicacion.
 */
export default async function LeaderboardPage() {
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

  const { rows, order, state } = await getRanking(context);
  const status = REVEAL_LABEL[state.status] ?? REVEAL_LABEL.HIDDEN;

  return (
    <>
      <AppHeader
        screen="Clasificacion"
        action={<StatusBadge tone="onGreen">{status.label}</StatusBadge>}
      />

      <main className="container stack page-content">
        <p className="muted">
          {context.edition} · Individual Stableford · {rows.length} jugadores
        </p>

        {/*
          Durante la revelacion todos los dispositivos tienen que ir a la vez, y
          sin WebSockets: se refresca cada pocos segundos. Fuera de la
          revelacion no hace falta y no se refresca.
        */}
        {state.status === 'REVEALING' ? <AutoRefresh intervalMs={4000} /> : null}

        <Leaderboard rows={rows} revealOrder={order} state={state} role={user.role} />

        {state.status === 'PUBLISHED' ? (
          <p className="muted">
            Criterios de desempate, en orden: mas puntos, menor hándicap exacto y menor suma de
            golpes ajustada. Las rayas se cuentan como doble bogey neto, para que levantar la
            bola no de ventaja.
          </p>
        ) : null}
      </main>

      <BottomNav role={user.role} />
    </>
  );
}
