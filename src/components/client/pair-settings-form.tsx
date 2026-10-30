'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { updatePairSettings } from '@/lib/actions/admin';
import {
  PAIR_SCORING_LABELS,
  type PairScoringMode,
} from '@/lib/golf/pairs';
import { AdminSection, Alert, FormField } from '@/components/ui';

export function PairSettingsForm({
  enabled: initialEnabled,
  scoringMode: initialScoringMode,
}: {
  enabled: boolean;
  scoringMode: PairScoringMode;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [scoringMode, setScoringMode] = useState<PairScoringMode>(initialScoringMode);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setFeedback(null);
    const result = await updatePairSettings({ enabled, scoringMode });
    setBusy(false);

    setFeedback({
      ok: result.ok,
      text: result.ok ? result.message ?? 'Configuracion guardada.' : result.error,
    });
    if (result.ok) router.refresh();
  }

  return (
    <AdminSection
      title="Modo Parejas"
      description="Clasificacion paralela: la modalidad individual y sus tarjetas no cambian."
    >
      <div className="stack">
        <FormField id="pair-mode-enabled" label="Estado">
          <select
            id="pair-mode-enabled"
            value={enabled ? 'ENABLED' : 'DISABLED'}
            onChange={(event) => setEnabled(event.target.value === 'ENABLED')}
          >
            <option value="DISABLED">Desactivado</option>
            <option value="ENABLED">Activado</option>
          </select>
        </FormField>

        <FormField
          id="pair-scoring-mode"
          label="Sistema de puntuacion"
          help={
            scoringMode === 'BEST_BALL'
              ? 'En cada hoyo cuenta el resultado que dé más puntos Stableford entre los dos jugadores.'
              : 'La puntuacion de la pareja es la suma total de los puntos de sus dos tarjetas individuales.'
          }
        >
          <select
            id="pair-scoring-mode"
            value={scoringMode}
            onChange={(event) => setScoringMode(event.target.value as PairScoringMode)}
          >
            <option value="BEST_BALL">{PAIR_SCORING_LABELS.BEST_BALL}</option>
            <option value="COMBINED_POINTS">{PAIR_SCORING_LABELS.COMBINED_POINTS}</option>
          </select>
        </FormField>

        <button type="button" className="button button--primary" disabled={busy} onClick={save}>
          {busy ? 'Guardando...' : 'Guardar configuracion'}
        </button>

        {feedback ? (
          <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
            {feedback.text}
          </Alert>
        ) : null}
      </div>
    </AdminSection>
  );
}
