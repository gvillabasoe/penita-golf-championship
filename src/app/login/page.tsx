import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/server';
import { getLoginRoster } from '@/lib/data/queries';
import { LoginForm } from '@/components/client/login-form';

export const metadata = { title: 'Acceso · Peñita Golf Championship' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/tarjeta');

  const [players, params] = await Promise.all([getLoginRoster(), searchParams]);

  return (
    <main className="container stack">
      <header className="page-header">
        <div>
          <h1>Peñita Golf Championship</h1>
          <p className="muted">I edicion · Ulzama-Bariain 2026</p>
        </div>
      </header>

      <LoginForm
        players={players}
        returnTo={params.returnTo?.startsWith('/') ? params.returnTo : '/tarjeta'}
      />
    </main>
  );
}
