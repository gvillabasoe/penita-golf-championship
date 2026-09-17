/**
 * Cliente de Prisma.
 *
 * Singleton guardado en `globalThis` para que el hot reload de desarrollo no
 * abra una conexion nueva en cada recarga y agote el pool de Neon.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Prepara un valor para un campo `Json` de Prisma.
 *
 * Los modulos del dominio devuelven `unknown` en `beforeData` y `afterData`
 * porque no deben saber nada de Prisma. Este paso los convierte en algo que el
 * cliente acepta, y `undefined` cuando no hay nada, que es lo que Prisma
 * interpreta como "no escribas este campo".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toJson(value: unknown): any {
  if (value === null || value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
