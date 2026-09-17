/**
 * Saneado de mensajes de error para el diagnostico.
 *
 * Vive en su propio modulo, sin importar Prisma, por dos motivos:
 *
 *  1. Es una funcion pura y se puede probar sin base de datos. Estaba dentro de
 *     health.ts y el test no podia importarla sin arrastrar el cliente de
 *     Prisma entero.
 *  2. Es la unica defensa de un endpoint publico. Merece estar aislada y tener
 *     sus propios tests.
 *
 * Los mensajes de Prisma pueden llevar la cadena de conexion dentro.
 * `/api/diagnostico` es publico a proposito —se necesita cuando la
 * autenticacion no funciona— asi que su salida tiene que estar limpia.
 */

/** Patrones que nunca deben salir del servidor. */
const REDACTIONS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/[^\s"']+/gi, '[cadena de conexion oculta]'],
  [/\bmysql:\/\/[^\s"']+/gi, '[cadena de conexion oculta]'],
  [/\bpassword\s*=\s*\S+/gi, 'password=[oculto]'],
  [/\bpassword["']?\s*:\s*["'][^"']*["']/gi, 'password:[oculto]'],
  [/\bsslmode=\S+/gi, 'sslmode=[oculto]'],
  // Hash de contrasena, por si algun mensaje lo arrastra.
  [/\$scrypt\$[^\s"']+/g, '[hash oculto]'],
  [/\$argon2[^\s"']+/g, '[hash oculto]'],
];

export const MAX_DETAIL_LENGTH = 300;

/**
 * Deja un mensaje de error apto para devolver por HTTP.
 *
 * Nunca lanza, con cualquier entrada.
 */
export function sanitizeErrorDetail(error: unknown): string {
  let message: string;
  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string') message = error;
  else {
    try {
      message = JSON.stringify(error) ?? String(error);
    } catch {
      message = 'error no serializable';
    }
  }

  for (const [pattern, replacement] of REDACTIONS) {
    message = message.replace(pattern, replacement);
  }

  return message.replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_LENGTH);
}

/** Codigo de error de Prisma, si el error lo trae. Es seguro: no lleva datos. */
export function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
}
