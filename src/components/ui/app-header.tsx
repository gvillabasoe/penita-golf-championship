/**
 * Cabecera de la aplicacion.
 *
 * Solida y verde, nunca translucida. Muestra el logotipo real de la app, el
 * nombre corto del campeonato, la pantalla actual y una accion secundaria a la
 * derecha. Las pantallas que necesitan un control contextual —por ejemplo,
 * volver desde un hoyo— pueden sustituir el logotipo mediante `mark`.
 */

import Image from 'next/image';
import type { ReactNode } from 'react';

export interface AppHeaderProps {
  /** Pantalla actual: "Mi tarjeta", "Hoyo 7", "Clasificacion". */
  screen: string;
  /** Nombre corto del campeonato. */
  competition?: string;
  /** Accion secundaria, alineada a la derecha. */
  action?: ReactNode;
  /** Sustituye el logotipo por otro elemento, por ejemplo un boton de volver. */
  mark?: ReactNode;
  /** El titulo de la pantalla es el `h1` de la pagina. */
  asHeading?: boolean;
}

export function AppHeader({
  screen,
  competition = 'Peñita Golf Championship',
  action,
  mark,
  asHeading = true,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        {mark ?? (
          <span className="app-header__logo" aria-hidden="true">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={40}
              height={40}
              sizes="40px"
              priority
            />
          </span>
        )}

        <div className="app-header__titles">
          <p className="app-header__competition">{competition}</p>
          {asHeading ? (
            <h1 className="app-header__screen">{screen}</h1>
          ) : (
            <p className="app-header__screen">{screen}</p>
          )}
        </div>

        <div className="app-header__action">{action}</div>
      </div>
    </header>
  );
}
