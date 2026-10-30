'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { drawPairs } from '@/lib/actions/admin';
import { Alert } from '@/components/ui';

export function PairDrawPanel({
  pairModeEnabled,
  flightsConfirmed,
  hasPairs,
}: {
  pairModeEnabled: boolean;
  flightsConfirmed: boolean;
  hasPairs: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const enabled = pairModeEnabled && flightsConfirmed;

  async function runDraw() {
    setBusy(true);
    setFeedback(null);
    const result = await drawPairs();
    setBusy(false);
    setFeedback(
      result.ok
        ? { ok: true, text: result.message ?? 'Parejas sorteadas.' }
        : { ok: false, text: result.error },
    );
    if (result.ok) router.refresh();
  }

  return (
    <div className="pair-draw-panel stack">
      <div>
        <p className="eyebrow">Segunda fase</p>
        <h2>Sorteo de parejas</h2>
        <p className="muted">
          Se calcula exclusivamente sobre los partidos confirmados. Los integrantes serán de partidos distintos y los cuatro HCP más altos no se emparejarán entre sí.
        </p>
      </div>

      {!flightsConfirmed ? (
        <Alert tone="warning" role="status">
          Bloqueado: primero debes sortear, revisar y confirmar los partidos.
        </Alert>
      ) : !pairModeEnabled ? (
        <Alert tone="warning" role="status">
          Los partidos están confirmados, pero debes activar el modo parejas y guardar la modalidad.
        </Alert>
      ) : hasPairs ? (
        <Alert tone="warning" role="status">
          Un nuevo sorteo sustituirá todas las parejas actuales por otra combinación válida.
        </Alert>
      ) : null}

      <button
        type="button"
        className="button button--primary"
        disabled={!enabled || busy}
        onClick={runDraw}
      >
        {busy ? 'Calculando parejas...' : hasPairs ? 'Volver a sortear parejas' : 'Sortear parejas'}
      </button>

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}
    </div>
  );
}
