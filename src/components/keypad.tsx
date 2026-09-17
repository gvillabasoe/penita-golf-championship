/**
 * Teclado de resultados y hoja de confirmacion (seccion 36).
 *
 * El teclado tiene exactamente 1 a 9 y raya. Nada mas: ni ceros, ni dieces, ni
 * flechas de incremento. La lista sale de `PLAYER_KEYPAD`, que esta en el
 * dominio y tiene un test que fija su contenido, asi que la interfaz no puede
 * anadir teclas por su cuenta.
 *
 * Areas tactiles de 44 px como minimo, fondo opaco y una sola columna.
 */

'use client';

import { PLAYER_KEYPAD, type ConfirmationSummary } from '@/lib/scorecard/session';

export interface KeypadProps {
  /** Valor ya seleccionado, para marcarlo. */
  selected?: number | 'PICKUP' | null;
  disabled?: boolean;
  onSelect?: (value: number | 'PICKUP') => void;
}

export function Keypad({ selected = null, disabled = false, onSelect }: KeypadProps) {
  return (
    <div className="score-keypad solid" role="group" aria-label="Golpes en el hoyo">
      {PLAYER_KEYPAD.map((value) => {
        const isPickup = value === 'PICKUP';
        const label = isPickup ? 'Raya, levantar la bola' : `${value} golpes`;

        return (
          <button
            key={String(value)}
            type="button"
            className={`score-keypad__key${isPickup ? ' score-keypad__key--pickup' : ''}${selected === value ? ' score-keypad__key--selected' : ''}`}
            aria-label={label}
            aria-pressed={selected === value}
            disabled={disabled}
            onClick={onSelect ? () => onSelect(value) : undefined}
          >
            {isPickup ? '\u2014' : value}
          </button>
        );
      })}
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
}

/**
 * Resumen previo obligatorio: hoyo, par, golpes recibidos, golpes introducidos,
 * bruto, neto y puntos. Todo antes de tocar "Confirmar resultado".
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
}: ConfirmationSheetProps) {
  const blocked = summary.requiresExtraConfirmation && !extraConfirmed;

  return (
    <div
      className="confirmation solid"
      role="dialog"
      aria-modal="true"
      aria-label={`Confirmar el hoyo ${summary.holeNumber}`}
    >
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
        <div className="confirmation__points">
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
              onChange={onToggleExtra ? (event) => onToggleExtra(event.target.checked) : undefined}
            />
            Lo confirmo
          </label>
        </div>
      ) : null}

      <div className="confirmation__actions">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Volver
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={blocked}
          onClick={onConfirm}
        >
          Confirmar resultado
        </button>
      </div>
    </div>
  );
}
