'use server';

import { redirect } from 'next/navigation';

import { login, logout } from '../auth/server';

export async function loginAction(
  _previous: { error: string | null } | null,
  formData: FormData,
): Promise<{ error: string | null }> {
  const userId = String(formData.get('userId') ?? '');
  const password = String(formData.get('password') ?? '');
  const returnTo = String(formData.get('returnTo') ?? '/tarjeta');

  if (userId === '') return { error: 'Elige tu nombre en la lista.' };
  if (password === '') return { error: 'Escribe tu contrasena.' };

  const result = await login(userId, password);
  if (!result.ok) return { error: result.message };

  redirect(returnTo.startsWith('/') ? returnTo : '/tarjeta');
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect('/login');
}
