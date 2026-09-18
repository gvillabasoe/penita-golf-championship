/**
 * Cabecera de la aplicacion.
 *
 * Solida y verde, nunca translucida. Muestra tres cosas segun el contexto: el
 * nombre corto del campeonato, la pantalla en la que estas y una accion
 * secundaria a la derecha (salir, volver, estado de guardado).
 *
 * El nombre corto va arriba y en pequeno, y la pantalla debajo y en grande: al
 * mirar el movil en mitad de una vuelta lo que hace falta saber es donde estas,
 * no en que aplicacion estas.
 */

import type { ReactNode } from 'react';

export interface AppHeaderProps {
  /** Pantalla actual: "Mi tarjeta", "Hoyo 7", "Clasificacion". */
  screen: string;
  /** Nombre corto del campeonato. */
  competition?: string;
  /** Accion secundaria, alineada a la derecha. */
  action?: ReactNode;
  /** Sustituye el escudo por otro elemento, por ejemplo un boton de volver. */
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
          <span className="app-header__mark" aria-hidden="true">
            PGC
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
