'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { setCompetitionDate } from '@/lib/actions/admin';
import { AdminSection, Alert, FormField } from '@/components/ui';

/** Fecha en la que se juega el campeonato. */
export function CompetitionDateForm({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(next: string) {
    setBusy(true);
    setFeedback(null);
    const result = await setCompetitionDate(next);
    setBusy(false);
    setFeedback(result.ok ? { ok: true, text: result.message ?? 'Guardado.' } : { ok: false, text: result.error });
    if (result.ok) {
      setValue(next);
      router.refresh();
    }
  }

  return (
    <AdminSection
      title="Fecha del campeonato"
      description="El día que se juega. Aparece en la tarjeta de cada jugador y en las exportaciones."
    >
      <div className="stack">
        <FormField
          id="fecha-campeonato"
          label="Fecha"
          help="Si ya hay horas de salida, se mueven al nuevo día conservando la hora."
        >
          <input
            id="fecha-campeonato"
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </FormField>

        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            disabled={busy || value === '' || value === current}
            onClick={() => save(value)}
          >
            {busy ? 'Guardando...' : 'Guardar fecha'}
          </button>
          {current !== '' ? (
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => save('')}
            >
              Quitar fecha
            </button>
          ) : null}
        </div>

        {feedback ? (
          <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
            {feedback.text}
          </Alert>
        ) : null}
      </div>
    </AdminSection>
  );
}
