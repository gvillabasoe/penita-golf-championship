'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createPair, removePair } from '@/lib/actions/admin';
import { Alert, FormField, StatusBadge } from '@/components/ui';

interface AvailablePlayer {
  competitionPlayerId: string;
  displayName: string;
  color: string;
  flightId: string | null;
  flightName: string | null;
}

interface ExistingPair {
  pairNumber: number;
  displayName: string;
  members: Array<{ competitionPlayerId: string; displayName: string; color: string }>;
  isEligible: boolean;
  isSolo: boolean;
}

export function PairManager({
  availablePlayers,
  pairs,
  enabled,
}: {
  availablePlayers: AvailablePlayer[];
  pairs: ExistingPair[];
  enabled: boolean;
}) {
  const router = useRouter();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const firstPlayer = availablePlayers.find((player) => player.competitionPlayerId === first);
  const secondOptions = useMemo(
    () =>
      availablePlayers.filter(
        (player) =>
          player.competitionPlayerId !== first &&
          (!firstPlayer?.flightId || player.flightId !== firstPlayer.flightId),
      ),
    [availablePlayers, first, firstPlayer?.flightId],
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
      text: result.ok ? result.message ?? 'Equipo disuelto.' : result.error,
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
            disabled={!enabled || busy}
            onChange={(event) => {
              const nextFirst = event.target.value;
              setFirst(nextFirst);
              setSecond('');
            }}
          >
            <option value="">Selecciona un jugador</option>
            {availablePlayers.map((player) => (
              <option key={player.competitionPlayerId} value={player.competitionPlayerId}>
                {player.displayName}{player.flightName ? ` · ${player.flightName}` : ''}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="pair-second-player" label="Jugador 2 · otro partido">
          <select
            id="pair-second-player"
            value={second}
            disabled={!enabled || busy || first === ''}
            onChange={(event) => setSecond(event.target.value)}
          >
            <option value="">Selecciona un jugador</option>
            {secondOptions.map((player) => (
              <option key={player.competitionPlayerId} value={player.competitionPlayerId}>
                {player.displayName}{player.flightName ? ` · ${player.flightName}` : ''}
              </option>
            ))}
          </select>
        </FormField>

        <button
          type="button"
          className="button button--primary"
          disabled={!enabled || busy || first === '' || second === ''}
          onClick={add}
        >
          {busy ? 'Guardando...' : 'Crear pareja'}
        </button>
      </div>

      {!enabled ? (
        <p className="muted">Los ajustes manuales se habilitan después de confirmar los partidos y activar el modo parejas.</p>
      ) : (
        <p className="muted">
          Solo se muestran como segundo integrante jugadores de otro partido. El servidor también impide emparejar entre sí a los cuatro HCP más altos.
        </p>
      )}

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}

      {pairs.length === 0 ? (
        <p className="muted">Todavía no hay parejas sorteadas.</p>
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
                  <strong>{pair.isSolo ? `Equipo ${pair.pairNumber} · individual x2` : `Pareja ${pair.pairNumber}`}</strong>
                  <small>{pair.displayName}</small>
                </span>
              </div>
              <div className="button-row">
                {pair.isSolo ? (
                  <StatusBadge tone="gold">Puntos x2</StatusBadge>
                ) : pair.members.length !== 2 ? (
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
