'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { saveManualFlights } from '@/lib/actions/admin';
import { formatTenths } from '@/lib/golf/decimal';
import { AdminSection, Alert, StatusBadge } from '@/components/ui';

interface ManualFlightPlayer {
  competitionPlayerId: string;
  displayName: string;
  color: string;
  handicapIndexTenths: number | null;
  knowsCourse: boolean;
}

interface SavedFlight {
  id: string;
  name: string;
  order: number;
  memberIds: string[];
  teeTime: string | null;
}

interface EditableFlight {
  key: string;
  name: string;
  memberIds: string[];
  teeTime: string | null;
}

function defaultFlightCount(playerCount: number): number {
  return Math.max(1, Math.ceil(playerCount / 4));
}

function initialFlights(players: ManualFlightPlayer[], savedFlights: SavedFlight[]): EditableFlight[] {
  if (savedFlights.length > 0) {
    return [...savedFlights]
      .sort((left, right) => left.order - right.order)
      .map((flight) => ({
        key: `saved-${flight.id}`,
        name: flight.name,
        memberIds: [...flight.memberIds],
        teeTime: flight.teeTime,
      }));
  }

  return Array.from({ length: defaultFlightCount(players.length) }, (_, index) => ({
    key: `initial-${index + 1}`,
    name: `Partido ${index + 1}`,
    memberIds: [],
    teeTime: null,
  }));
}

/**
 * Configuración manual de partidos.
 *
 * El estado solo vive en el navegador hasta pulsar confirmar. El servidor vuelve
 * a validar que todos los participantes activos estén exactamente una vez y que
 * ningún partido supere cuatro jugadores.
 */
export function ManualFlightManager({
  players,
  savedFlights,
  isConfirmed,
  hasPairs,
}: {
  players: ManualFlightPlayer[];
  savedFlights: SavedFlight[];
  isConfirmed: boolean;
  hasPairs: boolean;
}) {
  const router = useRouter();
  const nextKey = useRef(savedFlights.length + defaultFlightCount(players.length) + 1);
  const [flights, setFlights] = useState<EditableFlight[]>(() =>
    initialFlights(players, savedFlights),
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.competitionPlayerId, player] as const)),
    [players],
  );

  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flight of flights) {
      for (const playerId of flight.memberIds) {
        counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
      }
    }
    return counts;
  }, [flights]);

  const assignedFlightName = useMemo(() => {
    const assignments = new Map<string, string>();
    for (const flight of flights) {
      for (const playerId of flight.memberIds) assignments.set(playerId, flight.name);
    }
    return assignments;
  }, [flights]);

  const unassigned = players.filter(
    (player) => !assignmentCounts.has(player.competitionPlayerId),
  );
  const duplicated = players.filter(
    (player) => (assignmentCounts.get(player.competitionPlayerId) ?? 0) > 1,
  );
  const emptyFlights = flights.filter((flight) => flight.memberIds.length === 0).length;
  const oversizedFlights = flights.filter((flight) => flight.memberIds.length > 4).length;
  const singleFlights = flights.filter((flight) => flight.memberIds.length === 1).length;
  const canConfirm =
    players.length > 0 &&
    flights.length > 0 &&
    unassigned.length === 0 &&
    duplicated.length === 0 &&
    emptyFlights === 0 &&
    oversizedFlights === 0;

  function updateFlight(key: string, updater: (flight: EditableFlight) => EditableFlight) {
    setFlights((current) =>
      current.map((flight) => (flight.key === key ? updater(flight) : flight)),
    );
  }

  function addPlayer(flightKey: string, playerId: string) {
    if (playerId === '') return;
    setFeedback(null);
    setFlights((current) => {
      const target = current.find((flight) => flight.key === flightKey);
      if (!target || target.memberIds.length >= 4) return current;

      return current.map((flight) => ({
        ...flight,
        memberIds:
          flight.key === flightKey
            ? [...flight.memberIds.filter((id) => id !== playerId), playerId]
            : flight.memberIds.filter((id) => id !== playerId),
      }));
    });
  }

  function removePlayer(flightKey: string, playerId: string) {
    setFeedback(null);
    updateFlight(flightKey, (flight) => ({
      ...flight,
      memberIds: flight.memberIds.filter((id) => id !== playerId),
    }));
  }

  function addFlight() {
    setFeedback(null);
    const number = nextKey.current;
    nextKey.current += 1;
    setFlights((current) => [
      ...current,
      {
        key: `manual-${number}`,
        name: `Partido ${current.length + 1}`,
        memberIds: [],
        teeTime: null,
      },
    ]);
  }

  function removeFlight(key: string) {
    setFeedback(null);
    setFlights((current) => current.filter((flight) => flight.key !== key));
  }

  function moveFlight(index: number, direction: -1 | 1) {
    setFeedback(null);
    setFlights((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function resetFromSaved() {
    setFeedback(null);
    setFlights(initialFlights(players, savedFlights));
  }

  function clearAssignments() {
    setFeedback(null);
    setFlights((current) => current.map((flight) => ({ ...flight, memberIds: [] })));
  }

  async function confirmManualFlights() {
    setBusy(true);
    setFeedback(null);
    const result = await saveManualFlights(
      flights.map((flight) => ({
        name: flight.name,
        memberIds: flight.memberIds,
        teeTime: flight.teeTime,
      })),
    );
    setBusy(false);
    setFeedback(
      result.ok
        ? { ok: true, text: result.message ?? 'Partidos manuales confirmados.' }
        : { ok: false, text: result.error },
    );
    if (result.ok) router.refresh();
  }

  return (
    <AdminSection
      title="Configuración manual"
      description="Alternativa al sorteo: decide qué jugadores forman cada partido, revisa la composición y confírmala."
      ariaLabel="Configuración manual de partidos"
    >
      <div className="stack">
        {(isConfirmed || hasPairs) ? (
          <Alert tone="warning" role="status">
            Al confirmar esta configuración se sustituirán los partidos actuales, se eliminarán las parejas existentes y la composición dejará de tener semilla de sorteo.
          </Alert>
        ) : null}

        <div className="manual-flight-toolbar">
          <div className="button-row">
            <button type="button" className="button button--secondary" disabled={busy} onClick={addFlight}>
              Añadir partido
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy || flights.every((flight) => flight.memberIds.length === 0)}
              onClick={clearAssignments}
            >
              Vaciar asignaciones
            </button>
          </div>
          <button type="button" className="button button--ghost button--sm" disabled={busy} onClick={resetFromSaved}>
            Restablecer
          </button>
        </div>

        <div className="manual-flight-summary" aria-live="polite">
          <StatusBadge tone={unassigned.length === 0 ? 'green' : 'warning'}>
            {unassigned.length === 0 ? 'Todos asignados' : `${unassigned.length} sin asignar`}
          </StatusBadge>
          <StatusBadge tone={emptyFlights === 0 ? 'green' : 'warning'}>
            {emptyFlights === 0 ? 'Sin partidos vacíos' : `${emptyFlights} partido${emptyFlights === 1 ? '' : 's'} vacío${emptyFlights === 1 ? '' : 's'}`}
          </StatusBadge>
          {singleFlights > 0 ? (
            <StatusBadge tone="gold">
              {singleFlights} partido{singleFlights === 1 ? '' : 's'} individual{singleFlights === 1 ? '' : 'es'}
            </StatusBadge>
          ) : null}
        </div>

        {unassigned.length > 0 ? (
          <div className="manual-flight-unassigned">
            <div>
              <p className="eyebrow">Pendientes de asignar</p>
              <p className="muted">Añádelos desde el selector de cualquiera de los partidos.</p>
            </div>
            <ul>
              {unassigned.map((player) => (
                <li key={player.competitionPlayerId}>
                  <span style={{ backgroundColor: player.color }} aria-hidden="true" />
                  {player.displayName}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="manual-flight-grid">
          {flights.map((flight, index) => {
            const members = flight.memberIds
              .map((id) => playerById.get(id))
              .filter((player): player is ManualFlightPlayer => player !== undefined);
            const available = players.filter(
              (player) => !flight.memberIds.includes(player.competitionPlayerId),
            );

            return (
              <section key={flight.key} className="manual-flight-card">
                <header className="manual-flight-card__header">
                  <div className="manual-flight-card__title">
                    <span className="manual-flight-card__order">{index + 1}</span>
                    <label className="visually-hidden" htmlFor={`manual-flight-name-${flight.key}`}>
                      Nombre del partido {index + 1}
                    </label>
                    <input
                      id={`manual-flight-name-${flight.key}`}
                      type="text"
                      maxLength={80}
                      value={flight.name}
                      disabled={busy}
                      onChange={(event) =>
                        updateFlight(flight.key, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="manual-flight-card__actions">
                    <StatusBadge tone={members.length > 0 && members.length <= 4 ? 'green' : 'warning'}>
                      {members.length}/4
                    </StatusBadge>
                    <button
                      type="button"
                      className="button button--ghost button--sm"
                      aria-label={`Subir ${flight.name}`}
                      disabled={busy || index === 0}
                      onClick={() => moveFlight(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="button button--ghost button--sm"
                      aria-label={`Bajar ${flight.name}`}
                      disabled={busy || index === flights.length - 1}
                      onClick={() => moveFlight(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="button button--danger button--sm"
                      disabled={busy || flights.length === 1}
                      onClick={() => removeFlight(flight.key)}
                    >
                      Eliminar
                    </button>
                  </div>
                </header>

                {members.length === 0 ? (
                  <p className="manual-flight-card__empty">Partido vacío.</p>
                ) : (
                  <ul className="manual-flight-card__members">
                    {members.map((member) => (
                      <li key={member.competitionPlayerId}>
                        <span
                          className="player-card__color"
                          style={{ backgroundColor: member.color }}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>{member.displayName}</strong>
                          <small>
                            HCP {member.handicapIndexTenths === null ? '—' : formatTenths(member.handicapIndexTenths)}
                            {member.knowsCourse ? ' · Conoce el campo' : ''}
                          </small>
                        </span>
                        <button
                          type="button"
                          className="button button--ghost button--sm"
                          disabled={busy}
                          onClick={() => removePlayer(flight.key, member.competitionPlayerId)}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="field manual-flight-card__add">
                  <label htmlFor={`manual-flight-add-${flight.key}`}>Añadir o mover jugador</label>
                  <select
                    id={`manual-flight-add-${flight.key}`}
                    value=""
                    disabled={busy || members.length >= 4 || available.length === 0}
                    onChange={(event) => addPlayer(flight.key, event.target.value)}
                  >
                    <option value="">
                      {members.length >= 4
                        ? 'Partido completo'
                        : available.length === 0
                          ? 'No hay otros jugadores'
                          : 'Selecciona o mueve un jugador'}
                    </option>
                    {available.map((player) => (
                      <option key={player.competitionPlayerId} value={player.competitionPlayerId}>
                        {player.displayName}
                        {assignedFlightName.get(player.competitionPlayerId)
                          ? ` · mover desde ${assignedFlightName.get(player.competitionPlayerId)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </section>
            );
          })}
        </div>

        {!canConfirm ? (
          <Alert tone="warning" role="status">
            Para confirmar, todos los jugadores activos deben aparecer exactamente una vez, no puede haber partidos vacíos y ningún partido puede superar cuatro integrantes.
          </Alert>
        ) : singleFlights > 0 ? (
          <Alert tone="info" role="status">
            Puedes confirmar partidos de una sola persona, pero su tarjeta tendrá que revisarla un administrador.
          </Alert>
        ) : null}

        <div className="button-row--split">
          <p className="muted">
            La configuración manual no genera semilla. Las horas existentes se conservan cuando partes de los partidos actuales; las nuevas se pueden fijar después.
          </p>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || !canConfirm}
            onClick={confirmManualFlights}
          >
            {busy ? 'Confirmando...' : 'Confirmar partidos manuales'}
          </button>
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
