'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navegacion interna del panel.
 *
 * Es de cliente solo para saber que seccion esta activa. Se desplaza la propia
 * barra, no la pagina: con nueve secciones no caben a 360 px, y hacer que la
 * pagina entera tenga scroll horizontal rompe todo lo demas.
 */

const SECTIONS = [
  { href: '/admin', label: 'Resumen' },
  { href: '/admin/jugadores', label: 'Jugadores' },
  { href: '/admin/campo', label: 'Campo y modalidad' },
  { href: '/admin/partidos', label: 'Partidos' },
  { href: '/admin/tarjetas', label: 'Tarjetas' },
  { href: '/admin/clasificacion', label: 'Clasificacion' },
  { href: '/admin/revelacion', label: 'Revelacion' },
  { href: '/admin/historial', label: 'Historial' },
  { href: '/admin/exportacion', label: 'Exportacion' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de administracion">
      <ul className="admin-nav">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              aria-current={pathname === section.href ? 'page' : undefined}
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
