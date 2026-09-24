'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';

import {
  IconFlag,
  IconForward,
  IconGrid,
  IconSliders,
  IconSync,
  IconTrophy,
  IconUsers,
  type IconProps,
} from '@/components/ui/icons';

type NavIcon = ComponentType<IconProps>;

interface AdminSectionLink {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: NavIcon;
}

/**
 * Navegacion interna del panel.
 *
 * En movil no se obliga a recorrer nueve pestanas horizontales. Se muestra un
 * selector compacto con la seccion actual y, al abrirlo, una rejilla tactil de
 * accesos. A partir de escritorio se convierte en una barra lateral estable.
 * Ambas variantes usan las mismas rutas y no alteran los permisos del servidor.
 */
const SECTIONS: readonly AdminSectionLink[] = [
  {
    href: '/admin',
    label: 'Resumen',
    shortLabel: 'Resumen',
    description: 'Estado general e incidencias',
    icon: IconSliders,
  },
  {
    href: '/admin/jugadores',
    label: 'Jugadores',
    shortLabel: 'Jugadores',
    description: 'Hándicaps, colores y acceso',
    icon: IconUsers,
  },
  {
    href: '/admin/campo',
    label: 'Campo y modalidad',
    shortLabel: 'Campo',
    description: 'Valoracion, reglas y limite HCP',
    icon: IconGrid,
  },
  {
    href: '/admin/partidos',
    label: 'Partidos',
    shortLabel: 'Partidos',
    description: 'Grupos y horas de salida',
    icon: IconFlag,
  },
  {
    href: '/admin/tarjetas',
    label: 'Tarjetas',
    shortLabel: 'Tarjetas',
    description: 'Resultados, bloqueos y correcciones',
    icon: IconGrid,
  },
  {
    href: '/admin/clasificacion',
    label: 'Clasificacion',
    shortLabel: 'Clasificacion',
    description: 'Orden provisional del torneo',
    icon: IconTrophy,
  },
  {
    href: '/admin/revelacion',
    label: 'Revelacion',
    shortLabel: 'Revelacion',
    description: 'Presentacion puesto a puesto',
    icon: IconTrophy,
  },
  {
    href: '/admin/historial',
    label: 'Historial',
    shortLabel: 'Historial',
    description: 'Cambios y acciones administrativas',
    icon: IconSync,
  },
  {
    href: '/admin/exportacion',
    label: 'Exportacion',
    shortLabel: 'Exportar',
    description: 'PDF, imagenes y documentos',
    icon: IconForward,
  },
];

function isCurrent(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function AdminLink({ section, current }: { section: AdminSectionLink; current: boolean }) {
  const Icon = section.icon;

  return (
    <Link
      className="admin-navigation__link"
      href={section.href}
      aria-current={current ? 'page' : undefined}
    >
      <span className="admin-navigation__icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="admin-navigation__copy">
        <strong>{section.shortLabel}</strong>
        <small>{section.description}</small>
      </span>
      <IconForward size={17} className="admin-navigation__arrow" />
    </Link>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = SECTIONS.find((section) => isCurrent(pathname, section.href)) ?? SECTIONS[0];
  const ActiveIcon = active.icon;

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav className="admin-navigation" aria-label="Secciones de administracion">
      <details
        className="admin-navigation__mobile"
        open={mobileOpen}
        onToggle={(event) => setMobileOpen(event.currentTarget.open)}
      >
        <summary className="admin-navigation__summary">
          <span className="admin-navigation__current-icon" aria-hidden="true">
            <ActiveIcon size={21} />
          </span>
          <span className="admin-navigation__current-copy">
            <small>Administracion</small>
            <strong>{active.label}</strong>
          </span>
          <span className="admin-navigation__change">Cambiar</span>
        </summary>

        <ul className="admin-navigation__mobile-menu">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <AdminLink section={section} current={isCurrent(pathname, section.href)} />
            </li>
          ))}
        </ul>
      </details>

      <div className="admin-navigation__desktop" aria-label="Navegacion de administracion">
        <div className="admin-navigation__desktop-heading">
          <span className="eyebrow">Panel de control</span>
          <strong>Administracion</strong>
        </div>
        <ul className="admin-navigation__desktop-menu">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <AdminLink section={section} current={isCurrent(pathname, section.href)} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
