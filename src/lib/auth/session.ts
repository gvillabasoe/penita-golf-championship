/**
 * Sesiones en servidor (seccion 13 y 66).
 *
 * Reglas que este modulo hace cumplir:
 *   - La cookie lleva SOLO un token opaco. Nunca el rol, nunca el id de usuario,
 *     nunca nada que el cliente pueda alterar para escalar privilegios.
 *   - En base de datos se guarda el SHA-256 del token, no el token. Un volcado de
 *     la tabla de sesiones no permite suplantar a nadie.
 *   - Cada sesion guarda el `sessionEpoch` del usuario en el momento de crearse.
 *     Al restablecer una contrasena se incrementa el epoch del usuario y todas
 *     las sesiones antiguas dejan de valer de golpe, en cualquier dispositivo.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TTL_HOURS = 36; // cubre una jornada de torneo y su sobremesa
export const SESSION_IDLE_REFRESH_MINUTES = 30;

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  sessionEpoch: number;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
}

export interface SessionUser {
  id: string;
  role: 'PLAYER' | 'ADMIN';
  isActive: boolean;
  sessionEpoch: number;
}

/** Token opaco para la cookie. 256 bits de entropia, base64url sin relleno. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/** Lo unico que se persiste. Determinista, para poder buscar por indice unico. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Comparacion de tiempo constante entre dos hashes hexadecimales. */
export function tokenHashesMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function sessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
}

export type SessionValidation =
  | { valid: true; userId: string; role: 'PLAYER' | 'ADMIN'; shouldRefreshLastSeen: boolean }
  | { valid: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' | 'STALE_EPOCH' | 'USER_INACTIVE' };

/**
 * Valida una sesion. Funcion pura: recibe lo leido de la base de datos y decide.
 * Asi se puede probar cada motivo de rechazo sin levantar una base de datos.
 */
export function validateSession(
  session: SessionRecord | null,
  user: SessionUser | null,
  now: Date = new Date(),
): SessionValidation {
  if (!session || !user) return { valid: false, reason: 'NOT_FOUND' };
  if (session.revokedAt !== null) return { valid: false, reason: 'REVOKED' };
  if (session.expiresAt.getTime() <= now.getTime()) return { valid: false, reason: 'EXPIRED' };
  if (session.userId !== user.id) return { valid: false, reason: 'NOT_FOUND' };
  if (session.sessionEpoch !== user.sessionEpoch) {
    return { valid: false, reason: 'STALE_EPOCH' };
  }
  if (!user.isActive) return { valid: false, reason: 'USER_INACTIVE' };

  const idleMs = now.getTime() - session.lastSeenAt.getTime();
  return {
    valid: true,
    userId: user.id,
    role: user.role,
    shouldRefreshLastSeen: idleMs > SESSION_IDLE_REFRESH_MINUTES * 60 * 1000,
  };
}

export interface CookieOptions {
  name: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

export const SESSION_COOKIE_NAME = 'pgc_session';

/**
 * `sameSite: 'lax'` y no 'strict' a proposito: con 'strict' el jugador que abre
 * la app desde un enlace de WhatsApp en medio de la vuelta aparece desconectado.
 * 'lax' sigue bloqueando el envio en peticiones POST entre sitios.
 */
export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  };
}

/** Cookie de borrado para el cierre de sesion real. */
export function clearedCookieOptions(isProduction: boolean): CookieOptions {
  return { ...sessionCookieOptions(isProduction), maxAge: 0 };
}
