import { IconOffline } from '@/components/ui/icons';

export const metadata = { title: 'Sin conexion · Peñita Golf' };

export default function OfflinePage() {
  return (
    <main className="container stack page-content">
      <div className="state-block" role="status" style={{ marginTop: 'var(--space-6)' }}>
        <span className="state-block__icon">
          <IconOffline size={22} />
        </span>
        <p className="state-block__title">Sin conexion</p>
        <div className="state-block__body">
          <p>
            No hay cobertura ahora mismo. <strong>Puedes seguir apuntando:</strong> los
            resultados se guardan en el movil y se envian solos en cuanto vuelva la senal.
          </p>
          <p style={{ marginTop: 'var(--space-2)' }}>
            Ulzama esta en un valle. Si no hay senal en un hoyo, lo normal es que vuelva unos
            hoyos mas adelante.
          </p>
        </div>
        <a className="button button--primary" href="/tarjeta">
          Volver a mi tarjeta
        </a>
      </div>
    </main>
  );
}
