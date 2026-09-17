/**
 * Limitacion de intentos de login (seccion 66).
 *
 * Funcion pura sobre los intentos leidos de la base de datos: sin estado en
 * memoria, porque en Vercel cada peticion puede caer en una instancia distinta y
 * un contador en memoria no limita nada.
 *
 * Dos ventanas a la vez:
 *   - Por jugador: 5 fallos en 15 minutos -> bloqueo de 15 minutos.
 *   - Por IP: 30 fallos en 15 minutos -> bloqueo de 15 minutos.
 *
 * El limite por IP esta calibrado para un caso muy concreto de este torneo: los
 * 13 jugadores salen por el WiFi de la casa club, es decir por UNA sola IP. Si
 * cada uno se equivoca dos veces al teclear en el movil, son 26 fallos en pocos
 * minutos desde la misma direccion. Con un limite de 20 se bloquearia la peña
 * entera antes de la primera salida. Con 30 sigue cortando un ataque por fuerza
 * bruta (que necesitaria cientos de intentos) sin castigar a nadie.
 *
 * Un login correcto limpia el contador del jugador. 5 intentos por jugador es
 * holgado y 15 minutos de espera hacen que probar 13 contrasenas a ciegas no sea
 * viable.
 */

export interface AttemptRecord {
  identifier: string;
  succeeded: boolean;
  createdAt: Date;
}

export const RATE_LIMIT = {
  windowMinutes: 15,
  maxFailuresPerIdentifier: 5,
  maxFailuresPerIp: 30,
  lockoutMinutes: 15,
} as const;

export type RateLimitDecision =
  | { allowed: true; remainingAttempts: number }
  | { allowed: false; retryAfterSeconds: number; scope: 'IDENTIFIER' | 'IP' };

function failuresSinceLastSuccess(attempts: AttemptRecord[], windowStart: Date): number {
  const inWindow = attempts
    .filter((a) => a.createdAt.getTime() >= windowStart.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let failures = 0;
  for (const attempt of inWindow) {
    if (attempt.succeeded) failures = 0;
    else failures += 1;
  }
  return failures;
}

function retryAfter(attempts: AttemptRecord[], now: Date): number {
  const lastFailure = attempts
    .filter((a) => !a.succeeded)
    .reduce<Date | null>(
      (latest, a) => (latest === null || a.createdAt > latest ? a.createdAt : latest),
      null,
    );
  if (lastFailure === null) return 0;
  const unlockAt = lastFailure.getTime() + RATE_LIMIT.lockoutMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((unlockAt - now.getTime()) / 1000));
}

export function checkRateLimit(params: {
  identifierAttempts: AttemptRecord[];
  ipAttempts: AttemptRecord[];
  now?: Date;
}): RateLimitDecision {
  const now = params.now ?? new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT.windowMinutes * 60 * 1000);

  const identifierFailures = failuresSinceLastSuccess(params.identifierAttempts, windowStart);
  if (identifierFailures >= RATE_LIMIT.maxFailuresPerIdentifier) {
    return {
      allowed: false,
      scope: 'IDENTIFIER',
      retryAfterSeconds: retryAfter(params.identifierAttempts, now),
    };
  }

  const ipFailures = failuresSinceLastSuccess(params.ipAttempts, windowStart);
  if (ipFailures >= RATE_LIMIT.maxFailuresPerIp) {
    return {
      allowed: false,
      scope: 'IP',
      retryAfterSeconds: retryAfter(params.ipAttempts, now),
    };
  }

  return {
    allowed: true,
    remainingAttempts: RATE_LIMIT.maxFailuresPerIdentifier - identifierFailures,
  };
}

/**
 * Mensaje para el jugador. No distingue "jugador no existe" de "contrasena
 * incorrecta": eso enumeraria la lista de participantes.
 */
export function loginErrorMessage(decision: RateLimitDecision): string {
  if (decision.allowed) return 'Jugador o contrasena incorrectos.';
  const minutes = Math.ceil(decision.retryAfterSeconds / 60);
  return `Demasiados intentos. Vuelve a probar en ${minutes} minuto${minutes === 1 ? '' : 's'}.`;
}
