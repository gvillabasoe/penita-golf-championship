'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { reviewScorecard } from '@/lib/actions/scorecard';
import { Alert } from '@/components/ui';

export function ReviewButton({
  competitionPlayerId,
  displayName,
}: {
  competitionPlayerId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function review(status: 'OK' | 'OBJECTED') {
    setBusy(true);
    setError(null);
    const result = await reviewScorecard(competitionPlayerId, status, notes);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="form-section">
      <div className="field">
        <label htmlFor={`notas-${competitionPlayerId}`}>Observaciones (opcional)</label>
        <textarea
          id={`notas-${competitionPlayerId}`}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={() => review('OK')}
        >
          Validar la tarjeta de {displayName.split(' ')[0]}
        </button>
        <button
          type="button"
          className="button button--secondary"
          disabled={busy}
          onClick={() => review('OBJECTED')}
        >
          Poner objecion
        </button>
      </div>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
