import { requireAdmin } from '@/lib/auth/server';
import { BottomNav } from '@/components/client/bottom-nav';
import { AdminNav } from '@/components/client/admin-nav';
import { AppHeader } from '@/components/ui/app-header';
import { LogoutButton } from '@/components/client/logout-button';

/**
 * Comprobacion de rol en servidor, para TODO el panel.
 *
 * Es la capa que protege. El middleware corre en edge y no puede leer la base
 * de datos, asi que solo delega. `requireAdmin` responde 404 si no procede: 404
 * y no 403, para no confirmar que la ruta existe.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <>
      <AppHeader screen="Administracion" action={<LogoutButton />} />

      <main className="container stack">
        <AdminNav />
        {children}
      </main>

      <BottomNav role={admin.role} />
    </>
  );
}
