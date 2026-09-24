import { requireAdmin } from '@/lib/auth/server';
import { BottomNav } from '@/components/client/bottom-nav';
import { AdminNav } from '@/components/client/admin-nav';
import { AppHeader } from '@/components/ui/app-header';
import { LogoutButton } from '@/components/client/logout-button';

/**
 * Comprobacion de rol en servidor, para TODO el panel.
 *
 * En movil la navegacion interna se convierte en un selector compacto. En
 * escritorio pasa a una barra lateral; el contenido y las rutas son los mismos.
 * La capa que protege continua siendo `requireAdmin` y cada accion vuelve a
 * validar el rol en servidor.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <>
      <AppHeader screen="Administracion" action={<LogoutButton />} />

      <main className="container container--admin admin-shell page-content">
        <AdminNav />
        <div className="admin-shell__content">{children}</div>
      </main>

      <BottomNav role={admin.role} />
    </>
  );
}
