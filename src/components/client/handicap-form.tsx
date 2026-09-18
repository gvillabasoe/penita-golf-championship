'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { setHandicap } from '@/lib/actions/admin';
import { Alert } from '@/components/ui';

export function HandicapForm({
  competitionPlayerId,
  current,
}: {
  competitionPlayerId: string;
  current: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    const result = await setHandicap(competitionPlayerId, value);
    setBusy(false);
    setFeedback(
      result.ok
        ? { ok: true, text: result.message ?? 'Guardado.' }
        : { ok: false, text: result.error },
    );
    if (result.ok) router.refresh();
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`hcp-${competitionPlayerId}`}>Hándicap exacto</label>
        <input
          id={`hcp-${competitionPlayerId}`}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="20,7"
        />
      </div>
      <button type="button" className="button button--primary" disabled={busy} onClick={save}>
        {busy ? 'Guardando...' : 'Guardar hándicap'}
      </button>
      {feedback ? (
        <Alert
          tone={feedback.ok ? 'success' : 'danger'}
          role={feedback.ok ? 'status' : 'alert'}
        >
          {feedback.text}
        </Alert>
      ) : null}
    </div>
  );
}
