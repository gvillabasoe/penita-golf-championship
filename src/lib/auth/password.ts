/**
 * Hash de contrasenas.
 *
 * DESVIACION DOCUMENTADA respecto a la seccion 15 del pliego, que pide Argon2id
 * o bcrypt. El entorno donde se genero esta etapa no tiene acceso a red, asi que
 * no se puede instalar ni verificar una dependencia nativa. Escribir codigo que
 * dependa de `@node-rs/argon2` sin haberlo ejecutado una sola vez seria
 * exactamente el tipo de entrega que el pliego prohibe.
 *
 * Solucion: un registro de algoritmos con formato de hash versionado.
 *
 *   - `scrypt` (implementado y probado): KDF memory-hard de la misma familia que
 *     Argon2, incluida en el runtime de Node. Funciona en Vercel sin compilacion
 *     nativa. Parametros N=2^15, r=8, p=1 (~32 MiB por hash).
 *   - `argon2id` (adaptador listo, requiere la dependencia): se activa en cuanto
 *     `@node-rs/argon2` este instalado.
 *
 * La migracion es transparente: `verify()` reconoce el algoritmo por el prefijo
 * del hash, y `needsRehash()` indica cuando reescribir el hash con el algoritmo
 * preferido tras un login correcto. Ningun jugador tiene que cambiar nada.
 *
 * Invariantes que este modulo garantiza:
 *   - Nunca devuelve el hash al cliente.
 *   - La comparacion es de tiempo constante.
 *   - Una contrasena vacia nunca valida.
 *   - Un hash corrupto o desconocido falla en vez de lanzar.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export type HashAlgorithm = 'scrypt' | 'argon2id';

/** Algoritmo preferido. Cambiar a 'argon2id' cuando la dependencia este instalada. */
export const PREFERRED_ALGORITHM: HashAlgorithm = 'scrypt';

const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, keyLength: 32, saltLength: 16 } as const;

export const MIN_PASSWORD_LENGTH = 8;

export class PasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordError';
  }
}

function assertUsablePassword(password: string): void {
  if (typeof password !== 'string' || password.length === 0) {
    throw new PasswordError('La contrasena no puede estar vacia.');
  }
  if (password.length > 1024) {
    throw new PasswordError('La contrasena es demasiado larga.');
  }
}

/** Hash en formato tipo PHC: $scrypt$N=32768,r=8,p=1$<salt b64>$<hash b64> */
export async function hashPassword(
  password: string,
  algorithm: HashAlgorithm = PREFERRED_ALGORITHM,
): Promise<string> {
  assertUsablePassword(password);

  if (algorithm === 'scrypt') {
    const salt = randomBytes(SCRYPT_PARAMS.saltLength);
    const derived = (await scrypt(password.normalize('NFKC'), salt, SCRYPT_PARAMS.keyLength, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: 256 * 1024 * 1024,
    })) as Buffer;
    const params = `N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`;
    return `$scrypt$${params}$${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  // Adaptador Argon2id. Requiere @node-rs/argon2 instalado.
  const argon2 = await loadArgon2();
  return argon2.hash(password.normalize('NFKC'), {
    algorithm: 2, // Argon2id
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

/** Verificacion en tiempo constante. Nunca lanza por un hash malformado. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length === 0) return false;
  if (typeof storedHash !== 'string' || storedHash.length === 0) return false;

  try {
    if (storedHash.startsWith('$scrypt$')) {
      const parts = storedHash.split('$');
      // ['', 'scrypt', 'N=..,r=..,p=..', salt, hash]
      if (parts.length !== 5) return false;
      const params = Object.fromEntries(
        parts[2].split(',').map((pair) => {
          const [key, value] = pair.split('=');
          return [key, Number(value)];
        }),
      ) as { N: number; r: number; p: number };
      if (!params.N || !params.r || !params.p) return false;

      const salt = Buffer.from(parts[3], 'base64');
      const expected = Buffer.from(parts[4], 'base64');
      if (salt.length === 0 || expected.length === 0) return false;

      const derived = (await scrypt(password.normalize('NFKC'), salt, expected.length, {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: 256 * 1024 * 1024,
      })) as Buffer;

      return derived.length === expected.length && timingSafeEqual(derived, expected);
    }

    if (storedHash.startsWith('$argon2')) {
      const argon2 = await loadArgon2();
      return await argon2.verify(storedHash, password.normalize('NFKC'));
    }

    return false;
  } catch {
    // Hash corrupto, parametros absurdos o dependencia ausente: no valida.
    return false;
  }
}

/** True si el hash usa un algoritmo o parametros distintos de los preferidos. */
export function needsRehash(storedHash: string): boolean {
  if (PREFERRED_ALGORITHM === 'argon2id') return !storedHash.startsWith('$argon2id');
  const expectedPrefix = `$scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$`;
  return !storedHash.startsWith(expectedPrefix);
}

/** Detecta el algoritmo de un hash almacenado, para auditoria de migracion. */
export function detectAlgorithm(storedHash: string): HashAlgorithm | 'unknown' {
  if (storedHash.startsWith('$scrypt$')) return 'scrypt';
  if (storedHash.startsWith('$argon2id$')) return 'argon2id';
  return 'unknown';
}

interface Argon2Module {
  hash(password: string, options: Record<string, number>): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

async function loadArgon2(): Promise<Argon2Module> {
  try {
    // Import dinamico: no rompe el build si la dependencia no esta.
    const moduleName = '@node-rs/argon2';
    const mod = (await import(/* webpackIgnore: true */ moduleName)) as unknown as Argon2Module;
    return mod;
  } catch {
    throw new PasswordError(
      'Argon2id no esta disponible: instala @node-rs/argon2 o usa el algoritmo scrypt.',
    );
  }
}
