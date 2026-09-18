'use client';

/**
 * Boton de salir de la cabecera.
 *
 * Es un formulario con una Server Action, no un `fetch`: cerrar sesion tiene que
 * funcionar aunque el JavaScript no haya cargado, y ese es justo el caso en el
 * que alguien pasa el movil a otro jugador.
 *
 * Vive sobre la cabecera verde, asi que usa el boton fantasma: fondo
 * transparente y borde claro. Solo icono en movil, con la etiqueta accesible
 * completa, porque en una cabecera de 56 px la palabra "Salir" le quita sitio al
 * nombre de la pantalla.
 */

import { logoutAction } from '@/lib/actions/auth';
import { IconExit } from '@/components/ui/icons';

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="icon-button icon-button--onGreen"
        aria-label="Cerrar sesion"
        title="Cerrar sesion"
      >
        <IconExit size={20} />
      </button>
    </form>
  );
}
