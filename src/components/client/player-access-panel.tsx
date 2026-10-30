'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  resetPlayerPassword,
  setPlayerActive,
  setPlayerKnowsCourse,
} from '@/lib/actions/admin';
import { Alert, FormField, StatusBadge } from '@/components/ui';

interface PlayerAccessPanelProps {
  competitionPlayerId: string;
  displayName: string;
  isActive: boolean;
  userRole: 'PLAYER' | 'ADMIN';
  knowsCourse: boolean;
}

/** Gestion de configuracion, acceso y participacion dentro de la ficha. */
export function PlayerAccessPanel({
  competitionPlayerId,
  displayName,
  isActive,
  userRole,
  knowsCourse,
}: PlayerAccessPanelProps) {
  const router = useRouter();
  const [courseKnowledge, setCourseKnowledge] = useState(knowsCourse);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function savePassword() {
    setBusy(true);
    setFeedback(null);
    const result = await resetPlayerPassword({
      competitionPlayerId,
      password,
      confirmation,
    });
    setBusy(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setFeedback({ ok: false, text: result.error });
      return;
    }

    setErrors({});
    setPassword('');
    setConfirmation('');
    setShowPassword(false);
    setPasswordOpen(false);
    setFeedback({ ok: true, text: result.message });
    router.refresh();
  }

  async function changeCourseKnowledge(next: boolean) {
    const previous = courseKnowledge;
    setCourseKnowledge(next);
    setBusy(true);
    setFeedback(null);
    const result = await setPlayerKnowsCourse(competitionPlayerId, next);
    setBusy(false);

    if (!result.ok) {
      setCourseKnowledge(previous);
      setFeedback({ ok: false, text: result.error });
      return;
    }

    setFeedback({ ok: true, text: result.message ?? 'Conocimiento del campo actualizado.' });
    router.refresh();
  }

  async function changeStatus() {
    setBusy(true);
    setFeedback(null);
    const result = await setPlayerActive(competitionPlayerId, !isActive);
    setBusy(false);

    if (!result.ok) {
      setFeedback({ ok: false, text: result.error });
      return;
    }

    setConfirmingStatus(false);
    setFeedback({ ok: true, text: result.message ?? 'Estado actualizado.' });
    router.refresh();
  }

  return (
    <div className="player-access stack">
      <label className="course-knowledge-toggle" htmlFor={`knows-course-${competitionPlayerId}`}>
        <span className="course-knowledge-toggle__copy">
          <strong>Conoce el campo</strong>
          <small>Se utiliza para distribuir guías entre los partidos.</small>
        </span>
        <span className="course-knowledge-toggle__control">
          <StatusBadge tone={courseKnowledge ? 'green' : 'neutral'}>
            {courseKnowledge ? 'Sí' : 'No'}
          </StatusBadge>
          <input
            id={`knows-course-${competitionPlayerId}`}
            type="checkbox"
            checked={courseKnowledge}
            disabled={busy}
            onChange={(event) => void changeCourseKnowledge(event.target.checked)}
          />
        </span>
      </label>

      <div className="button-row">
        <button
          type="button"
          className="button button--secondary"
          disabled={busy}
          aria-expanded={passwordOpen}
          onClick={() => {
            setPasswordOpen((open) => !open);
            setConfirmingStatus(false);
            setFeedback(null);
          }}
        >
          Cambiar contraseña
        </button>

        <button
          type="button"
          className={`button ${isActive ? 'button--danger' : 'button--primary'}`}
          disabled={busy}
          aria-expanded={confirmingStatus}
          onClick={() => {
            setConfirmingStatus(true);
            setPasswordOpen(false);
            setFeedback(null);
          }}
        >
          {isActive ? 'Dar de baja' : 'Reactivar jugador'}
        </button>
      </div>

      {passwordOpen ? (
        <div className="sheet" role="group" aria-label={`Cambiar contraseña de ${displayName}`}>
          <p className="sheet__title">Nueva contraseña</p>
          <p className="muted">
            Se cerrarán todas las sesiones abiertas de {displayName}. Comunícasela por privado.
          </p>

          <FormField
            id={`password-${competitionPlayerId}`}
            label="Nueva contraseña"
            help="Mínimo 6 caracteres."
            error={errors.password}
          >
            <div className="password-row">
              <input
                id={`password-${competitionPlayerId}`}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
                }}
                aria-invalid={errors.password ? true : undefined}
              />
              <button
                type="button"
                className="button button--secondary"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </FormField>

          <FormField
            id={`password-confirm-${competitionPlayerId}`}
            label="Repetir contraseña"
            error={errors.confirmation}
          >
            <input
              id={`password-confirm-${competitionPlayerId}`}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                if (errors.confirmation) {
                  setErrors((current) => ({ ...current, confirmation: undefined }));
                }
              }}
              aria-invalid={errors.confirmation ? true : undefined}
            />
          </FormField>

          <div className="button-row--split">
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => {
                setPasswordOpen(false);
                setPassword('');
                setConfirmation('');
                setErrors({});
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={savePassword}
            >
              {busy ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </div>
        </div>
      ) : null}

      {confirmingStatus ? (
        <div
          className={`sheet${isActive ? ' sheet--danger' : ''}`}
          role="group"
          aria-label={isActive ? `Dar de baja a ${displayName}` : `Reactivar a ${displayName}`}
        >
          <p className="sheet__title">
            {isActive ? `¿Dar de baja a ${displayName}?` : `¿Reactivar a ${displayName}?`}
          </p>
          <p className="muted">
            {isActive
              ? userRole === 'ADMIN'
                ? 'Dejará de competir, pero conservará el acceso administrativo. Sus tarjetas no se borran. Los partidos y parejas deberán volver a sortearse.'
                : 'Dejará de aparecer en el acceso y en las clasificaciones. Sus tarjetas no se borran. Los partidos y parejas deberán volver a sortearse.'
              : 'Volverá a aparecer entre los participantes. Después tendrás que volver a sortear y confirmar los partidos.'}
          </p>
          <div className="button-row--split">
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setConfirmingStatus(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={`button ${isActive ? 'button--danger' : 'button--primary'}`}
              disabled={busy}
              onClick={changeStatus}
            >
              {busy ? 'Guardando...' : isActive ? 'Confirmar baja' : 'Confirmar reactivación'}
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </Alert>
      ) : null}
    </div>
  );
}
