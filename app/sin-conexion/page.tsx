export const metadata = { title: 'Sin conexion · Peñita Golf' };

export default function OfflinePage() {
  return (
    <main className="container stack">
      <header className="page-header">
        <h1>Sin conexion</h1>
      </header>

      <div className="card stack">
        <p>
          No hay cobertura ahora mismo. <strong>Puedes seguir apuntando:</strong> los resultados
          se guardan en el movil y se envian solos en cuanto vuelva la senal.
        </p>
        <p className="muted">
          Ulzama esta en un valle. Si no hay senal en un hoyo, lo normal es que vuelva unos
          hoyos mas adelante.
        </p>
        <a className="button button--primary" href="/tarjeta">
          Volver a mi tarjeta
        </a>
      </div>
    </main>
  );
}
