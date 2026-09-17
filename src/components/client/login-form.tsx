'use client';

import { useActionState, useState } from 'react';

import { loginAction } from '@/lib/actions/auth';
import type { SearchableUser } from '@/lib/auth/normalize';
import { PlayerSelect } from './player-select';

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
    <form action={action} className="card stack">
      <PlayerSelect players={players} />

      <div className="field">
        <label htmlFor="password">Contrasena</label>
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
            className="button button--secondary"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? 'Ocultar' : 'Ver'}
          </button>
        </div>
      </div>

      <input type="hidden" name="returnTo" value={returnTo} />

      {state?.error ? (
        <p className="alert" role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="button button--primary" disabled={pending}>
        {pending ? 'Entrando...' : 'Iniciar sesion'}
      </button>
    </form>
  );
}
