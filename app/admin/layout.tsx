import Link from 'next/link';

import { requireAdmin } from '@/lib/auth/server';
import { BottomNav } from '@/components/client/bottom-nav';

const SECTIONS = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/jugadores', label: 'Jugadores' },
  { href: '/admin/campo', label: 'Campo' },
  { href: '/admin/partidos', label: 'Partidos' },
  { href: '/admin/tarjetas', label: 'Tarjetas' },
  { href: '/admin/clasificacion', label: 'Clasificacion' },
  { href: '/admin/revelacion', label: 'Revelacion' },
  { href: '/admin/historial', label: 'Historial' },
  { href: '/admin/exportacion', label: 'Exportacion' },
];

/**
 * Comprobacion de rol en servidor, para TODO el panel.
 *
 * Es la capa que protege. El middleware corre en edge y no puede leer la base
 * de datos, asi que solo delega. `requireAdmin` responde 404 si no procede.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <main className="container stack">
      <ul className="admin-nav">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link href={section.href}>{section.label}</Link>
          </li>
        ))}
      </ul>
      {children}
      <BottomNav role={admin.role} />
    </main>
  );
}
