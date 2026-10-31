'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { setClassificationOfficial } from '@/lib/actions/admin';
import { AdminSection, Alert, StatusBadge } from '@/components/ui';

export function ClassificationPublicationSwitch({
  official: initialOfficial,
}: {
  official: boolean;
}) {
  const router = useRouter();
  const [official, setOfficial] = useState(initialOfficial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setOfficial(initialOfficial);
  }, [initialOfficial]);

  async function togglePublication() {
    if (busy) return;

    const nextOfficial = !official;
    setOfficial(nextOfficial);
    setBusy(true);
    setFeedback(null);

    try {
      const result = await setClassificationOfficial(nextOfficial);
      if (!result.ok) {
        setOfficial(!nextOfficial);
        setFeedback({ ok: false, text: result.error });
        return;
      }

      setFeedback({
        ok: true,
        text:
          result.message ??
          (nextOfficial
            ? 'Clasificacion publicada como oficial.'
            : 'Clasificacion devuelta a provisional.'),
      });
      router.refresh();
    } catch {
      setOfficial(!nextOfficial);
      setFeedback({
        ok: false,
        text: 'No se ha podido cambiar el estado. Comprueba la conexion y vuelve a intentarlo.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminSection
      title="Publicacion de la clasificacion"
      description="El administrador siempre puede revisar el provisional. Al activar Oficial, la clasificacion individual y la de parejas pasan a ser visibles para todos los jugadores."
      action={
        <StatusBadge tone={official ? 'green' : 'gold'}>
          {official ? 'Oficial' : 'Provisional'}
        </StatusBadge>
      }
    >
      <div className={`publication-switch${official ? ' publication-switch--official' : ''}`}>
        <div className="publication-switch__copy" aria-live="polite">
          <strong>{official ? 'Clasificacion oficial publicada' : 'Clasificacion provisional'}</strong>
          <span>
            {official
              ? 'Los jugadores ya pueden consultar la clasificacion completa.'
              : 'Solo el administrador ve el orden completo; los jugadores no ven la clasificacion.'}
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={official}
          aria-label={
            official
              ? 'Cambiar la clasificacion oficial a provisional'
              : 'Publicar la clasificacion como oficial'
          }
          className="publication-toggle"
          disabled={busy}
          onClick={() => void togglePublication()}
        >
          <span className="publication-toggle__thumb" aria-hidden="true" />
          <span className="publication-toggle__label publication-toggle__label--provisional">
            Provisional
          </span>
          <span className="publication-toggle__label publication-toggle__label--official">
            Oficial
          </span>
          <span className="visually-hidden">
            {busy
              ? 'Aplicando el cambio'
              : official
                ? 'Estado actual: oficial'
                : 'Estado actual: provisional'}
          </span>
        </button>

        {busy ? <p className="publication-switch__busy">Guardando el cambio...</p> : null}
      </div>

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}
    </AdminSection>
  );
}
