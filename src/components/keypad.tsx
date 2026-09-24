/**
 * Teclado de resultados y hoja de confirmacion (secciones 19, 20 y 36).
 *
 * ---------------------------------------------------------------------------
 * Que teclas hay
 * ---------------------------------------------------------------------------
 * Exactamente 1 a 9 y raya. Ni ceros, ni dieces, ni flechas de incremento. La
 * lista sale de `PLAYER_KEYPAD`, que vive en el dominio y tiene un test que fija
 * su contenido, asi que la interfaz no puede anadir teclas por su cuenta.
 *
 * La referencia visual incluye un `10+`. NO se ha anadido: el conjunto de
 * valores permitidos es una regla deportiva de esta edicion y cambiarlo no
 * estaba pedido. Un 10 se mete hoy como raya o lo corrige el administrador, que
 * si tiene margen hasta 20.
 *
 * ---------------------------------------------------------------------------
 * Distribucion
 * ---------------------------------------------------------------------------
 * 3 x 3 para las cifras, y una fila de acciones separada por una linea: raya y,
 * cuando el hoyo ya tiene resultado, borrar. La separacion no es estetica: sin
 * ella, buscar el 9 con el pulgar y darle a "borrar" es cuestion de tiempo.
 *
 * El boton de borrar solo aparece si se pasa `onClear`. Asi el teclado sigue
 * siendo el mismo de siempre —diez teclas— en un hoyo todavia sin apuntar.
 */

'use client';

import { PLAYER_KEYPAD, type ConfirmationSummary } from '@/lib/scorecard/session';
import { IconTrash } from '@/components/ui/icons';

export interface KeypadProps {
  /** Valor ya seleccionado, para marcarlo. */
  selected?: number | 'PICKUP' | null;
  disabled?: boolean;
  onSelect?: (value: number | 'PICKUP') => void;
  /** Puntos que produciria cada resultado numerico en este hoyo. */
  pointsByValue?: Partial<Record<number, number>>;
  /**
   * Borrar el resultado del hoyo. Cuando no se pasa, el boton no existe: un
   * hoyo sin resultado no tiene nada que borrar.
   */
  onClear?: () => void;
}

export function Keypad({
  selected = null,
  disabled = false,
  onSelect,
  onClear,
  pointsByValue,
}: KeypadProps) {
  const numbers = PLAYER_KEYPAD.filter((value): value is number => value !== 'PICKUP');
  const hasPickup = PLAYER_KEYPAD.includes('PICKUP');

  return (
    <div className="score-keypad" role="group" aria-label="Golpes en el hoyo">
      {numbers.map((value) => {
        const points = pointsByValue?.[value] ?? 0;
        const hasPointPreview = pointsByValue !== undefined;
        const selectedWithPoints = selected === value && points > 0;
        const classes = [
          'score-keypad__key',
          selected === value ? 'score-keypad__key--selected' : '',
          selectedWithPoints ? 'score-keypad__key--scoring' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={String(value)}
            type="button"
            className={classes}
            aria-label={
              hasPointPreview
                ? points > 0
                  ? `${value} golpes, ${points} ${points === 1 ? 'punto' : 'puntos'} Stableford`
                  : `${value} golpes, 0 puntos Stableford`
                : `${value} golpes`
            }
            aria-pressed={selected === value}
            disabled={disabled}
            onClick={onSelect ? () => onSelect(value) : undefined}
          >
            <span className="score-keypad__number">{value}</span>
            {selectedWithPoints ? (
              <span className="score-keypad__points-earned" aria-hidden="true">
                {points} {points === 1 ? 'pt' : 'pts'}
              </span>
            ) : null}
          </button>
        );
      })}

      <div className="score-keypad__actions">
        {hasPickup ? (
          <button
            type="button"
            className={`score-keypad__key score-keypad__key--pickup${selected === 'PICKUP' ? ' score-keypad__key--selected' : ''}`}
            aria-label="Raya, levantar la bola"
            aria-pressed={selected === 'PICKUP'}
            disabled={disabled}
            onClick={onSelect ? () => onSelect('PICKUP') : undefined}
          >
            {'\u2014'}
          </button>
        ) : null}

        {onClear ? (
          <button
            type="button"
            className="score-keypad__key score-keypad__key--clear"
            aria-label="Borrar el resultado de este hoyo"
            disabled={disabled}
            onClick={onClear}
          >
            <IconTrash size={18} />
            <span>Borrar resultado</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface ConfirmationSheetProps {
  summary: ConfirmationSummary;
  /** El jugador ya ha marcado la casilla del resultado poco habitual. */
  extraConfirmed?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  onToggleExtra?: (checked: boolean) => void;
  /** Texto del boton principal cuando la accion no es confirmar un resultado. */
  confirmLabel?: string;
  /** Bloquea las acciones mientras el servidor guarda el resultado. */
  disabled?: boolean;
}

/**
 * Resumen previo obligatorio: hoyo, par, stroke index, distancia, golpes
 * recibidos, golpes introducidos, bruto, neto y puntos. Todo antes de tocar
 * "Confirmar resultado".
 *
 * Superficie solida y a tamano de hoja inferior, no un modal diminuto: en movil
 * un dialogo pequeno obliga a leer siete cifras en un area donde no caben.
 *
 * Un resultado poco habitual (hoyo en uno, eagle, un 8 en un par 3) pide una
 * casilla extra, pero **nunca bloquea** un resultado valido: la seccion 44 es
 * explicita. Si alguien mete un hoyo en uno de verdad, tiene que poder
 * apuntarlo.
 */
export function ConfirmationSheet({
  summary,
  extraConfirmed = false,
  onConfirm,
  onCancel,
  onToggleExtra,
  confirmLabel = 'Confirmar resultado',
  disabled = false,
}: ConfirmationSheetProps) {
  const blocked = disabled || (summary.requiresExtraConfirmation && !extraConfirmed);

  return (
    <div className="sheet-overlay" role="presentation">
      <div
        className="confirmation"
        role="dialog"
        aria-modal="true"
        aria-label={`Confirmar el hoyo ${summary.holeNumber}`}
      >
        <span className="sheet__handle" aria-hidden="true" />
        <p className="sheet__eyebrow">Revisa antes de guardar</p>
        <h2 className="confirmation__title">Hoyo {summary.holeNumber}</h2>

        <dl className="confirmation__grid">
          <div>
            <dt>Par</dt>
            <dd>{summary.par}</dd>
          </div>
          <div>
            <dt>Stroke index</dt>
            <dd>{summary.strokeIndex}</dd>
          </div>
          <div>
            <dt>Distancia</dt>
            <dd>{summary.distance} m</dd>
          </div>
          <div>
            <dt>Golpes recibidos</dt>
            <dd aria-label={summary.strokesReceivedLabel}>{summary.strokesReceived}</dd>
          </div>
          <div>
            <dt>Golpes</dt>
            <dd>{summary.grossLabel}</dd>
          </div>
          <div>
            <dt>Neto</dt>
            <dd>{summary.netStrokes === null ? '\u2014' : summary.netStrokes}</dd>
          </div>
          <div className={`confirmation__points${summary.stablefordPoints > 0 ? ' confirmation__points--positive' : ''}`}>
            <dt>Puntos Stableford</dt>
            <dd>{summary.stablefordPoints}</dd>
          </div>
        </dl>

        {summary.requiresExtraConfirmation ? (
          <div className="confirmation__extra alert" role="alert">
            <p>{summary.extraConfirmationMessage}</p>
            <label>
              <input
                type="checkbox"
                checked={extraConfirmed}
                onChange={
                  onToggleExtra ? (event) => onToggleExtra(event.target.checked) : undefined
                }
              />
              Lo confirmo
            </label>
          </div>
        ) : null}

        <div className="confirmation__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={disabled}
            onClick={onCancel}
          >
            Volver
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={blocked}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
