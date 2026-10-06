'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { createPlayer } from '@/lib/actions/admin';
import { MIN_NEW_PLAYER_PASSWORD_LENGTH, type NewPlayerField } from '@/lib/admin/players';
import { AdminSection, Alert, FormField } from '@/components/ui';

const EMPTY = { firstName: '', lastName: '', password: '', handicap: '' };

/**
 * Alta de un jugador nuevo.
 *
 * El color no se elige aqui: se asigna al azar al guardar, de la misma paleta
 * que el resto, y se muestra en el mensaje de confirmacion.
 */
export function CreatePlayerForm() {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<NewPlayerField, string>>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; color?: string } | null>(
    null,
  );

  function update(field: keyof typeof EMPTY, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function save() {
    setBusy(true);
    setFeedback(null);
    const result = await createPlayer(values);
    setBusy(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setFeedback({ ok: false, text: result.error });
      return;
    }

    setFieldErrors({});
    setValues(EMPTY);
    setShowPassword(false);
    setFeedback({ ok: true, text: result.message, color: result.color });
    router.refresh();
  }

  return (
    <AdminSection
      title="Añadir jugador"
      description="Por si al final sois más. Con la contraseña que pongas aquí podrá entrar en la app."
    >
      <div className="stack">
        <FormField id="nuevo-nombre" label="Nombre" error={fieldErrors.firstName}>
          <input
            id="nuevo-nombre"
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            value={values.firstName}
            onChange={(event) => update('firstName', event.target.value)}
            aria-invalid={fieldErrors.firstName ? true : undefined}
          />
        </FormField>

        <FormField id="nuevo-apellidos" label="Apellidos" error={fieldErrors.lastName}>
          <input
            id="nuevo-apellidos"
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            value={values.lastName}
            onChange={(event) => update('lastName', event.target.value)}
            aria-invalid={fieldErrors.lastName ? true : undefined}
          />
        </FormField>

        <FormField
          id="nuevo-contrasena"
          label="Contraseña"
          help={`Mínimo ${MIN_NEW_PLAYER_PASSWORD_LENGTH} caracteres. Pásasela al jugador por privado.`}
          error={fieldErrors.password}
        >
          <div className="password-row">
            <input
              id="nuevo-contrasena"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => update('password', event.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
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
        </FormField>

        <FormField
          id="nuevo-hcp"
          label="Hándicap exacto"
          numeric
          help="Con coma o con punto. Si aún no lo sabes, déjalo vacío y fíjalo después en su ficha."
          error={fieldErrors.handicap}
        >
          <input
            id="nuevo-hcp"
            type="text"
            inputMode="decimal"
            placeholder="18,4"
            value={values.handicap}
            onChange={(event) => update('handicap', event.target.value)}
            aria-invalid={fieldErrors.handicap ? true : undefined}
          />
        </FormField>

        <button type="button" className="button button--primary" disabled={busy} onClick={save}>
          {busy ? 'Guardando...' : 'Guardar jugador'}
        </button>

        {feedback ? (
          <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>
            {feedback.ok && feedback.color ? (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  verticalAlign: 'middle',
                  marginRight: 6,
                  backgroundColor: feedback.color,
                }}
              />
            ) : null}
            {feedback.text}
          </Alert>
        ) : null}
      </div>
    </AdminSection>
  );
}
