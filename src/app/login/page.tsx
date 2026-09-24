import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/server';
import { getLoginRoster } from '@/lib/data/queries';
import { diagnose } from '@/lib/data/health';
import { LoginForm } from '@/components/client/login-form';
import { StateBlock } from '@/components/ui';
import { IconAlert } from '@/components/ui/icons';

export const metadata = { title: 'Acceso · Peñita Golf Championship' };

/**
 * Pantalla de acceso.
 *
 * Identidad del campeonato arriba, sobre un bloque verde profundo con la misma
 * textura de curvas de nivel que el resto de la aplicacion, y el formulario
 * debajo sobre superficie SOLIDA. Ni cristal, ni pastel, ni logo inventado: el
 * escudo de la Peñita es el de assets/logo.png y no se sustituye por un dibujo.
 *
 * Las credenciales y la logica de sesion no se han tocado.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/tarjeta');

  const params = await searchParams;

  /**
   * La lista de participantes es la PRIMERA consulta a la base de datos que hace
   * la aplicacion. Si falta una variable de entorno, la migracion o el seed,
   * aqui es donde reventaba con "Application error" y un digest.
   *
   * Ahora se captura y se dice que hacer. Un torneo no se puede quedar
   * bloqueado por una pantalla en blanco que no explica nada.
   */
  let players: Awaited<ReturnType<typeof getLoginRoster>> = [];
  let problem: string | null = null;

  try {
    players = await getLoginRoster();
    if (players.length === 0) {
      problem = 'No hay participantes en la base de datos. Falta ejecutar el seed.';
    }
  } catch {
    const diagnosis = await diagnose();
    problem = diagnosis.nextStep;
  }

  return (
    <main className="container stack login-page">
      {/* Identidad del campeonato. El unico bloque decorativo de la pantalla. */}
      <section className="hero" aria-label="I Peñita Golf Championship">
        <svg
          className="hero__texture"
          viewBox="0 0 400 200"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          <g fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1">
            <path d="M-20 172 C 60 140, 120 168, 200 132 S 340 108, 420 128" />
            <path d="M-20 148 C 60 116, 130 146, 210 108 S 345 84, 420 102" />
            <path d="M-20 124 C 70 92, 140 122, 220 84 S 350 60, 420 76" />
            <path d="M-20 98 C 80 68, 150 96, 230 58 S 355 34, 420 48" />
            <path d="M-20 70 C 90 42, 160 68, 240 32 S 360 10, 420 22" />
          </g>
        </svg>

        <div className="hero__body">
          <p className="hero__meta">
            <span>I edicion</span>
            <span>Ulzama · Bariain 2026</span>
          </p>
          <p className="hero__course">
            Peñita Golf
            <br />
            Championship
          </p>
          <p className="muted">Individual Stableford · 18 hoyos</p>
        </div>
      </section>

      {problem !== null ? (
        <StateBlock
          title="La aplicacion todavia no esta lista para usarse"
          variant="error"
          icon={<IconAlert size={22} />}
          action={
            <a className="button button--secondary" href="/api/diagnostico">
              Ver el diagnostico completo
            </a>
          }
        >
          {problem}
        </StateBlock>
      ) : (
        <LoginForm
          players={players}
          returnTo={params.returnTo?.startsWith('/') ? params.returnTo : '/tarjeta'}
        />
      )}
    </main>
  );
}
