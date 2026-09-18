'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { controlReveal } from '@/lib/actions/admin';
import type { RevealAction } from '@/lib/reveal/controller';
import { Alert } from '@/components/ui';

const LABELS: Record<RevealAction, string> = {
  START: 'Iniciar revelacion',
  REVEAL_NEXT: 'Revelar siguiente',
  PAUSE: 'Pausar',
  RESUME: 'Reanudar',
  BACK: 'Volver atras',
  RESTART: 'Reiniciar presentacion',
  PUBLISH: 'Finalizar y publicar',
};

/**
 * Los botones vienen calculados por `availableActions`, la misma funcion que
 * aplica las acciones. Si un boton esta activo, la accion funciona: la interfaz
 * no puede desviarse de las reglas.
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
    const result = await controlReveal(action);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="stack" aria-label="Controles de revelacion">
      {actions.map((item) => (
        <div key={item.action} className="stack">
          <button
            type="button"
            className={item.action === 'REVEAL_NEXT' ? 'button button--primary' : 'button button--secondary'}
            disabled={!item.enabled || busy !== null}
            onClick={() => run(item.action)}
          >
            {busy === item.action ? 'Aplicando...' : LABELS[item.action]}
          </button>
          {!item.enabled && item.reason ? <p className="muted">{item.reason}</p> : null}
        </div>
      ))}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
    </section>
  );
}
