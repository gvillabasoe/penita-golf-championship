'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { resetPlayerPassword, setPlayerActive } from '@/lib/actions/admin';
import { Alert, FormField } from '@/components/ui';

interface PlayerAccessPanelProps {
  competitionPlayerId: string;
  displayName: string;
  isActive: boolean;
  userRole: 'PLAYER' | 'ADMIN';
}

/** Gestion de acceso y participacion dentro de la ficha del jugador. */
export function PlayerAccessPanel({
  competitionPlayerId,
  displayName,
  isActive,
  userRole,
}: PlayerAccessPanelProps) {
  const router = useRouter();
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
                ? 'Dejará de competir y saldrá de su partido y pareja, pero conservará el acceso administrativo. Sus tarjetas no se borran.'
                : 'Dejará de aparecer en el acceso, su partido, su pareja y las clasificaciones. Sus tarjetas no se borran.'
              : 'Volverá a aparecer entre los participantes. Tendrás que asignarle de nuevo partido y pareja.'}
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
