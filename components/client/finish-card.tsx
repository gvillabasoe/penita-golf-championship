'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { finishScorecard } from '@/lib/actions/scorecard';

export function FinishCardButton({
  canFinish,
  message,
}: {
  canFinish: boolean;
  message: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    const result = await finishScorecard();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="card stack">
      {!canFinish && message ? (
        <p className="alert" role="status">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        className="button button--primary"
        disabled={!canFinish || busy}
        onClick={finish}
      >
        {busy ? 'Finalizando...' : 'Finalizar tarjeta'}
      </button>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
