/**
 * Diagnostico del estado de la instalacion.
 *
 * Existe por un motivo concreto: un fallo de base de datos en Next produce
 * "Application error: a server-side exception has occurred" y un digest, que no
 * dice absolutamente nada. Averiguar si falta una variable de entorno, si falta
 * la migracion o si falta el seed puede costar veinte minutos de prueba y error.
 *
 * Esto lo convierte en una URL.
 *
 * No devuelve mensajes de la base de datos, ni cadenas de conexion, ni versiones,
 * ni trazas: solo booleanos, recuentos y el siguiente paso. Es publico a
 * proposito, porque se necesita justo cuando la autenticacion no funciona.
 */

import { prisma } from '../db';
import { errorCode, sanitizeErrorDetail } from './sanitize';
import { APP_VERSION } from '../version';

export type DatabaseState =
  | { state: 'OK' }
  /** No hay variable de entorno: ni se ha intentado conectar. */
  | { state: 'NO_URL' }
  /** No se puede conectar: credenciales, red o proyecto de Neon dormido. */
  | { state: 'UNREACHABLE' }
  /** Conecta pero no hay tablas: falta `prisma migrate`. */
  | { state: 'NO_TABLES' }
  /** El motor de Prisma no esta en el despliegue. */
  | { state: 'NO_ENGINE' };

/**
 * Paso del camino de inicio de sesion que ha fallado.
 *
 * Existe porque el login fallaba con la misma pantalla de error con la
 * contrasena correcta y con una incorrecta, y eso no deja ninguna pista: podia
 * ser cualquiera de cinco consultas. Esto las ejecuta en orden y dice cual.
 */
export type LoginStep =
  | 'ATTEMPTS_READ'
  | 'USER_READ'
  | 'SESSION_READ'
  | 'WRITE_PATH'
  | 'HASH';

/**
 * Paso del camino que se recorre DESPUES de entrar.
 *
 * La primera version de la sonda solo probaba consultas planas, y todas pasaban.
 * Pero la aplicacion usa `include` anidados: uniones entre tres y cuatro tablas
 * que generan un SQL completamente distinto. `getCurrentUser` se ejecuta en la
 * primera peticion despues de iniciar sesion, y no estaba cubierto.
 *
 * El sintoma enganaba: un fallo ahi sale por la misma pantalla de error que un
 * fallo del login, porque los dos usan el mismo `error.tsx`.
 */
export type AppStep =
  /** session -> user -> competitionPlayers -> flightMember */
  | 'SESSION_WITH_USER'
  /** competition -> courseSnapshots -> holes */
  | 'COMPETITION_WITH_COURSE'
  /** competitionPlayer -> user, flightMember -> flight, scorecard -> holes */
  | 'SCORECARDS'
  /** Resolucion de la clasificacion */
  | 'RANKING';

export interface LoginProbe {
  ok: boolean;
  failedAt: LoginStep | null;
  /** Codigo de error de Prisma, si lo hay. No revela datos. */
  code: string | null;
  /** Mensaje recortado y saneado. Util para arreglarlo; sin credenciales. */
  detail: string | null;
}

export interface AppProbe {
  ok: boolean;
  failedAt: AppStep | null;
  code: string | null;
  detail: string | null;
}

export interface Diagnosis {
  /**
   * Version del codigo que responde.
   *
   * Es el primer campo a proposito: si el diagnostico dice que todo esta bien y
   * la aplicacion sigue fallando, lo primero que hay que descartar es que este
   * respondiendo una version antigua.
   */
  version: string;
  environment: {
    /** Imprescindible: sin ella la aplicacion no arranca. */
    DATABASE_URL: boolean;
    /**
     * Solo la usan `prisma migrate` e `introspect`, no el cliente en ejecucion.
     * Si el esquema se creo con SQL, no hace falta para que la app funcione.
     */
    DIRECT_URL: boolean;
    /** Cosmetica: la usa la PWA para su URL canonica. */
    NEXT_PUBLIC_APP_URL: boolean;
  };
  database: DatabaseState;
  data: {
    players: number;
    hasCompetition: boolean;
    hasConfirmedCourse: boolean;
    playersWithHandicap: number;
    flights: number;
  } | null;
  /** null cuando no hay tablas o no hay jugadores: no habria nada que probar. */
  loginPath: LoginProbe | null;
  /**
   * El camino que se recorre justo despues de entrar. Si `loginPath` esta bien y
   * la aplicacion sigue fallando, el problema esta aqui.
   */
  appPath: AppProbe | null;
  ready: boolean;
  nextStep: string;
}

class Rollback extends Error {}

/**
 * Ejecuta exactamente lo que hace el inicio de sesion, en orden, y dice en que
 * paso falla.
 *
 * Las escrituras van dentro de una transaccion que se aborta a proposito: se
 * comprueba que el INSERT funciona sin dejar ni una fila detras.
 */
export async function probeLoginPath(): Promise<LoginProbe> {
  const ok = (): LoginProbe => ({ ok: true, failedAt: null, code: null, detail: null });
  const fail = (failedAt: LoginStep, error: unknown): LoginProbe => ({
    ok: false,
    failedAt,
    code: errorCode(error),
    detail: sanitizeErrorDetail(error),
  });

  const windowStart = new Date(Date.now() - 15 * 60 * 1000);

  try {
    await prisma.loginAttempt.findMany({
      where: { identifier: 'diagnostico', createdAt: { gte: windowStart } },
      select: { identifier: true, succeeded: true, createdAt: true },
    });
  } catch (error) {
    return fail('ATTEMPTS_READ', error);
  }

  let user: { id: string; passwordHash: string; sessionEpoch: number } | null;
  try {
    user = await prisma.user.findFirst({
      select: { id: true, passwordHash: true, sessionEpoch: true },
    });
  } catch (error) {
    return fail('USER_READ', error);
  }
  if (!user) return ok();

  try {
    await prisma.session.findFirst();
  } catch (error) {
    return fail('SESSION_READ', error);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.loginAttempt.create({
        data: { identifier: 'diagnostico', succeeded: false },
      });
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: `diagnostico-${Date.now()}`,
          sessionEpoch: user.sessionEpoch,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      // Aborta: la comprobacion no debe dejar rastro.
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) return fail('WRITE_PATH', error);
  }

  try {
    const { verifyPassword } = await import('../auth/password');
    // Con una contrasena a ciegas: solo interesa que no lance.
    await verifyPassword('comprobacion', user.passwordHash);
  } catch (error) {
    return fail('HASH', error);
  }

  return ok();
}

/**
 * Ejecuta las consultas con `include` anidado que hace la aplicacion despues de
 * entrar, en el mismo orden, y dice en cual falla.
 *
 * Todo es de solo lectura: no escribe nada y no necesita transaccion.
 *
 * Llama a las funciones REALES de queries.ts en vez de replicar sus consultas,
 * para que la sonda no se desincronice de lo que hace la aplicacion.
 */
export async function probeAppPath(): Promise<AppProbe> {
  const ok = (): AppProbe => ({ ok: true, failedAt: null, code: null, detail: null });
  const fail = (failedAt: AppStep, error: unknown): AppProbe => ({
    ok: false,
    failedAt,
    code: errorCode(error),
    detail: sanitizeErrorDetail(error),
  });

  // 1. Lo primero que corre tras iniciar sesion: getCurrentUser().
  //    Con un token que no existe, la consulta se ejecuta igual y devuelve null.
  try {
    await prisma.session.findUnique({
      where: { tokenHash: 'diagnostico-token-que-no-existe' },
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
  } catch (error) {
    return fail('SESSION_WITH_USER', error);
  }

  const queries = await import('./queries');

  let context: Awaited<ReturnType<typeof queries.getCompetition>>;
  try {
    context = await queries.getCompetition();
  } catch (error) {
    return fail('COMPETITION_WITH_COURSE', error);
  }
  if (context === null) return ok();

  try {
    await queries.getAllScorecards(context);
  } catch (error) {
    return fail('SCORECARDS', error);
  }

  try {
    await queries.getRanking(context);
  } catch (error) {
    return fail('RANKING', error);
  }

  return ok();
}

/** Clasifica el fallo sin filtrar su contenido. */
function classify(error: unknown): DatabaseState {
  const message = error instanceof Error ? error.message : String(error);

  if (/Environment variable not found|DATABASE_URL/i.test(message)) return { state: 'NO_URL' };
  if (/Query engine|binaryTargets|could not be found|libquery/i.test(message)) {
    return { state: 'NO_ENGINE' };
  }
  if (/does not exist|P2021|P2022|relation .* does not exist/i.test(message)) {
    return { state: 'NO_TABLES' };
  }
  return { state: 'UNREACHABLE' };
}

const NEXT_STEP: Record<DatabaseState['state'], string> = {
  NO_URL:
    'Falta DATABASE_URL en las variables de entorno de Vercel. Añádela (la cadena con -pooler de Neon) y vuelve a desplegar.',
  NO_ENGINE:
    'El motor de Prisma no ha viajado en el despliegue. Comprueba que prisma/schema.prisma tiene binaryTargets con rhel-openssl-3.0.x y vuelve a desplegar sin cache.',
  UNREACHABLE:
    'No se puede conectar a la base de datos. Revisa DATABASE_URL, y si el proyecto de Neon estaba dormido, vuelve a cargar: el primer arranque tarda unos segundos.',
  NO_TABLES:
    'La base de datos está vacía. Ejecuta: npx prisma migrate deploy, luego psql "$DIRECT_URL" -f prisma/sql/constraints.sql, y después npm run db:seed.',
  OK: '',
};

export async function diagnose(): Promise<Diagnosis> {
  const environment = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DIRECT_URL: Boolean(process.env.DIRECT_URL),
    NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
  };

  if (!environment.DATABASE_URL) {
    return {
      version: APP_VERSION,
      environment,
      database: { state: 'NO_URL' },
      data: null,
      loginPath: null,
      appPath: null,
      ready: false,
      nextStep: NEXT_STEP.NO_URL,
    };
  }

  let database: DatabaseState;
  let data: Diagnosis['data'] = null;

  try {
    const [players, competition, snapshot, withHandicap, flights] = await Promise.all([
      prisma.user.count(),
      prisma.competition.findFirst({ select: { id: true } }),
      prisma.competitionCourseSnapshot.findFirst({
        where: { isActive: true, confirmedAt: { not: null } },
        select: { id: true },
      }),
      prisma.competitionPlayer.count({ where: { handicapIndexTenths: { not: null } } }),
      prisma.flight.count(),
    ]);

    database = { state: 'OK' };
    data = {
      players,
      hasCompetition: competition !== null,
      hasConfirmedCourse: snapshot !== null,
      playersWithHandicap: withHandicap,
      flights,
    };
  } catch (error) {
    database = classify(error);
  }

  if (database.state !== 'OK' || data === null) {
    return {
      version: APP_VERSION,
      environment,
      database,
      data,
      loginPath: null,
      appPath: null,
      ready: false,
      nextStep: NEXT_STEP[database.state],
    };
  }

  const loginPath = data.players > 0 ? await probeLoginPath() : null;

  if (loginPath !== null && !loginPath.ok) {
    return {
      version: APP_VERSION,
      environment,
      database,
      data,
      loginPath,
      appPath: null,
      ready: false,
      nextStep: `El inicio de sesion falla en el paso ${loginPath.failedAt}${loginPath.code ? ` (${loginPath.code})` : ''}: ${loginPath.detail ?? 'sin detalle'}`,
    };
  }

  const appPath = data.players > 0 ? await probeAppPath() : null;

  if (appPath !== null && !appPath.ok) {
    return {
      version: APP_VERSION,
      environment,
      database,
      data,
      loginPath,
      appPath,
      ready: false,
      nextStep: `El login funciona, pero la aplicacion falla justo despues, en el paso ${appPath.failedAt}${appPath.code ? ` (${appPath.code})` : ''}: ${appPath.detail ?? 'sin detalle'}`,
    };
  }

  if (data.players === 0) {
    return {
      version: APP_VERSION,
      environment,
      database,
      data,
      loginPath,
      appPath,
      ready: false,
      nextStep: 'Las tablas existen pero no hay jugadores. Ejecuta: npm run db:seed (ver docs/seed-credentials.md).',
    };
  }
  if (!data.hasCompetition || !data.hasConfirmedCourse) {
    return {
      version: APP_VERSION,
      environment,
      database,
      data,
      loginPath,
      appPath,
      ready: false,
      nextStep: 'Hay jugadores pero falta la competición o la valoración confirmada. Vuelve a ejecutar npm run db:seed.',
    };
  }
  if (data.playersWithHandicap < data.players) {
    return {
      version: APP_VERSION,
      environment,
      database,
      data,
      loginPath,
      appPath,
      ready: true,
      nextStep: `Todo funciona. Faltan hándicaps por introducir (${data.playersWithHandicap} de ${data.players}) en /admin/jugadores.`,
    };
  }
  if (data.flights === 0) {
    return {
      version: APP_VERSION,
      environment,
      database,
      data,
      loginPath,
      appPath,
      ready: true,
      nextStep: 'Todo funciona. Falta sortear los partidos en /admin/partidos.',
    };
  }

  return {
    version: APP_VERSION,
    environment,
    database,
    data,
    loginPath,
    appPath,
    ready: true,
    nextStep: 'Todo listo.',
  };
}
