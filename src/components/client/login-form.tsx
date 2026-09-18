'use client';

import { useActionState, useState } from 'react';

import { loginAction } from '@/lib/actions/auth';
import type { SearchableUser } from '@/lib/auth/normalize';
import { PlayerSelect } from './player-select';
import { Alert, FormField } from '@/components/ui';

/**
 * Formulario de acceso.
 *
 * Superficie solida y de una sola columna. El campo de contrasena lleva el boton
 * de ver junto al input y no dentro: dentro obliga a un area tactil de 24 px
 * sobre el propio texto, y con el movil al sol eso se falla.
 *
 * `useActionState` es lo que mantiene el mensaje de error despues de que la
 * Server Action vuelva, sin perder lo que el jugador habia escrito.
 */
export function LoginForm({
  players,
  returnTo,
}: {
  players: SearchableUser[];
  returnTo: string;
}) {
  const [state, action, pending] = useActionState(loginAction, { error: null });
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="form-section">
      <div className="form-section__title">
        <h2>Entrar</h2>
        <p className="muted">Busca tu nombre en la lista y escribe tu contrasena.</p>
      </div>

      <PlayerSelect players={players} />

      <FormField id="password" label="Contrasena">
        <div className="password-row">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="button button--secondary button--sm"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? 'Ocultar' : 'Ver'}
          </button>
        </div>
      </FormField>

      <input type="hidden" name="returnTo" value={returnTo} />

      {state?.error ? (
        <Alert tone="danger" role="alert">
          {state.error}
        </Alert>
      ) : null}

      <button type="submit" className="button button--primary button--lg button--block" disabled={pending}>
        {pending ? 'Entrando...' : 'Iniciar sesion'}
      </button>
    </form>
  );
}
