'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { clearPairs, createPair, removePair } from '@/lib/actions/admin';
import { Alert, FormField, StatusBadge } from '@/components/ui';

interface AvailablePlayer {
  competitionPlayerId: string;
  displayName: string;
  color: string;
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
  const [solo, setSolo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const secondOptions = useMemo(
    () =>
      availablePlayers.filter(
        (player) => player.competitionPlayerId !== first,
      ),
    [availablePlayers, first],
  );
  const hasSolo = pairs.some((pair) => pair.isSolo);
  const canAdd = enabled && !busy && first !== '' && (solo || second !== '');

  async function add() {
    setBusy(true);
    setFeedback(null);
    const result = await createPair(first, solo ? '' : second, solo);
    setBusy(false);

    setFeedback({
      ok: result.ok,
      text: result.ok ? result.message ?? 'Pareja creada.' : result.error,
    });
    if (result.ok) {
      setFirst('');
      setSecond('');
      setSolo(false);
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

  async function clearAll() {
    if (!window.confirm('Se disolverán todas las parejas actuales. ¿Continuar?')) return;
    setBusy(true);
    setFeedback(null);
    const result = await clearPairs();
    setBusy(false);
    setFeedback({
      ok: result.ok,
      text: result.ok ? result.message ?? 'Parejas vaciadas.' : result.error,
    });
    if (result.ok) {
      setFirst('');
      setSecond('');
      setSolo(false);
      router.refresh();
    }
  }

  return (
    <div className="stack">
      {pairs.length > 0 ? (
        <div className="button-row--split pair-manual-toolbar">
          <p className="muted">Puedes disolver equipos uno a uno o vaciar toda la composición para empezar de cero.</p>
          <button
            type="button"
            className="button button--danger button--sm"
            disabled={!enabled || busy}
            onClick={clearAll}
          >
            Vaciar todas las parejas
          </button>
        </div>
      ) : null}

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

        <FormField
          id="pair-second-player"
          label="Jugador 2"
          help={solo ? 'No se utiliza porque el equipo será individual x2.' : 'Puede pertenecer a cualquier partido.'}
        >
          <select
            id="pair-second-player"
            value={second}
            disabled={!enabled || busy || first === '' || solo}
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

        <label className="course-knowledge-toggle pair-solo-toggle">
          <span className="course-knowledge-toggle__copy">
            <strong>Individual x2</strong>
            <small>Un solo jugador forma el equipo y sus puntos cuentan por dos.</small>
          </span>
          <span className="course-knowledge-toggle__control">
            <input
              type="checkbox"
              checked={solo}
              disabled={!enabled || busy || hasSolo}
              onChange={(event) => {
                setSolo(event.target.checked);
                if (event.target.checked) setSecond('');
              }}
            />
            <span>{solo ? 'Sí' : 'No'}</span>
          </span>
        </label>

        <button
          type="button"
          className="button button--primary pair-builder__submit"
          disabled={!canAdd}
          onClick={add}
        >
          {busy ? 'Guardando...' : solo ? 'Crear individual x2' : 'Crear pareja'}
        </button>
      </div>

      {!enabled ? (
        <p className="muted">Los ajustes manuales se habilitan después de confirmar los partidos y activar el modo parejas.</p>
      ) : (
        <p className="muted">
          En configuración manual decides libremente los integrantes, aunque compartan partido o estén entre los HCP más altos. Cada jugador solo puede pertenecer a un equipo y solo puede existir un individual x2. Cualquier cambio manual elimina la seed del sorteo anterior.
        </p>
      )}

      {hasSolo ? (
        <p className="muted">Ya existe un equipo individual x2. Disuélvelo antes de asignar otro.</p>
      ) : null}

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}

      {pairs.length === 0 ? (
        <p className="muted">Todavía no hay parejas ni equipos individuales.</p>
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
