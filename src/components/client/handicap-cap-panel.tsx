'use client';

/**
 * Panel "Limitar HCP" (seccion 5).
 *
 * Vive dentro de "Campo y modalidad", junto al resto de la configuracion de
 * hándicap. No es una pestana nueva: el limite es un parametro de calculo mas, y
 * sacarlo a su propio sitio lo separaria de las reglas con las que se usa.
 *
 * Tres estados: sin limite, editando y con limite puesto. La accion de quitarlo
 * es explicita y separada, no "guardar con el campo vacio": dejar en blanco un
 * numero es demasiado facil de hacer sin querer para algo que devuelve golpes a
 * media docena de jugadores.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { removeHandicapCap, setHandicapCap } from '@/lib/actions/admin';
import { AdminSection, Alert, FormField, StatusBadge } from '@/components/ui';
import { IconCap } from '@/components/ui/icons';
import { CAP_EXPLANATION, CAP_RECALCULATION_WARNING } from '@/lib/golf/handicap-cap';

export interface HandicapCapPanelProps {
  /** Limite actual ya formateado ("26,4"), o null si no hay. */
  currentLabel: string | null;
  /** Jugadores cuyo hándicap exacto supera el limite actual. */
  cappedPlayers: number;
  /** Hay resultados escritos: cambiar el limite mueve puntos y clasificacion. */
  hasScores: boolean;
  /** Con el campeonato cerrado el limite no se puede tocar. */
  disabled?: boolean;
}

export function HandicapCapPanel({
  currentLabel,
  cappedPlayers,
  hasScores,
  disabled = false,
}: HandicapCapPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentLabel ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await setHandicapCap(value);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? 'Limite guardado.');
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await removeHandicapCap();
    setBusy(false);
    setConfirmingRemoval(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.message ?? 'Limite retirado.');
    setValue('');
    router.refresh();
  }

  return (
    <AdminSection
      title="Limite de hándicap"
      description={CAP_EXPLANATION}
      ariaLabel="Limite de hándicap"
      action={
        currentLabel !== null ? (
          <StatusBadge tone="gold">Limite {currentLabel}</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Sin limite</StatusBadge>
        )
      }
    >

      {currentLabel !== null ? (
        <p className="muted">
          {cappedPlayers === 0
            ? 'Ningun jugador supera el limite ahora mismo, asi que no cambia ningun calculo.'
            : `${cappedPlayers} jugador(es) compiten con el valor limitado. Su hándicap exacto se conserva y sigue decidiendo el desempate.`}
        </p>
      ) : null}

      {message ? (
        <Alert tone="success" role="status">
          {message}
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {!open ? (
        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            disabled={disabled || busy}
            onClick={() => {
              setOpen(true);
              setMessage(null);
              setError(null);
            }}
          >
            <IconCap size={18} />
            {currentLabel === null ? 'Limitar HCP' : 'Editar limite'}
          </button>

          {currentLabel !== null ? (
            <button
              type="button"
              className="button button--secondary"
              disabled={disabled || busy}
              onClick={() => setConfirmingRemoval(true)}
            >
              Quitar limite de HCP
            </button>
          ) : null}
        </div>
      ) : (
        <div className="sheet" role="group" aria-label="Limitar hándicap">
          <p className="sheet__title">Limitar hándicap</p>

          <FormField
            id="hcp-cap"
            label="Hándicap exacto maximo"
            numeric
            help="Se admite coma o punto: 24, 26,4 o 26.4."
          >
            <input
              id="hcp-cap"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="26,4"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </FormField>

          {hasScores ? (
            <Alert role="status">{CAP_RECALCULATION_WARNING}</Alert>
          ) : null}

          <div className="button-row--split">
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setValue(currentLabel ?? '');
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={busy || value.trim() === ''}
              onClick={save}
            >
              {busy ? 'Guardando...' : 'Guardar limite'}
            </button>
          </div>
        </div>
      )}

      {confirmingRemoval ? (
        <div className="sheet sheet--danger" role="group" aria-label="Quitar el limite de hándicap">
          <p className="sheet__title">¿Quitar el limite de hándicap?</p>
          <p className="muted">
            Los {cappedPlayers} jugador(es) limitados volveran a competir con su hándicap exacto.
            {hasScores ? ` ${CAP_RECALCULATION_WARNING}` : ''}
          </p>
          <div className="button-row--split">
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setConfirmingRemoval(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={remove}
            >
              {busy ? 'Quitando...' : 'Quitar limite'}
            </button>
          </div>
        </div>
      ) : null}
    </AdminSection>
  );
}
