import { getAuditLog, getCompetition } from '@/lib/data/queries';
import { AdminSection, StateBlock } from '@/components/ui';
import { IconSliders } from '@/components/ui/icons';

export const metadata = { title: 'Admin · Historial' };

const format = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Europe/Madrid',
});

/**
 * Historial de auditoria.
 *
 * Las acciones viajan como codigo por la base de datos y aqui se traducen: un
 * historial lleno de `HANDICAP_CAP_SET` no lo lee nadie el dia siguiente al
 * torneo, que es justo cuando hace falta.
 */
const ACTION_LABEL: Record<string, string> = {
  HANDICAP_SET: 'Hándicap asignado',
  HANDICAP_CAP_SET: 'Limite de HCP fijado',
  HANDICAP_CAP_REMOVED: 'Limite de HCP retirado',
  RULE_SET_CHANGED: 'Reglas de calculo cambiadas',
  COURSE_SNAPSHOT_CONFIRMED: 'Valoracion del campo confirmada',
  DRAW_CONFIRMED: 'Sorteo de partidos confirmado',
  HOLE_SCORE_WRITTEN: 'Resultado apuntado',
  HOLE_SCORE_CLEARED: 'Resultado borrado',
  HOLE_SCORE_OVERRIDDEN: 'Resultado corregido por el administrador',
  SCORES_RESET: 'Resultados de las tarjetas vaciados',
  SCORECARD_FINISHED: 'Tarjeta finalizada',
  SCORECARD_LOCKED: 'Tarjeta bloqueada',
  SCORECARD_UNLOCKED: 'Tarjeta desbloqueada',
  CARD_REVIEWED: 'Tarjeta revisada',
  CARD_OBJECTED: 'Objecion a una tarjeta',
  SYNC_CONFLICT_RESOLVED_SERVER: 'Conflicto resuelto con el valor del servidor',
  SYNC_CONFLICT_RESOLVED_LOCAL: 'Conflicto resuelto con el valor del jugador',
};

export default async function AdminAuditPage() {
  const context = await getCompetition();
  if (!context) {
    return (
      <StateBlock title="No hay competicion configurada" icon={<IconSliders />}>
        El historial se llena a partir de la primera accion sobre el campeonato.
      </StateBlock>
    );
  }

  const entries = await getAuditLog(context);

  return (
    <div className="stack">
      <div className="section-header">
        <h1>Historial</h1>
      </div>

      <p className="muted">
        Toda escritura queda registrada con actor, fecha, valor anterior y valor nuevo. Nunca se
        guardan contrasenas ni hashes.
      </p>

      {entries.length === 0 ? (
        <StateBlock title="Todavia no hay movimientos" icon={<IconSliders />}>
          En cuanto se asigne un hándicap o se apunte un resultado, aparecera aqui.
        </StateBlock>
      ) : (
        <AdminSection title={`Ultimos ${entries.length} movimientos`}>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Quien</th>
                  <th>Accion</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{format.format(entry.createdAt)}</td>
                    <td>{entry.actor?.displayName ?? 'sistema'}</td>
                    <td>{ACTION_LABEL[entry.action] ?? entry.action}</td>
                    <td>{entry.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminSection>
      )}
    </div>
  );
}
