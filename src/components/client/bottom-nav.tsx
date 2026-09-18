'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

import { navigationFor } from '@/lib/http/routes';
import { IconFlag, IconSliders, IconTrophy } from '@/components/ui/icons';

/**
 * Barra inferior.
 *
 * Solida, con borde superior discreto, icono Y texto, y respetando el area
 * segura del movil. No lleva efecto de cristal: una barra translucida sobre una
 * tarjeta de resultados deja los numeros a medio leer justo cuando hace falta
 * leerlos.
 *
 * Las rutas salen de `navigationFor`, que es la misma funcion que gobierna el
 * manifiesto de rutas y tiene su test. La pestana de administracion aparece solo
 * para el administrador, pero eso es maquetacion: lo que impide entrar es el
 * middleware mas `requireAdmin` en el servidor.
 */

const ICONS: Record<string, typeof IconFlag> = {
  '/tarjeta': IconFlag,
  '/clasificacion': IconTrophy,
  '/admin': IconSliders,
};

export function BottomNav({ role }: { role: 'PLAYER' | 'ADMIN' }) {
  const pathname = usePathname();
  const items = navigationFor(role);

  return (
    <nav className="bottom-nav" aria-label="Navegacion principal">
      <ul className="bottom-nav__list">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = ICONS[item.href] ?? IconFlag;

          return (
            <li key={item.href}>
              <Link
                className="bottom-nav__link"
                href={item.href}
                aria-current={current ? 'page' : undefined}
              >
                <Icon size={22} className="bottom-nav__icon" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
