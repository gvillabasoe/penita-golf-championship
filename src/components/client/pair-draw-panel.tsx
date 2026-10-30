'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { drawPairs } from '@/lib/actions/admin';
import { Alert } from '@/components/ui';
import { DRAW_SEED_MAX_LENGTH } from '@/lib/admin/draw-seed';

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
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const enabled = pairModeEnabled && flightsConfirmed;

  async function runDraw() {
    setBusy(true);
    setFeedback(null);
    const result = await drawPairs(seed);
    setBusy(false);
    setFeedback(
      result.ok
        ? { ok: true, text: result.message ?? 'Parejas sorteadas.' }
        : { ok: false, text: result.error },
    );
    if (result.ok) {
      // La seed confirmada queda guardada y se muestra al final de la pagina.
      // Dejamos el campo vacio para que un clic posterior genere otra al azar;
      // para reproducir un sorteo basta con volver a pegar la seed guardada.
      setSeed('');
      router.refresh();
    }
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

      <div className="field">
        <label htmlFor="pair-seed">Semilla (vacía para generar una aleatoria)</label>
        <input
          id="pair-seed"
          type="text"
          maxLength={DRAW_SEED_MAX_LENGTH}
          value={seed}
          disabled={!enabled || busy}
          onChange={(event) => setSeed(event.target.value)}
        />
        <p className="field__help">
          Pega una semilla anterior para reconstruir exactamente las mismas parejas mientras no cambien los partidos confirmados ni los HCP.
        </p>
      </div>

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
