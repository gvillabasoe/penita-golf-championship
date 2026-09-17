'use client';

/**
 * Error en el propio layout raiz.
 *
 * Aqui no hay layout que reutilizar, asi que tiene que traer sus etiquetas html
 * y body. Tampoco hay hoja de estilos garantizada: los estilos van en linea a
 * proposito.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#f4edde',
          color: '#1c2620',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ color: '#364f6e' }}>Peñita Golf Championship</h1>
          <p>La aplicación no ha podido arrancar.</p>
          <p style={{ color: '#55655c', fontSize: '0.9rem' }}>
            Si eres el organizador, abre <code>/api/diagnostico</code>: dice exactamente qué falta.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: '44px',
              padding: '0 24px',
              borderRadius: '999px',
              border: 'none',
              background: '#364f6e',
              color: '#f4edde',
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            Volver a intentarlo
          </button>
          {error.digest ? (
            <p style={{ color: '#55655c', fontSize: '0.8rem' }}>
              Referencia: <code>{error.digest}</code>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
