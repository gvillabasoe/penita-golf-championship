'use client';

/**
 * Entrada de resultados de un hoyo.
 *
 * La pantalla esta pensada para una unica tarea: consultar el contexto del hoyo,
 * introducir el resultado con una mano y continuar inmediatamente al siguiente.
 * La navegacion general se mantiene fuera del componente; aqui solo aparecen los
 * controles propios de la vuelta.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Keypad, ConfirmationSheet } from '@/components/keypad';
import { buildConfirmationSummary } from '@/lib/scorecard/session';
import { clearHole, saveHole } from '@/lib/actions/scorecard';
import { Alert, DataChip, OfflineBanner, StatusBadge } from '@/components/ui';
import { IconBack, IconForward, IconTrash } from '@/components/ui/icons';
import { ScoreNumber } from '@/components/score';
import { resolveHole } from '@/lib/golf/stableford';
import { strokesReceivedLabel } from '@/lib/golf/strokes';
import type { HoleSnapshot } from '@/lib/golf/types';

/** Identificador estable del dispositivo: distingue "yo" de "otro movil". */
function deviceId(): string {
  const key = 'pgc:clientId';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

export function HoleEditor({
  hole,
  strokesReceived,
  current,
  baseVersion,
  canEdit,
  blockedReason,
  invalidatesReview,
  playerName,
  playerColor,
  playingHandicap,
  scoreGeneration,
  previousHole,
  nextHole,
}: {
  hole: HoleSnapshot;
  strokesReceived: number;
  current: number | 'PICKUP' | null;
  baseVersion: number;
  canEdit: boolean;
  blockedReason: string | null;
  invalidatesReview: boolean;
  playerName: string;
  playerColor: string;
  playingHandicap: number | null;
  /** Generacion de resultados vigente, para detectar un vaciado posterior. */
  scoreGeneration: number;
  previousHole: number | null;
  nextHole: number | null;
}) {
  const router = useRouter();

  /**
   * `selected` es solo el borrador de esta interaccion. El resultado ya guardado
   * se muestra en la fila del jugador y se marca en el teclado, pero no abre la
   * confirmacion nada mas entrar en un hoyo ya completado.
   */
  const [selected, setSelected] = useState<number | 'PICKUP' | null>(null);
  const [extraConfirmed, setExtraConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [askClear, setAskClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  /** Resultado que hay guardado ahora mismo, para la fila del jugador. */
  const savedResult = resolveHole(hole, strokesReceived, {
    holeNumber: hole.holeNumber,
    grossStrokes: current === 'PICKUP' || current === null ? null : current,
    isPickup: current === 'PICKUP',
  });
  const hasSavedResult = current !== null;

  const summary =
    selected === null
      ? null
      : buildConfirmationSummary(hole, strokesReceived, {
          holeNumber: hole.holeNumber,
          grossStrokes: selected === 'PICKUP' ? null : selected,
          isPickup: selected === 'PICKUP',
        });

  const selectedLabel =
    selected === null ? null : selected === 'PICKUP' ? 'Raya' : `${selected} golpes`;

  async function confirm() {
    if (selected === null) return;
    setSaving(true);
    setError(null);

    const result = await saveHole({
      clientMutationId: crypto.randomUUID(),
      clientId: deviceId(),
      holeNumber: hole.holeNumber,
      grossStrokes: selected === 'PICKUP' ? null : selected,
      isPickup: selected === 'PICKUP',
      baseVersion,
      scoreGeneration,
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    /**
     * El flujo de juego no vuelve al resumen despues de cada dato. Avanza al
     * siguiente hoyo y solo regresa a la tarjeta al confirmar el 18.
     */
    router.push(nextHole === null ? '/tarjeta#tarjeta-completa' : `/tarjeta/${nextHole}`);
  }

  /**
   * Borra el resultado y deja el hoyo VACIO, que no es lo mismo que una raya: no
   * cuenta como jugado, no da puntos y vuelve a impedir finalizar la tarjeta.
   */
  async function confirmClear() {
    setClearing(true);
    setError(null);

    const result = await clearHole({
      clientMutationId: crypto.randomUUID(),
      clientId: deviceId(),
      holeNumber: hole.holeNumber,
      baseVersion,
      scoreGeneration,
    });

    setClearing(false);
    setAskClear(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSelected(null);
    router.refresh();
  }

  const busy = saving || clearing;

  return (
    <div className="hole-editor">
      <section className="hole-header" aria-label={`Hoyo ${hole.holeNumber}`}>
        <div className="hole-header__top">
          <span className="hole-header__number">
            <span className="hole-header__number-label">Hoyo</span>
            <span className="hole-header__number-value">{hole.holeNumber}</span>
          </span>

          <div className="hole-header__facts">
            <DataChip label="Par" value={hole.par} onGreen ariaLabel={`Par ${hole.par}`} />
            <DataChip
              label="Stroke index"
              value={hole.strokeIndex}
              onGreen
              ariaLabel={`Stroke index ${hole.strokeIndex}`}
            />
            <DataChip
              label="Metros"
              value={hole.distance}
              onGreen
              ariaLabel={`${hole.distance} metros`}
            />
            <DataChip
              label="Recibe"
              value={strokesReceived === 0 ? '\u2013' : strokesReceived}
              onGreen
              ariaLabel={strokesReceivedLabel(strokesReceived)}
            />
          </div>
        </div>

        <nav className="hole-step-nav" aria-label="Navegacion entre hoyos">
          {previousHole !== null ? (
            <a className="hole-step-nav__link" href={`/tarjeta/${previousHole}`}>
              <IconBack size={18} />
              <span>Hoyo {previousHole}</span>
            </a>
          ) : (
            <span className="hole-step-nav__placeholder" aria-hidden="true" />
          )}

          <a className="hole-step-nav__link hole-step-nav__link--card" href="/tarjeta">
            Mi tarjeta
          </a>

          {nextHole !== null ? (
            <a className="hole-step-nav__link" href={`/tarjeta/${nextHole}`}>
              <span>Hoyo {nextHole}</span>
              <IconForward size={18} />
            </a>
          ) : (
            <span className="hole-step-nav__placeholder" aria-hidden="true" />
          )}
        </nav>
      </section>

      {!online ? <OfflineBanner /> : null}

      <section className="hole-player" aria-label="Tu resultado en este hoyo">
        <div className="hole-player__top">
          <span
            className="hole-player__color"
            style={{ backgroundColor: playerColor }}
            aria-hidden="true"
          />
          <div className="hole-player__identity">
            <p className="hole-player__name">{playerName}</p>
            <p className="muted">
              {playingHandicap === null ? 'Sin hándicap de juego' : `HJ ${playingHandicap}`}
              {' · '}
              {strokesReceivedLabel(strokesReceived).toLowerCase()}
            </p>
          </div>

          <span className="hole-player__values">
            {hasSavedResult ? (
              <>
                <ScoreNumber result={savedResult} />
                <StatusBadge tone="green">Guardado</StatusBadge>
              </>
            ) : (
              <StatusBadge tone="neutral">Pendiente</StatusBadge>
            )}
          </span>
        </div>
      </section>

      {!canEdit ? (
        <Alert tone="danger" role="alert">
          {blockedReason}
        </Alert>
      ) : (
        <>
          {invalidatesReview ? (
            <Alert role="status">
              Tu tarjeta ya estaba revisada. Si cambias este hoyo habra que revisarla otra vez.
            </Alert>
          ) : null}

          <section className="score-entry" aria-labelledby="score-entry-title">
            <header className="score-entry__header">
              <div>
                <p className="eyebrow">Resultado bruto</p>
                <h2 id="score-entry-title">Introduce tus golpes</h2>
              </div>
              {selectedLabel ? (
                <StatusBadge tone="green">{selectedLabel}</StatusBadge>
              ) : hasSavedResult ? (
                <StatusBadge tone="neutral">Toca un valor para cambiar</StatusBadge>
              ) : null}
            </header>

            <Keypad
              selected={selected ?? current}
              disabled={busy}
              onSelect={(value) => {
                setError(null);
                setExtraConfirmed(false);
                setSelected(value);
              }}
              onClear={hasSavedResult ? () => setAskClear(true) : undefined}
            />

            <p className="score-entry__hint">
              Selecciona del 1 al 9 o marca raya. Veras el calculo antes de confirmar.
            </p>
          </section>

          {askClear ? (
            <div className="sheet-overlay" role="presentation">
              <div
                className="sheet sheet--danger"
                role="dialog"
                aria-modal="true"
                aria-label={`Borrar el resultado del hoyo ${hole.holeNumber}`}
              >
                <span className="sheet__handle" aria-hidden="true" />
                <p className="sheet__eyebrow">Accion destructiva</p>
                <p className="sheet__title">
                  {`¿Borrar el resultado del hoyo ${hole.holeNumber}?`}
                </p>
                <p className="muted">
                  El hoyo volvera a quedar pendiente: no contara como jugado, no dara puntos y
                  habra que apuntar un resultado o una raya antes de finalizar la tarjeta.
                </p>
                <div className="button-row--split">
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={clearing}
                    onClick={() => setAskClear(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={clearing}
                    onClick={confirmClear}
                  >
                    <IconTrash size={18} />
                    {clearing ? 'Borrando...' : 'Borrar resultado'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {summary && !askClear ? (
            <ConfirmationSheet
              summary={summary}
              extraConfirmed={extraConfirmed}
              onToggleExtra={setExtraConfirmed}
              onConfirm={confirm}
              onCancel={() => {
                setSelected(null);
                setExtraConfirmed(false);
              }}
              confirmLabel={saving ? 'Guardando...' : 'Confirmar y continuar'}
              disabled={saving}
            />
          ) : null}
        </>
      )}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
