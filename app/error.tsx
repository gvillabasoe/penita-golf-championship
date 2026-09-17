'use client';

import { useEffect } from 'react';

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
      <header className="page-header">
        <h1>Algo ha fallado</h1>
      </header>

      <div className="card stack">
        <p>
          <strong>Tus resultados están guardados.</strong> Lo que hayas confirmado en la tarjeta
          vive en este móvil y se enviará solo en cuanto todo vuelva a funcionar.
        </p>

        <button type="button" className="button button--primary" onClick={reset}>
          Volver a intentarlo
        </button>

        <a className="button button--secondary" href="/tarjeta">
          Ir a mi tarjeta
        </a>

        {error.digest ? (
          <p className="muted">
            Si tienes que avisar al organizador, dale esta referencia:{' '}
            <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
