'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { previewDraw, saveDraw } from '@/lib/actions/admin';
import { formatTenths } from '@/lib/golf/decimal';
import { AdminSection, Alert, StatusBadge } from '@/components/ui';

interface PreviewMember {
  competitionPlayerId: string;
  displayName: string;
  color: string;
  handicapIndexTenths: number | null;
  knowsCourse: boolean;
  isWorstHandicap: boolean;
}

interface PreviewFlight {
  order: number;
  name: string;
  memberIds: string[];
  averageHandicapTenths: number | null;
  knowsCourseCount: number;
  members: PreviewMember[];
}

/** Sorteo equilibrado, revisable y reproducible mediante una semilla visible. */
export function DrawPanel({ isConfirmed }: { isConfirmed: boolean }) {
  const router = useRouter();
  const [seed, setSeed] = useState('');
  const [rosterFingerprint, setRosterFingerprint] = useState('');
  const [firstTeeTime, setFirstTeeTime] = useState('');
  const [interval, setIntervalMinutes] = useState('10');
  const [preview, setPreview] = useState<PreviewFlight[] | null>(null);
  const [missingHandicapCount, setMissingHandicapCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function doPreview(forceRandom = false) {
    setBusy(true);
    setFeedback(null);
    const result = await previewDraw(forceRandom ? '' : seed);
    setBusy(false);
    if (!result.ok) {
      setFeedback({ ok: false, text: result.error });
      return;
    }

    setSeed(result.seed);
    setRosterFingerprint(result.rosterFingerprint);
    setPreview(result.flights);
    setMissingHandicapCount(result.missingHandicapCount);
    setFeedback({
      ok: true,
      text:
        result.invalidatedPairPlayers > 0
          ? `Propuesta generada. Se han invalidado las asignaciones de pareja de ${result.invalidatedPairPlayers} participante(s). Revisa y confirma los partidos.`
          : 'Propuesta generada. Revisa todos los partidos antes de confirmarlos.',
    });
    router.refresh();
  }

  async function doSave() {
    setBusy(true);
    setFeedback(null);
    // datetime-local no incluye zona. El torneo se juega en Madrid y en junio
    // aplica +02:00; si se deja vacio, las horas se fijan despues por partido.
    const result = await saveDraw(
      seed,
      rosterFingerprint,
      firstTeeTime === '' ? '' : `${firstTeeTime}:00+02:00`,
      Number(interval),
    );
    setBusy(false);
    setFeedback(
      result.ok
        ? { ok: true, text: result.message ?? 'Partidos confirmados.' }
        : { ok: false, text: result.error },
    );
    if (result.ok) {
      setPreview(null);
      setSeed('');
      setRosterFingerprint('');
      router.refresh();
    }
  }

  return (
    <AdminSection
      title="Sorteo de partidos"
      description="Primera fase obligatoria: genera una distribución equilibrada, revísala y confírmala antes de sortear parejas."
      ariaLabel="Sorteo de partidos"
    >
      <ol className="draw-workflow" aria-label="Orden del proceso">
        <li data-done="true">Configurar participantes</li>
        <li data-active={preview === null ? 'true' : undefined}>Sortear partidos</li>
        <li data-active={preview !== null ? 'true' : undefined}>Revisar partidos</li>
        <li data-done={isConfirmed && preview === null ? 'true' : undefined}>Confirmar partidos</li>
        <li data-done={isConfirmed && preview === null ? 'true' : undefined}>
          Habilitar sorteo de parejas
        </li>
        <li>Sortear parejas</li>
      </ol>

      {isConfirmed ? (
        <Alert tone="warning" role="status">
          Hay partidos confirmados. Un nuevo sorteo los dejará pendientes de confirmación y eliminará cualquier sorteo de parejas anterior.
        </Alert>
      ) : null}

      <div className="field">
        <label htmlFor="seed">Semilla (vacía para generar una aleatoria)</label>
        <input
          id="seed"
          type="text"
          value={seed}
          disabled={preview !== null || busy}
          onChange={(event) => setSeed(event.target.value)}
        />
        <p className="field__help">
          Una misma semilla reproduce la misma propuesta mientras no cambien los participantes, sus HCP ni “Conoce el campo”.
        </p>
      </div>

      {preview === null ? (
        <div className="button-row">
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => void doPreview(false)}
          >
            {busy ? 'Calculando...' : 'Sortear partidos'}
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className="draw-preview stack">
          <div className="section-header">
            <div>
              <p className="eyebrow">Propuesta pendiente</p>
              <h3>Revisión de partidos</h3>
            </div>
            <div className="button-row">
              <StatusBadge tone="warning">Sin confirmar</StatusBadge>
              <button
                type="button"
                className="button button--secondary button--sm"
                disabled={busy}
                onClick={() => void doPreview(true)}
              >
                {busy ? 'Calculando...' : 'Generar otra propuesta'}
              </button>
            </div>
          </div>

          <p className="muted">
            Semilla <code>{seed}</code>. El algoritmo equilibra HCP, separa los cuatro HCP más altos siempre que sea posible y reparte a quienes conocen el campo.
          </p>

          {missingHandicapCount > 0 ? (
            <Alert tone="warning" role="status">
              {missingHandicapCount} participante(s) no tienen HCP. Para el equilibrio se utiliza la mediana de los HCP disponibles.
            </Alert>
          ) : null}

          <div className="draw-preview__grid">
            {preview.map((flight) => (
              <section key={flight.order} className="draw-preview__flight">
                <header className="draw-preview__flight-header">
                  <div>
                    <h4>{flight.name}</h4>
                    <p className="muted">
                      HCP medio{' '}
                      {flight.averageHandicapTenths === null
                        ? '—'
                        : formatTenths(flight.averageHandicapTenths)}
                    </p>
                  </div>
                  <StatusBadge tone={flight.knowsCourseCount > 0 ? 'green' : 'warning'}>
                    {flight.knowsCourseCount > 0
                      ? `${flight.knowsCourseCount} conoce${flight.knowsCourseCount === 1 ? '' : 'n'} el campo`
                      : 'Sin guía del campo'}
                  </StatusBadge>
                </header>

                <ul className="draw-preview__members">
                  {flight.members.map((member) => (
                    <li key={member.competitionPlayerId}>
                      <span
                        className="player-card__color"
                        style={{ backgroundColor: member.color }}
                        aria-hidden="true"
                      />
                      <span className="draw-preview__member-name">{member.displayName}</span>
                      <span className="draw-preview__member-meta">
                        HCP{' '}
                        {member.handicapIndexTenths === null
                          ? '—'
                          : formatTenths(member.handicapIndexTenths)}
                      </span>
                      {member.knowsCourse ? <StatusBadge tone="green">Conoce el campo</StatusBadge> : null}
                      {member.isWorstHandicap ? <StatusBadge tone="gold">HCP alto</StatusBadge> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="field">
            <label htmlFor="teeTime">Primera salida (opcional)</label>
            <input
              id="teeTime"
              type="datetime-local"
              value={firstTeeTime}
              onChange={(event) => setFirstTeeTime(event.target.value)}
            />
            <p className="field__help">
              Si todavía no sabéis la hora, déjalo vacío: podrás fijarla después en cada partido.
            </p>
          </div>

          <div className="field">
            <label htmlFor="interval">Intervalo entre partidos (minutos)</label>
            <input
              id="interval"
              type="number"
              min={1}
              max={60}
              value={interval}
              onChange={(event) => setIntervalMinutes(event.target.value)}
            />
          </div>

          <div className="button-row--split">
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setRosterFingerprint('');
                setFeedback(null);
              }}
            >
              Descartar propuesta
            </button>
            <button type="button" className="button button--primary" disabled={busy} onClick={doSave}>
              {busy
                ? 'Confirmando...'
                : firstTeeTime === ''
                  ? 'Confirmar partidos'
                  : 'Confirmar partidos y horas'}
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}
    </AdminSection>
  );
}
