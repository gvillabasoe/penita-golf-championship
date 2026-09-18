/**
 * Pagina no encontrada.
 *
 * Tambien es la respuesta de `requireAdmin()` cuando alguien que no es
 * administrador entra en /admin: 404 y no 403, para no confirmar que la ruta
 * existe. Por eso el texto no menciona permisos ni administracion.
 */
import { IconFlag } from '@/components/ui/icons';

export default function NotFound() {
  return (
    <main className="container stack">
      <div className="state-block" role="status" style={{ marginTop: 'var(--space-6)' }}>
        <span className="state-block__icon">
          <IconFlag size={22} />
        </span>
        <p className="state-block__title">Aqui no hay nada</p>
        <div className="state-block__body">Esta pagina no existe.</div>
        <div className="button-row">
          <a className="button button--primary" href="/tarjeta">
            Ir a mi tarjeta
          </a>
          <a className="button button--secondary" href="/clasificacion">
            Ver la clasificacion
          </a>
        </div>
      </div>
    </main>
  );
}
