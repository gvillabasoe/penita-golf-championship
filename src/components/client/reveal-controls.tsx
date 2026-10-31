'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { controlReveal } from '@/lib/actions/admin';
import type { RevealAction } from '@/lib/reveal/controller';
import { Alert } from '@/components/ui';

const LABELS: Partial<Record<RevealAction, string>> = {
  START: 'Iniciar revelacion',
  REVEAL_NEXT: 'Revelar siguiente',
  PAUSE: 'Pausar',
  RESUME: 'Reanudar',
  BACK: 'Volver atras',
  RESTART: 'Reiniciar presentacion',
};

/**
 * Controles de la presentacion progresiva.
 *
 * La publicacion oficial ya no forma parte de esta secuencia: se gestiona con
 * el interruptor Provisional / Oficial. Ademas, cada accion usa `finally` para
 * que un fallo de red o de servidor nunca deje el boton en "Aplicando...".
 */
export function RevealControls({
  actions,
}: {
  actions: Array<{ action: RevealAction; enabled: boolean; reason: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<RevealAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: RevealAction) {
    setBusy(action);
    setError(null);

    try {
      const result = await controlReveal(action);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError('No se ha podido aplicar el cambio. Comprueba la conexion y vuelve a intentarlo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="stack" aria-label="Controles de revelacion">
      {actions.map((item) => {
        const label = LABELS[item.action];
        if (!label) return null;

        return (
          <div key={item.action} className="stack">
            <button
              type="button"
              className={
                item.action === 'REVEAL_NEXT'
                  ? 'button button--primary'
                  : 'button button--secondary'
              }
              disabled={!item.enabled || busy !== null}
              onClick={() => void run(item.action)}
            >
              {busy === item.action ? 'Aplicando...' : label}
            </button>
            {!item.enabled && item.reason ? <p className="muted">{item.reason}</p> : null}
          </div>
        );
      })}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
    </section>
  );
}
