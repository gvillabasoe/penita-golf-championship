import { getAuditLog, getCompetition } from '@/lib/data/queries';

export const metadata = { title: 'Admin · Historial' };

export default async function AdminAuditPage() {
  const context = await getCompetition();
  if (!context) return <p className="alert">No hay competicion configurada.</p>;

  const entries = await getAuditLog(context);
  const format = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Europe/Madrid',
  });

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Historial</h1>
      </header>

      <p className="muted">
        Toda escritura queda registrada con actor, fecha, valor anterior y valor nuevo. Nunca se
        guardan contrasenas ni hashes.
      </p>

      {entries.length === 0 ? (
        <p className="card">Todavia no hay movimientos.</p>
      ) : (
        <table className="data">
          <thead>
            <tr><th>Fecha</th><th>Quien</th><th>Accion</th><th>Motivo</th></tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{format.format(entry.createdAt)}</td>
                <td>{entry.actor?.displayName ?? 'sistema'}</td>
                <td>{entry.action}</td>
                <td>{entry.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
