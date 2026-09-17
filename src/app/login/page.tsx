import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/server';
import { getLoginRoster } from '@/lib/data/queries';
import { diagnose } from '@/lib/data/health';
import { LoginForm } from '@/components/client/login-form';

export const metadata = { title: 'Acceso · Peñita Golf Championship' };

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
    <main className="container stack">
      <header className="page-header">
        <div>
          <h1>Peñita Golf Championship</h1>
          <p className="muted">I edicion · Ulzama-Bariain 2026</p>
        </div>
      </header>

      {problem !== null ? (
        <div className="card stack">
          <p className="alert" role="alert">
            La aplicación todavía no está lista para usarse.
          </p>
          <p>{problem}</p>
          <p className="muted">
            Detalle completo en <a href="/api/diagnostico">/api/diagnostico</a>.
          </p>
        </div>
      ) : (
        <LoginForm
          players={players}
          returnTo={params.returnTo?.startsWith('/') ? params.returnTo : '/tarjeta'}
        />
      )}
    </main>
  );
}
