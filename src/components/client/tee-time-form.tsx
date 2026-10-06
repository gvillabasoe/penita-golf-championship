'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { setFlightTeeTime } from '@/lib/actions/admin';
import { Alert, FormField } from '@/components/ui';

/**
 * Hora de salida de un partido, en hora de Ulzama.
 *
 * Se aplica al dia del campeonato: sin fecha fijada el campo queda desactivado
 * y lo dice, en vez de dejar escribir una hora que no se podria guardar.
 */
export function TeeTimeForm({
  flightId,
  flightName,
  current,
  hasCompetitionDate,
}: {
  flightId: string;
  flightName: string;
  current: string;
  hasCompetitionDate: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const id = `salida-${flightId}`;

  async function save(next: string) {
    setBusy(true);
    setFeedback(null);
    const result = await setFlightTeeTime(flightId, next);
    setBusy(false);
    setFeedback(result.ok ? { ok: true, text: result.message ?? 'Guardado.' } : { ok: false, text: result.error });
    if (result.ok) {
      setValue(next);
      router.refresh();
    }
  }

  return (
    <div className="stack">
      <FormField
        id={id}
        label={`Hora de salida · ${flightName}`}
        help={hasCompetitionDate ? 'Hora de Ulzama, formato 24 h.' : 'Fija antes la fecha del campeonato en Resumen.'}
      >
        <input
          id={id}
          type="time"
          step={60}
          value={value}
          disabled={!hasCompetitionDate || busy}
          onChange={(event) => setValue(event.target.value)}
        />
      </FormField>

      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={!hasCompetitionDate || busy || value === '' || value === current}
          onClick={() => save(value)}
        >
          {busy ? 'Guardando...' : 'Guardar hora'}
        </button>
        {current !== '' ? (
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => save('')}
          >
            Quitar hora
          </button>
        ) : null}
      </div>

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}
    </div>
  );
}
