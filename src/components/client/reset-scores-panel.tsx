'use client';

/**
 * Zona de acciones criticas: vaciar los resultados de todas las tarjetas.
 *
 * ---------------------------------------------------------------------------
 * Por que dos confirmaciones y no una
 * ---------------------------------------------------------------------------
 * Porque un "¿seguro?" se pulsa sin leerlo. La primera confirmacion muestra
 * CIFRAS —cuantas tarjetas, cuantos resultados, en que estado esta la
 * clasificacion— y la segunda obliga a escribir VACIAR. Escribir una palabra es
 * la unica barrera que no se supera por inercia.
 *
 * La autorizacion de verdad no esta aqui. Este componente puede ocultarse,
 * saltarse o llamarse desde la consola del navegador: lo que impide el vaciado
 * es `requireAdmin()` mas `authorizeReset()` en el servidor, que vuelven a
 * comprobar el rol y el texto con la sesion real.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { clearAllScores, previewScoreReset } from '@/lib/actions/admin';
import { Alert } from '@/components/ui';
import { IconAlert, IconTrash } from '@/components/ui/icons';
import {
  RESET_CONFIRMATION_WORD,
  RESET_FIRST_WARNING,
  RESET_IRREVERSIBLE_WARNING,
  isResetConfirmed,
} from '@/lib/admin/reset';

const CLASSIFICATION_LABEL: Record<string, string> = {
  HIDDEN: 'oculta',
  REVEALING: 'en revelacion',
  PUBLISHED: 'publicada',
};

interface Preview {
  affectedCards: number;
  totalCards: number;
  holeScores: number;
  playedHoles: number;
  points: number;
  lockedCards: number;
  reviewedCards: number;
  classificationStatus: string;
  isEmpty: boolean;
}

export function ResetScoresPanel() {
  const router = useRouter();
  const [step, setStep] = useState<'IDLE' | 'PREVIEW' | 'TYPE'>('IDLE');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function openPreview() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const result = await previewScoreReset();
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.preview);
    setStep('PREVIEW');
  }

  async function run() {
    setBusy(true);
    setError(null);

    const result = await clearAllScores(typed);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(result.message ?? 'Resultados vaciados.');
    setStep('IDLE');
    setTyped('');
    setPreview(null);
    router.refresh();
  }

  function cancel() {
    setStep('IDLE');
    setTyped('');
    setError(null);
  }

  return (
    <section className="critical-zone" aria-label="Zona de acciones criticas">
      <p className="critical-zone__title">
        <IconAlert size={16} />
        Zona de acciones criticas
      </p>

      <div className="critical-zone__body">
        <h2>Vaciar resultados de las tarjetas</h2>
        <p className="muted">
          Deja todas las tarjetas del campeonato actual en <strong>Sin comenzar</strong>. Se
          conservan los jugadores, los hándicaps, el limite de hándicap, los partidos, las horas
          de salida y los datos del campo.
        </p>

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

        {step === 'IDLE' ? (
          <div className="button-row">
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={openPreview}
            >
              <IconTrash size={18} />
              {busy ? 'Comprobando...' : 'Vaciar resultados de las tarjetas'}
            </button>
          </div>
        ) : null}

        {/* Primera confirmacion: cifras de lo que se destruye. */}
        {step === 'PREVIEW' && preview !== null ? (
          <div
            className="sheet sheet--danger"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar el vaciado de resultados"
          >
            <p className="sheet__title">Vas a vaciar todos los resultados</p>
            <p>{RESET_FIRST_WARNING}</p>

            <ul className="critical-zone__facts">
              <li>
                Tarjetas afectadas: <strong>{preview.affectedCards}</strong> de{' '}
                {preview.totalCards}
              </li>
              <li>
                Resultados de hoyo que se eliminan: <strong>{preview.holeScores}</strong> (
                {preview.playedHoles} con resultado apuntado)
              </li>
              <li>
                Puntos Stableford que se pierden: <strong>{preview.points}</strong>
              </li>
              <li>
                Tarjetas bloqueadas que se desbloquean: <strong>{preview.lockedCards}</strong>
              </li>
              <li>
                Revisiones que se invalidan: <strong>{preview.reviewedCards}</strong>
              </li>
              <li>
                Clasificacion:{' '}
                <strong>
                  {CLASSIFICATION_LABEL[preview.classificationStatus] ??
                    preview.classificationStatus}
                </strong>{' '}
                → vuelve a oculta
              </li>
            </ul>

            <Alert tone="danger" role="alert">
              {RESET_IRREVERSIBLE_WARNING}
            </Alert>

            {preview.isEmpty ? (
              <Alert role="status">
                No hay nada que vaciar: ninguna tarjeta tiene resultados, bloqueos ni revisiones.
              </Alert>
            ) : null}

            <div className="button-row--split">
              <button type="button" className="button button--secondary" onClick={cancel}>
                Cancelar
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={preview.isEmpty}
                onClick={() => setStep('TYPE')}
              >
                Continuar
              </button>
            </div>
          </div>
        ) : null}

        {/* Segunda confirmacion: escribir la palabra. */}
        {step === 'TYPE' ? (
          <div
            className="sheet sheet--danger"
            role="dialog"
            aria-modal="true"
            aria-label="Escribe VACIAR para confirmar"
          >
            <p className="sheet__title">Escribe {RESET_CONFIRMATION_WORD} para confirmar</p>

            <div className="field field--numeric">
              <label htmlFor="reset-confirm">
                Escribe exactamente {RESET_CONFIRMATION_WORD}
              </label>
              <input
                id="reset-confirm"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
              <p className="field__help">
                El boton sigue deshabilitado hasta que el texto coincida.
              </p>
            </div>

            <div className="button-row--split">
              <button
                type="button"
                className="button button--secondary"
                disabled={busy}
                onClick={cancel}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={busy || !isResetConfirmed(typed)}
                onClick={run}
              >
                <IconTrash size={18} />
                {busy ? 'Vaciando...' : 'Vaciar todos los resultados'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
