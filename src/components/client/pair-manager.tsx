'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createPair, removePair } from '@/lib/actions/admin';
import { Alert, FormField, StatusBadge } from '@/components/ui';

interface AvailablePlayer {
  competitionPlayerId: string;
  displayName: string;
  color: string;
}

interface ExistingPair {
  pairNumber: number;
  displayName: string;
  members: Array<{ competitionPlayerId: string; displayName: string; color: string }>;
  isEligible: boolean;
}

export function PairManager({
  availablePlayers,
  pairs,
}: {
  availablePlayers: AvailablePlayer[];
  pairs: ExistingPair[];
}) {
  const router = useRouter();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const secondOptions = useMemo(
    () => availablePlayers.filter((player) => player.competitionPlayerId !== first),
    [availablePlayers, first],
  );

  async function add() {
    setBusy(true);
    setFeedback(null);
    const result = await createPair(first, second);
    setBusy(false);

    setFeedback({
      ok: result.ok,
      text: result.ok ? result.message ?? 'Pareja creada.' : result.error,
    });
    if (result.ok) {
      setFirst('');
      setSecond('');
      router.refresh();
    }
  }

  async function dissolve(pairNumber: number) {
    setBusy(true);
    setFeedback(null);
    const result = await removePair(pairNumber);
    setBusy(false);

    setFeedback({
      ok: result.ok,
      text: result.ok ? result.message ?? 'Pareja disuelta.' : result.error,
    });
    if (result.ok) router.refresh();
  }

  return (
    <div className="stack">
      <div className="pair-builder">
        <FormField id="pair-first-player" label="Jugador 1">
          <select
            id="pair-first-player"
            value={first}
            onChange={(event) => {
              const nextFirst = event.target.value;
              setFirst(nextFirst);
              if (second === nextFirst) setSecond('');
            }}
          >
            <option value="">Selecciona un jugador</option>
            {availablePlayers.map((player) => (
              <option key={player.competitionPlayerId} value={player.competitionPlayerId}>
                {player.displayName}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="pair-second-player" label="Jugador 2">
          <select
            id="pair-second-player"
            value={second}
            onChange={(event) => setSecond(event.target.value)}
          >
            <option value="">Selecciona un jugador</option>
            {secondOptions.map((player) => (
              <option key={player.competitionPlayerId} value={player.competitionPlayerId}>
                {player.displayName}
              </option>
            ))}
          </select>
        </FormField>

        <button
          type="button"
          className="button button--primary"
          disabled={busy || first === '' || second === ''}
          onClick={add}
        >
          {busy ? 'Guardando...' : 'Crear pareja'}
        </button>
      </div>

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}

      {pairs.length === 0 ? (
        <p className="muted">Todavia no hay parejas creadas.</p>
      ) : (
        <ol className="pair-admin-list">
          {pairs.map((pair) => (
            <li key={pair.pairNumber} className="pair-admin-row">
              <div className="pair-admin-row__identity">
                <span className="pair-swatches" aria-hidden="true">
                  {pair.members.map((member) => (
                    <span key={member.competitionPlayerId} style={{ backgroundColor: member.color }} />
                  ))}
                </span>
                <span>
                  <strong>Pareja {pair.pairNumber}</strong>
                  <small>{pair.displayName}</small>
                </span>
              </div>
              <div className="button-row">
                {pair.members.length !== 2 ? (
                  <StatusBadge tone="danger">Incompleta</StatusBadge>
                ) : !pair.isEligible ? (
                  <StatusBadge tone="warning">Falta HCP</StatusBadge>
                ) : (
                  <StatusBadge tone="green">Lista</StatusBadge>
                )}
                <button
                  type="button"
                  className="button button--danger button--sm"
                  disabled={busy}
                  onClick={() => dissolve(pair.pairNumber)}
                >
                  Disolver
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
