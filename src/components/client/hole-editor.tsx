'use client';

/**
 * Entrada de resultados de un hoyo (secciones 19, 20 y 4).
 *
 * Tres bloques, en este orden: cabecera del hoyo con los datos que hacen falta
 * para decidir, fila del jugador con lo que lleva, y teclado. Nada mas en
 * pantalla: se usa de pie, con una mano y con prisa.
 *
 * El borrado vive aqui y no en el teclado porque necesita su propia
 * confirmacion: borrar un resultado es destructivo y la seccion 4.2 lo pide
 * explicitamente.
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
  const [selected, setSelected] = useState<number | 'PICKUP' | null>(current);
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
    router.push('/tarjeta');
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

    // La seleccion local tambien se vacia: si se quedase marcada, el teclado
    // mostraria como elegido un valor que ya no esta guardado.
    setSelected(null);
    router.refresh();
  }

  const busy = saving || clearing;

  return (
    <div className="stack">
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

        <div className="button-row">
          {previousHole !== null ? (
            <a className="button button--ghost" href={`/tarjeta/${previousHole}`}>
              <IconBack size={18} />
              Hoyo {previousHole}
            </a>
          ) : null}
          <a className="button button--ghost" href="/tarjeta">
            Mi tarjeta
          </a>
          {nextHole !== null ? (
            <a className="button button--ghost" href={`/tarjeta/${nextHole}`}>
              Hoyo {nextHole}
              <IconForward size={18} />
            </a>
          ) : null}
        </div>
      </section>

      {!online ? <OfflineBanner /> : null}

      <section className="hole-player" aria-label="Tu resultado en este hoyo">
        <div className="hole-player__top">
          <span
            className="hole-player__color"
            style={{ backgroundColor: playerColor }}
            aria-hidden="true"
          />
          <div>
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

          <Keypad
            selected={selected}
            disabled={busy}
            onSelect={setSelected}
            onClear={hasSavedResult ? () => setAskClear(true) : undefined}
          />

          {askClear ? (
            <div
              className="sheet sheet--danger"
              role="dialog"
              aria-modal="true"
              aria-label={`Borrar el resultado del hoyo ${hole.holeNumber}`}
            >
              <span className="sheet__handle" aria-hidden="true" />
              <p className="sheet__title">
                {`¿Quieres borrar el resultado del hoyo ${hole.holeNumber}?`}
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
          ) : null}

          {summary && !askClear ? (
            <ConfirmationSheet
              summary={summary}
              extraConfirmed={extraConfirmed}
              onToggleExtra={setExtraConfirmed}
              onConfirm={confirm}
              onCancel={() => setSelected(null)}
            />
          ) : null}

          {!summary && !askClear ? (
            <p className="muted">Elige los golpes o marca raya.</p>
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
