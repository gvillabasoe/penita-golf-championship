/**
 * Sesiones en el servidor.
 *
 * Toda la logica de decision esta en `session.ts`, `password.ts` y
 * `rate-limit.ts`, que son funciones puras con tests. Aqui solo se conectan con
 * Prisma y con las cookies de Next.
 */

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '../db';
import { checkRateLimit, loginErrorMessage } from './rate-limit';
import { hashPassword, needsRehash, verifyPassword } from './password';
import {
  SESSION_COOKIE_NAME,
  clearedCookieOptions,
  generateSessionToken,
  hashSessionToken,
  sessionCookieOptions,
  sessionExpiry,
  validateSession,
} from './session';

const isProduction = process.env.NODE_ENV === 'production';

export interface CurrentUser {
  userId: string;
  role: 'PLAYER' | 'ADMIN';
  displayName: string;
  competitionPlayerId: string | null;
  flightId: string | null;
}

/** Devuelve el usuario de la sesion, o null. Nunca lanza. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          competitionPlayers: {
            include: { flightMember: { select: { flightId: true } } },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });

  if (!session) return null;

  const check = validateSession(
    {
      id: session.id,
      userId: session.userId,
      tokenHash: session.tokenHash,
      sessionEpoch: session.sessionEpoch,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      lastSeenAt: session.lastSeenAt,
    },
    {
      id: session.user.id,
      role: session.user.role,
      isActive: session.user.isActive,
      sessionEpoch: session.user.sessionEpoch,
    },
  );

  if (!check.valid) return null;

  if (check.shouldRefreshLastSeen) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  const player = session.user.competitionPlayers[0];

  return {
    userId: session.user.id,
    role: session.user.role,
    displayName: session.user.displayName,
    competitionPlayerId: player?.id ?? null,
    flightId: player?.flightMember?.flightId ?? null,
  };
}

/** Exige sesion. Redirige al login si no hay. */
export async function requireSession(returnTo = '/tarjeta'): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return user;
}

/**
 * Exige administrador.
 *
 * Responde 404, no 403: un 403 confirmaria que la ruta existe. Es la segunda
 * capa de la proteccion, y la unica que de verdad comprueba el rol, porque el
 * middleware corre en edge y no puede leer la base de datos.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') notFound();
  return user;
}

async function clientIp(): Promise<string> {
  const store = await headers();
  return (
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    store.get('x-real-ip') ??
    'desconocida'
  );
}

export type LoginResult = { ok: true } | { ok: false; message: string };

/** Inicio de sesion con limite de intentos por jugador y por IP. */
export async function login(userId: string, password: string): Promise<LoginResult> {
  const ip = await clientIp();
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);

  const [identifierAttempts, ipAttempts] = await Promise.all([
    prisma.loginAttempt.findMany({
      where: { identifier: userId, createdAt: { gte: windowStart } },
      select: { identifier: true, succeeded: true, createdAt: true },
    }),
    prisma.loginAttempt.findMany({
      where: { identifier: `ip:${ip}`, createdAt: { gte: windowStart } },
      select: { identifier: true, succeeded: true, createdAt: true },
    }),
  ]);

  const decision = checkRateLimit({ identifierAttempts, ipAttempts });
  if (!decision.allowed) {
    return { ok: false, message: loginErrorMessage(decision) };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const passwordOk =
    user !== null && user.isActive && (await verifyPassword(password, user.passwordHash));

  await prisma.loginAttempt.createMany({
    data: [
      { identifier: userId, succeeded: passwordOk },
      { identifier: `ip:${ip}`, succeeded: passwordOk },
    ],
  });

  if (!user || !passwordOk) {
    // El mismo mensaje exista el jugador o no: lo contrario enumeraria la lista.
    return { ok: false, message: loginErrorMessage(decision) };
  }

  // Migracion transparente del algoritmo de hash tras un login correcto.
  if (needsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password) },
    });
  }

  const token = generateSessionToken();
  const expiresAt = sessionExpiry();

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      sessionEpoch: user.sessionEpoch,
      expiresAt,
    },
  });

  const options = sessionCookieOptions(isProduction);
  (await cookies()).set(options.name, token, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });

  return { ok: true };
}

/** Cierre de sesion real: revoca en servidor y borra la cookie. */
export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const cleared = clearedCookieOptions(isProduction);
  store.set(cleared.name, '', {
    httpOnly: cleared.httpOnly,
    secure: cleared.secure,
    sameSite: cleared.sameSite,
    path: cleared.path,
    maxAge: 0,
  });
}
