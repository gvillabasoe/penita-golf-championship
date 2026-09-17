/**
 * Sorteo y gestion de partidos (secciones 58, 59, 60 y 61).
 *
 * El sorteo se hace en servidor y con una semilla que se guarda. Eso permite
 * reproducirlo exactamente, lo cual en un torneo entre trece amigos no es un
 * detalle tecnico: es la diferencia entre "salio asi" y "aqui esta la semilla,
 * ejecutalo tu mismo y te sale lo mismo".
 *
 * Nada se guarda hasta que el administrador confirma. El sorteo genera una
 * propuesta; el panel la muestra; se puede repetir, mover jugadores a mano y
 * solo entonces confirmar.
 */

export type Role = 'PLAYER' | 'ADMIN';

export interface DrawPlayer {
  competitionPlayerId: string;
  displayName: string;
  isActive: boolean;
}

export interface ProposedFlight {
  order: number;
  name: string;
  memberIds: string[];
  teeTime: string | null;
}

export interface DrawProposal {
  flights: ProposedFlight[];
  seed: string;
  distribution: number[];
  playerCount: number;
}

/**
 * Distribuciones propuestas de la seccion 59. Son propuestas: el administrador
 * puede cambiarlas.
 *
 * Con 13 jugadores, que es el caso de esta edicion, sale 4+3+3+3.
 */
export const PROPOSED_DISTRIBUTIONS: Record<number, number[]> = {
  10: [4, 3, 3],
  11: [4, 4, 3],
  12: [4, 4, 4],
  13: [4, 3, 3, 3],
  14: [4, 4, 3, 3],
  15: [3, 3, 3, 3, 3],
};

export const MIN_FLIGHT_SIZE = 2;
export const MAX_FLIGHT_SIZE = 4;

/**
 * Distribucion para un numero de jugadores cualquiera.
 *
 * Para los tamanos de la seccion 59 devuelve exactamente lo que dice el pliego.
 * Fuera de ese rango calcula partidos de 4 y reparte el resto hacia arriba
 * evitando dejar un partido de 1, que arruinaria la revision cruzada de tarjetas:
 * un jugador solo en su partido no tendria a nadie que le validase la tarjeta.
 */
export function distributionFor(playerCount: number): number[] {
  if (!Number.isInteger(playerCount) || playerCount < 0) {
    throw new Error(`Numero de jugadores no valido: ${playerCount}`);
  }
  if (playerCount === 0) return [];
  if (PROPOSED_DISTRIBUTIONS[playerCount]) return [...PROPOSED_DISTRIBUTIONS[playerCount]];
  if (playerCount <= MAX_FLIGHT_SIZE) return [playerCount];

  const flightCount = Math.ceil(playerCount / MAX_FLIGHT_SIZE);
  const base = Math.floor(playerCount / flightCount);
  let remainder = playerCount % flightCount;

  const distribution: number[] = [];
  for (let i = 0; i < flightCount; i += 1) {
    distribution.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder -= 1;
  }
  return distribution.sort((a, b) => b - a);
}

/**
 * Generador deterministico a partir de una semilla de texto (mulberry32 sobre
 * un hash FNV-1a). No es criptografico y no necesita serlo: solo tiene que ser
 * reproducible y repartir bien.
 */
function createRandom(seed: string): () => number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates con el generador sembrado. No muta la entrada. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const random = createRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Genera una propuesta de sorteo. No escribe nada: es una propuesta.
 *
 * Solo entran los jugadores activos. Un jugador desactivado no aparece en
 * ningun partido, y eso se refleja en el recuento devuelto.
 */
export function drawFlights(params: {
  players: DrawPlayer[];
  seed: string;
  distribution?: number[];
}): DrawProposal {
  const active = params.players.filter((p) => p.isActive);
  const distribution = params.distribution ?? distributionFor(active.length);

  const total = distribution.reduce((sum, size) => sum + size, 0);
  if (total !== active.length) {
    throw new Error(
      `La distribucion suma ${total} plazas y hay ${active.length} jugadores activos.`,
    );
  }

  const shuffled = seededShuffle(active, params.seed);
  const flights: ProposedFlight[] = [];
  let cursor = 0;

  distribution.forEach((size, index) => {
    flights.push({
      order: index + 1,
      name: `Partido ${index + 1}`,
      memberIds: shuffled.slice(cursor, cursor + size).map((p) => p.competitionPlayerId),
      teeTime: null,
    });
    cursor += size;
  });

  return {
    flights,
    seed: params.seed,
    distribution: [...distribution],
    playerCount: active.length,
  };
}

/**
 * Asigna horas de salida separadas por un intervalo fijo.
 *
 * Trabaja sobre cadenas ISO con desplazamiento explicito para no depender de la
 * zona horaria del servidor, que en Vercel es UTC mientras el torneo se juega en
 * Europe/Madrid.
 */
export function assignTeeTimes(
  flights: ProposedFlight[],
  firstTeeTime: string,
  intervalMinutes = 10,
): ProposedFlight[] {
  const start = new Date(firstTeeTime);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Hora de salida no valida: ${firstTeeTime}`);
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
    throw new Error(`Intervalo no valido: ${intervalMinutes} minutos.`);
  }

  return flights
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((flight, index) => ({
      ...flight,
      teeTime: new Date(start.getTime() + index * intervalMinutes * 60 * 1000).toISOString(),
    }));
}

export interface FlightIssue {
  code:
    | 'DUPLICATED_PLAYER'
    | 'UNASSIGNED_PLAYER'
    | 'INACTIVE_PLAYER_ASSIGNED'
    | 'UNKNOWN_PLAYER'
    | 'FLIGHT_TOO_LARGE'
    | 'FLIGHT_TOO_SMALL'
    | 'EMPTY_FLIGHT'
    | 'MISSING_TEE_TIME'
    | 'DUPLICATED_TEE_TIME'
    | 'DUPLICATED_ORDER';
  severity: 'ERROR' | 'WARNING';
  message: string;
}

/**
 * Validacion completa de una propuesta. Devuelve todos los problemas de golpe:
 * el administrador necesita ver la lista entera, no el primero.
 *
 * `requireTeeTimes` se pone a true al confirmar (seccion 58: "Todas las horas
 * antes de confirmar") y a false mientras se esta montando la propuesta.
 */
export function validateFlights(params: {
  flights: ProposedFlight[];
  players: DrawPlayer[];
  requireTeeTimes: boolean;
}): FlightIssue[] {
  const { flights, players, requireTeeTimes } = params;
  const issues: FlightIssue[] = [];

  const byId = new Map(players.map((p) => [p.competitionPlayerId, p]));
  const assignments = new Map<string, number[]>();

  for (const flight of flights) {
    for (const memberId of flight.memberIds) {
      const list = assignments.get(memberId) ?? [];
      list.push(flight.order);
      assignments.set(memberId, list);
    }
  }

  for (const [memberId, orders] of assignments) {
    const player = byId.get(memberId);
    const label = player?.displayName ?? memberId;

    if (orders.length > 1) {
      issues.push({
        code: 'DUPLICATED_PLAYER',
        severity: 'ERROR',
        message: `${label} esta en los partidos ${orders.join(' y ')}.`,
      });
    }
    if (!player) {
      issues.push({
        code: 'UNKNOWN_PLAYER',
        severity: 'ERROR',
        message: `Hay un jugador asignado que no existe en la competicion (${memberId}).`,
      });
    } else if (!player.isActive) {
      issues.push({
        code: 'INACTIVE_PLAYER_ASSIGNED',
        severity: 'ERROR',
        message: `${label} esta desactivado pero tiene partido asignado.`,
      });
    }
  }

  for (const player of players) {
    if (player.isActive && !assignments.has(player.competitionPlayerId)) {
      issues.push({
        code: 'UNASSIGNED_PLAYER',
        severity: 'ERROR',
        message: `${player.displayName} esta activo y no tiene partido.`,
      });
    }
  }

  for (const flight of flights) {
    if (flight.memberIds.length === 0) {
      issues.push({
        code: 'EMPTY_FLIGHT',
        severity: 'ERROR',
        message: `El partido ${flight.order} no tiene jugadores.`,
      });
    } else if (flight.memberIds.length > MAX_FLIGHT_SIZE) {
      issues.push({
        code: 'FLIGHT_TOO_LARGE',
        severity: 'ERROR',
        message: `El partido ${flight.order} tiene ${flight.memberIds.length} jugadores (maximo ${MAX_FLIGHT_SIZE}).`,
      });
    } else if (flight.memberIds.length < MIN_FLIGHT_SIZE) {
      // Aviso, no error: es legal, pero ese jugador no tendra quien le revise la
      // tarjeta y tendra que hacerlo el administrador.
      issues.push({
        code: 'FLIGHT_TOO_SMALL',
        severity: 'WARNING',
        message: `El partido ${flight.order} tiene un solo jugador: nadie de su partido podra revisar su tarjeta.`,
      });
    }

    if (requireTeeTimes && flight.teeTime === null) {
      issues.push({
        code: 'MISSING_TEE_TIME',
        severity: 'ERROR',
        message: `El partido ${flight.order} no tiene hora de salida.`,
      });
    }
  }

  const orders = flights.map((f) => f.order);
  if (new Set(orders).size !== orders.length) {
    issues.push({
      code: 'DUPLICATED_ORDER',
      severity: 'ERROR',
      message: 'Hay partidos con el mismo numero de orden.',
    });
  }

  const teeTimes = flights.map((f) => f.teeTime).filter((t): t is string => t !== null);
  if (new Set(teeTimes).size !== teeTimes.length) {
    issues.push({
      code: 'DUPLICATED_TEE_TIME',
      severity: 'WARNING',
      message: 'Hay dos partidos con la misma hora de salida.',
    });
  }

  return issues;
}

export interface MoveResult {
  ok: boolean;
  errors: string[];
  flights: ProposedFlight[];
}

/**
 * Mueve un jugador de un partido a otro. Se usa para los ajustes a mano despues
 * del sorteo, antes de confirmar.
 */
export function movePlayer(params: {
  flights: ProposedFlight[];
  competitionPlayerId: string;
  toFlightOrder: number;
}): MoveResult {
  const { flights, competitionPlayerId, toFlightOrder } = params;
  const target = flights.find((f) => f.order === toFlightOrder);

  if (!target) {
    return { ok: false, errors: [`No existe el partido ${toFlightOrder}.`], flights };
  }
  if (target.memberIds.includes(competitionPlayerId)) {
    return { ok: false, errors: ['El jugador ya esta en ese partido.'], flights };
  }
  if (target.memberIds.length >= MAX_FLIGHT_SIZE) {
    return {
      ok: false,
      errors: [`El partido ${toFlightOrder} ya tiene ${MAX_FLIGHT_SIZE} jugadores.`],
      flights,
    };
  }

  return {
    ok: true,
    errors: [],
    flights: flights.map((flight) => {
      if (flight.order === toFlightOrder) {
        return { ...flight, memberIds: [...flight.memberIds, competitionPlayerId] };
      }
      return {
        ...flight,
        memberIds: flight.memberIds.filter((id) => id !== competitionPlayerId),
      };
    }),
  };
}

export interface ConfirmResult {
  ok: boolean;
  errors: string[];
  audit: {
    action: string;
    entityType: string;
    entityId: string;
    actorId: string;
    afterData: unknown;
    reason: string | null;
    createdAt: string;
  } | null;
}

/** Confirma el sorteo. Solo un administrador, y solo si no hay ningun ERROR. */
export function confirmDraw(params: {
  proposal: DrawProposal;
  players: DrawPlayer[];
  actorId: string;
  actorRole: Role;
  now?: Date;
}): ConfirmResult {
  const now = params.now ?? new Date();
  const errors: string[] = [];

  if (params.actorRole !== 'ADMIN') {
    errors.push('Solo un administrador puede confirmar los partidos.');
  }

  const issues = validateFlights({
    flights: params.proposal.flights,
    players: params.players,
    requireTeeTimes: true,
  });
  for (const issue of issues.filter((i) => i.severity === 'ERROR')) {
    errors.push(issue.message);
  }

  if (errors.length > 0) return { ok: false, errors, audit: null };

  return {
    ok: true,
    errors: [],
    audit: {
      action: 'FLIGHTS_CONFIRMED',
      entityType: 'Flight',
      entityId: 'all',
      actorId: params.actorId,
      afterData: {
        // La semilla se guarda para poder reproducir el sorteo.
        seed: params.proposal.seed,
        distribution: params.proposal.distribution,
        flights: params.proposal.flights.map((f) => ({
          order: f.order,
          teeTime: f.teeTime,
          memberIds: f.memberIds,
        })),
      },
      reason: null,
      createdAt: now.toISOString(),
    },
  };
}
