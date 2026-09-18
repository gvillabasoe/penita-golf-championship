'use client';

import { useEffect } from 'react';

import { IconAlert } from '@/components/ui/icons';

/**
 * Pantalla de error.
 *
 * Sin esto, cualquier excepcion de servidor deja "Application error: a
 * server-side exception has occurred" y un digest, que no dice nada a nadie: ni
 * al jugador, que no sabe si puede seguir apuntando, ni a quien tiene que
 * arreglarlo.
 *
 * Esta pantalla no muestra el error —eso se queda en los logs, donde debe— pero
 * dice lo unico que el jugador necesita saber a mitad de una vuelta: que sus
 * resultados no se han perdido.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Los detalles van a los logs del servidor, no a la pantalla.
    console.error('Error en la aplicacion:', error.message, error.digest);
  }, [error]);

  return (
    <main className="container stack">
      <div className="section-header">
        <h1>Algo ha fallado</h1>
      </div>

      <div className="state-block state-block--error" role="alert">
        <span className="state-block__icon">
          <IconAlert size={22} />
        </span>
        <p className="state-block__title">No se ha podido cargar la pantalla</p>
        <div className="state-block__body">
          <p>
            <strong>Tus resultados estan guardados.</strong> Lo que hayas confirmado en la
            tarjeta vive en este movil y se enviara solo en cuanto todo vuelva a funcionar.
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button button--primary" onClick={reset}>
            Volver a intentarlo
          </button>
          <a className="button button--secondary" href="/tarjeta">
            Ir a mi tarjeta
          </a>
        </div>
      </div>

      {error.digest ? (
        <p className="muted">
          Si tienes que avisar al organizador, dale esta referencia:{' '}
          <code>{error.digest}</code>
        </p>
      ) : null}
    </main>
  );
}
