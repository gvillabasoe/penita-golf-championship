'use client';

import { useEffect, useState } from 'react';

import { AdminSection } from '@/components/ui';
import { IconAlert } from '@/components/ui/icons';

/**
 * Pantalla de error.
 *
 * Sin esto, cualquier excepcion de servidor deja "Application error: a
 * server-side exception has occurred" y un digest, que no dice nada a nadie: ni
 * al jugador, que no sabe si puede seguir apuntando, ni a quien tiene que
 * arreglarlo.
 *
 * ---------------------------------------------------------------------------
 * Por que consulta el diagnostico
 * ---------------------------------------------------------------------------
 * La version anterior decia lo que el JUGADOR necesita saber —que sus
 * resultados no se han perdido— y ahi se quedaba. Para quien tiene que
 * arreglarlo era un callejon sin salida: un digest es un hash del mensaje, no se
 * puede descifrar, y obligaba a abrir los registros de Vercel desde el movil en
 * mitad del campo.
 *
 * Y resulta que la aplicacion ya sabia el motivo. `/api/diagnostico` es publico
 * a proposito, porque se necesita justo cuando algo no funciona, y su sonda
 * recorre las mismas consultas que hace la aplicacion y dice en cual falla. El
 * caso tipico es una columna que falta porque se despliego el codigo antes de
 * aplicar la migracion, y eso sale ahi con el nombre de la columna.
 *
 * Su salida esta saneada: no lleva cadenas de conexion, ni contrasenas, ni
 * hashes. Mostrarla aqui no expone nada que no expusiera ya la propia ruta.
 *
 * El aviso al jugador va PRIMERO y el detalle tecnico debajo, en letra pequena,
 * porque el orden importa: quien esta jugando necesita lo primero y le da igual
 * lo segundo.
 */

interface Diagnosis {
  version?: string;
  ready?: boolean;
  nextStep?: string;
  database?: { connected?: boolean };
  loginPath?: { ok?: boolean; failedAt?: string | null; code?: string | null };
  appPath?: { ok?: boolean; failedAt?: string | null; code?: string | null } | null;
}

export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Los detalles del error se quedan en los logs del servidor, donde deben.
    console.error('Error en la aplicacion:', error.message, error.digest);
  }, [error]);

  useEffect(() => {
    let cancelled = false;

    /**
     * El diagnostico no puede tumbar la pantalla de error.
     *
     * Si `/api/diagnostico` falla tambien —porque no hay red, o porque esta
     * cayendo lo mismo que ha provocado esto— se traga el fallo y la pantalla se
     * queda como estaba. Una pantalla de error que revienta al cargar es lo peor
     * que puede pasar aqui: deja al jugador sin ninguna salida.
     */
    void (async () => {
      try {
        const response = await fetch('/api/diagnostico', { cache: 'no-store' });

        /**
         * El 503 tambien se lee, y es el importante.
         *
         * `/api/diagnostico` responde 200 cuando todo esta listo y **503 cuando
         * no lo esta**, con el motivo dentro. Descartar lo que no fuese `ok`
         * dejaba esta pantalla callada exactamente en el unico caso en el que
         * sirve para algo.
         */
        if (response.status !== 200 && response.status !== 503) return;

        const body = (await response.json()) as Diagnosis;
        if (!cancelled) setDiagnosis(body);
      } catch {
        // Silencio a proposito.
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** El paso concreto que ha fallado, si la sonda lo ha localizado. */
  const failedStep =
    diagnosis?.appPath && diagnosis.appPath.ok === false
      ? diagnosis.appPath
      : diagnosis?.loginPath && diagnosis.loginPath.ok === false
        ? diagnosis.loginPath
        : null;

  return (
    <main className="container stack page-content">
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

      {/* Detalle para quien tiene que arreglarlo. */}
      <AdminSection
        title="Para el organizador"
        description="Esto no lo necesita un jugador: es lo que hace falta para arreglarlo."
        ariaLabel="Diagnostico"
      >
        {diagnosis?.nextStep ? (
          <>
            <p>
              <strong>Causa probable:</strong> {diagnosis.nextStep}
            </p>

            <div className="table-scroll">
              <table className="data">
                <tbody>
                  <tr>
                    <th>Version desplegada</th>
                    <td>{diagnosis.version ?? 'desconocida'}</td>
                  </tr>
                  <tr>
                    <th>Base de datos</th>
                    <td>{diagnosis.database?.connected ? 'conectada' : 'sin conexion'}</td>
                  </tr>
                  {failedStep ? (
                    <tr>
                      <th>Paso que falla</th>
                      <td>
                        {failedStep.failedAt}
                        {failedStep.code ? ` (${failedStep.code})` : ''}
                      </td>
                    </tr>
                  ) : null}
                  {error.digest ? (
                    <tr>
                      <th>Referencia</th>
                      <td>
                        <code>{error.digest}</code>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/*
              El caso mas frecuente al actualizar, y el mas facil de arreglar:
              se ha desplegado el codigo antes de aplicar la migracion, asi que
              Prisma pide una columna que en Neon todavia no existe. P2021 es
              tabla que no existe, P2022 columna que no existe.
            */}
            {failedStep?.code === 'P2022' || failedStep?.code === 'P2021' ? (
              <p className="alert alert--info" role="note">
                <span>
                  Falta una tabla o una columna en la base de datos. Lo habitual es haber
                  desplegado el codigo antes de aplicar la migracion: aplica{' '}
                  <code>prisma/sql/migrations/</code> en Neon y vuelve a cargar.
                </span>
              </p>
            ) : null}

            <a className="button button--secondary" href="/api/diagnostico">
              Ver el diagnostico completo
            </a>
          </>
        ) : checked ? (
          <>
            <p className="muted">
              El diagnostico no ha respondido, asi que el fallo puede estar antes de la
              aplicacion. Revisa los registros del despliegue.
            </p>
            {error.digest ? (
              <p className="muted">
                Referencia del error: <code>{error.digest}</code>
              </p>
            ) : null}
          </>
        ) : (
          <p className="muted">Comprobando la instalacion...</p>
        )}
      </AdminSection>
    </main>
  );
}
