'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

import { navigationFor } from '@/lib/http/routes';

export function BottomNav({ role }: { role: 'PLAYER' | 'ADMIN' }) {
  const pathname = usePathname();
  const items = navigationFor(role);

  return (
    <nav className="bottom-nav glass" aria-label="Navegacion principal">
      <ul className="bottom-nav__list">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                className="bottom-nav__link"
                href={item.href}
                aria-current={current ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
