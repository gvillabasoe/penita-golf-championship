/**
 * Pagina no encontrada.
 *
 * Tambien es la respuesta de `requireAdmin()` cuando alguien que no es
 * administrador entra en /admin: 404 y no 403, para no confirmar que la ruta
 * existe. Por eso el texto no menciona permisos ni administracion.
 */
export default function NotFound() {
  return (
    <main className="container stack">
      <header className="page-header">
        <h1>Aquí no hay nada</h1>
      </header>

      <div className="card stack">
        <p>Esta página no existe.</p>
        <a className="button button--primary" href="/tarjeta">
          Ir a mi tarjeta
        </a>
        <a className="button button--secondary" href="/clasificacion">
          Ver la clasificación
        </a>
      </div>
    </main>
  );
}
