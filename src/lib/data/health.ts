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

export interface Diagnosis {
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
  ready: boolean;
  nextStep: string;
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
      environment,
      database: { state: 'NO_URL' },
      data: null,
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
    return { environment, database, data, ready: false, nextStep: NEXT_STEP[database.state] };
  }

  if (data.players === 0) {
    return {
      environment,
      database,
      data,
      ready: false,
      nextStep: 'Las tablas existen pero no hay jugadores. Ejecuta: npm run db:seed (ver docs/seed-credentials.md).',
    };
  }
  if (!data.hasCompetition || !data.hasConfirmedCourse) {
    return {
      environment,
      database,
      data,
      ready: false,
      nextStep: 'Hay jugadores pero falta la competición o la valoración confirmada. Vuelve a ejecutar npm run db:seed.',
    };
  }
  if (data.playersWithHandicap < data.players) {
    return {
      environment,
      database,
      data,
      ready: true,
      nextStep: `Todo funciona. Faltan hándicaps por introducir (${data.playersWithHandicap} de ${data.players}) en /admin/jugadores.`,
    };
  }
  if (data.flights === 0) {
    return {
      environment,
      database,
      data,
      ready: true,
      nextStep: 'Todo funciona. Falta sortear los partidos en /admin/partidos.',
    };
  }

  return { environment, database, data, ready: true, nextStep: 'Todo listo.' };
}
