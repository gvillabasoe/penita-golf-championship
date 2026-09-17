/**
 * Nombre y opciones de la cookie de sesion.
 *
 * ---------------------------------------------------------------------------
 * Por que esto vive aparte de session.ts
 * ---------------------------------------------------------------------------
 * El middleware de Next corre en el runtime EDGE, donde webpack no sabe
 * resolver los modulos de Node. `session.ts` importa `node:crypto` para generar
 * y comparar tokens, asi que importar cualquier cosa de ahi desde el middleware
 * rompe el build:
 *
 *   UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
 *
 * El middleware solo necesita saber COMO SE LLAMA la cookie, para comprobar si
 * existe. Ese dato no necesita criptografia, y por eso esta en un modulo sin
 * ninguna dependencia de Node.
 *
 * Hay un test que recorre el grafo de importaciones desde `src/middleware.ts` y
 * falla si vuelve a aparecer un `node:` por el camino.
 */

export const SESSION_COOKIE_NAME = 'pgc_session';

/** Cubre una jornada de torneo y su sobremesa. */
export const SESSION_TTL_HOURS = 36;

export interface CookieOptions {
  name: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

/**
 * `sameSite: 'lax'` y no 'strict' a proposito: con 'strict' el jugador que abre
 * la app desde un enlace de WhatsApp en medio de la vuelta aparece
 * desconectado. 'lax' sigue bloqueando el envio en peticiones POST entre sitios.
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
