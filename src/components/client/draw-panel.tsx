'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { previewDraw, saveDraw } from '@/lib/actions/admin';
import { Alert } from '@/components/ui';

/**
 * Sorteo con semilla visible.
 *
 * La semilla se guarda y se puede volver a ejecutar: si alguien dice que le han
 * tocado los tres que peor juegan, se le da la semilla y comprueba que sale lo
 * mismo.
 */
export function DrawPanel() {
  const router = useRouter();
  const [seed, setSeed] = useState('');
  const [firstTeeTime, setFirstTeeTime] = useState('');
  const [interval, setIntervalMinutes] = useState('10');
  const [preview, setPreview] = useState<Array<{ order: number; name: string; memberIds: string[] }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function doPreview() {
    setBusy(true);
    setFeedback(null);
    const result = await previewDraw(seed);
    setBusy(false);
    if (!result.ok) {
      setFeedback({ ok: false, text: result.error });
      return;
    }
    setSeed(result.seed);
    setPreview(result.flights);
  }

  async function doSave() {
    if (firstTeeTime === '') {
      setFeedback({ ok: false, text: 'Hace falta la hora de la primera salida.' });
      return;
    }
    setBusy(true);
    // La hora llega como "2026-06-13T09:00" sin zona: se le anade la de Madrid
    // en verano, para no depender de la zona del servidor (Vercel corre en UTC).
    const result = await saveDraw(seed, `${firstTeeTime}:00+02:00`, Number(interval));
    setBusy(false);
    setFeedback(result.ok ? { ok: true, text: result.message ?? 'Guardado.' } : { ok: false, text: result.error });
    if (result.ok) {
      setPreview(null);
      router.refresh();
    }
  }

  return (
    <section className="admin-section" aria-label="Sorteo">
      <h2>Sorteo</h2>

      <div className="field">
        <label htmlFor="seed">Semilla (se deja vacia para una aleatoria)</label>
        <input id="seed" type="text" value={seed} onChange={(e) => setSeed(e.target.value)} />
      </div>

      <div className="button-row">
        <button type="button" className="button button--secondary" disabled={busy} onClick={doPreview}>
          {busy ? 'Sorteando...' : 'Sortear'}
        </button>
      </div>

      {preview ? (
        <>
          <p className="muted">
            Propuesta con la semilla <code>{seed}</code>. Nada se guarda hasta confirmar.
          </p>
          <ul>
            {preview.map((flight) => (
              <li key={flight.order}>
                {flight.name}: {flight.memberIds.length} jugadores
              </li>
            ))}
          </ul>

          <div className="field">
            <label htmlFor="teeTime">Primera salida</label>
            <input
              id="teeTime"
              type="datetime-local"
              value={firstTeeTime}
              onChange={(e) => setFirstTeeTime(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="interval">Intervalo entre partidos (minutos)</label>
            <input
              id="interval"
              type="number"
              min={1}
              max={60}
              value={interval}
              onChange={(e) => setIntervalMinutes(e.target.value)}
            />
          </div>

          <button type="button" className="button button--primary" disabled={busy} onClick={doSave}>
            Confirmar partidos y horas
          </button>
        </>
      ) : null}

      {feedback ? (
        <Alert
          tone={feedback.ok ? 'success' : 'danger'}
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.text}
        </Alert>
      ) : null}
    </section>
  );
}
