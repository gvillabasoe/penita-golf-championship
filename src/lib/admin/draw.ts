/**
 * Sorteo y gestion de partidos (secciones 58, 59, 60 y 61).
 *
 * El sorteo es aleatorio pero no ciego. Genera miles de distribuciones
 * reproducibles a partir de una semilla, puntua su equilibrio y escoge al azar
 * entre las mejores. Asi mantiene variedad sin renunciar a repartir HCP,
 * jugadores que conocen el campo y los cuatro HCP mas altos.
 */

export type Role = 'PLAYER' | 'ADMIN';

export interface DrawPlayer {
  competitionPlayerId: string;
  displayName: string;
  isActive: boolean;
  handicapIndexTenths: number | null;
  knowsCourse: boolean;
  color?: string;
}

export interface ProposedFlight {
  order: number;
  name: string;
  memberIds: string[];
  teeTime: string | null;
}

export interface DrawBalanceMetrics {
  worstHandicapCollisions: number;
  handicapAverageRangeTenths: number;
  handicapVariance: number;
  flightsWithoutCourseGuide: number;
  courseGuideDeviation: number;
  mentorshipPenalty: number;
  missingHandicapCount: number;
  score: number;
}

export interface DrawProposal {
  flights: ProposedFlight[];
  seed: string;
  distribution: number[];
  playerCount: number;
  metrics: DrawBalanceMetrics;
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

/** Distribucion para un numero de jugadores cualquiera. */
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

/** Generador deterministico a partir de una semilla de texto. */
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function effectiveHandicaps(players: DrawPlayer[]): Map<string, number> {
  const fallback = median(
    players
      .map((player) => player.handicapIndexTenths)
      .filter((value): value is number => value !== null),
  );
  return new Map(
    players.map((player) => [
      player.competitionPlayerId,
      player.handicapIndexTenths ?? fallback,
    ]),
  );
}

/** Los cuatro HCP mas altos entre los jugadores activos. */
export function worstHandicapPlayerIds(players: DrawPlayer[]): Set<string> {
  const effective = effectiveHandicaps(players);
  return new Set(
    [...players]
      .sort((left, right) => {
        const byHandicap =
          (effective.get(right.competitionPlayerId) ?? 0) -
          (effective.get(left.competitionPlayerId) ?? 0);
        return byHandicap || left.displayName.localeCompare(right.displayName, 'es');
      })
      .slice(0, Math.min(4, players.length))
      .map((player) => player.competitionPlayerId),
  );
}

function partition(
  players: DrawPlayer[],
  distribution: number[],
  seed: string,
): DrawPlayer[][] {
  const shuffled = seededShuffle(players, seed);
  const result: DrawPlayer[][] = [];
  let cursor = 0;
  for (const size of distribution) {
    result.push(shuffled.slice(cursor, cursor + size));
    cursor += size;
  }
  return result;
}

/**
 * Repara una particion puramente aleatoria para separar los cuatro peores HCP
 * siempre que haya suficientes partidos. El intercambio conserva los tamanos.
 */
function separateWorstPlayers(
  rawFlights: DrawPlayer[][],
  worstIds: Set<string>,
  seed: string,
): DrawPlayer[][] {
  const flights = rawFlights.map((members) => [...members]);
  if (flights.length < worstIds.size) return flights;

  for (let guard = 0; guard < worstIds.size * 2; guard += 1) {
    const sourceIndex = flights.findIndex(
      (members) => members.filter((member) => worstIds.has(member.competitionPlayerId)).length > 1,
    );
    const targetIndex = flights.findIndex(
      (members) => members.every((member) => !worstIds.has(member.competitionPlayerId)),
    );
    if (sourceIndex < 0 || targetIndex < 0) break;

    const sourceWorst = seededShuffle(
      flights[sourceIndex].filter((member) => worstIds.has(member.competitionPlayerId)),
      `${seed}:worst:${guard}`,
    )[0];
    const targetRegular = seededShuffle(
      flights[targetIndex].filter((member) => !worstIds.has(member.competitionPlayerId)),
      `${seed}:regular:${guard}`,
    )[0];
    if (!sourceWorst || !targetRegular) break;

    flights[sourceIndex] = flights[sourceIndex].map((member) =>
      member.competitionPlayerId === sourceWorst.competitionPlayerId ? targetRegular : member,
    );
    flights[targetIndex] = flights[targetIndex].map((member) =>
      member.competitionPlayerId === targetRegular.competitionPlayerId ? sourceWorst : member,
    );
  }

  return flights;
}

/**
 * Reparte por bandas de HCP: cada bloque consecutivo aporta, como maximo, un
 * jugador a cada partido. La posicion concreta dentro de la banda es aleatoria.
 */
function stratifiedPartition(
  players: DrawPlayer[],
  distribution: number[],
  seed: string,
): DrawPlayer[][] {
  const effective = effectiveHandicaps(players);
  const ordered = [...players].sort((left, right) => {
    const byHandicap =
      (effective.get(right.competitionPlayerId) ?? 0) -
      (effective.get(left.competitionPlayerId) ?? 0);
    return byHandicap || left.displayName.localeCompare(right.displayName, 'es');
  });
  const flights = distribution.map(() => [] as DrawPlayer[]);
  const flightCount = distribution.length;

  for (let cursor = 0, band = 0; cursor < ordered.length; cursor += flightCount, band += 1) {
    const tier = seededShuffle(
      ordered.slice(cursor, cursor + flightCount),
      `${seed}:tier:${band}`,
    );
    const available = seededShuffle(
      flights
        .map((members, index) => ({ index, remaining: distribution[index] - members.length }))
        .filter((entry) => entry.remaining > 0)
        .map((entry) => entry.index),
      `${seed}:flights:${band}`,
    );

    tier.forEach((player, index) => {
      const flightIndex = available[index];
      if (flightIndex === undefined) {
        throw new Error('No se ha podido completar la distribucion de partidos.');
      }
      flights[flightIndex].push(player);
    });
  }

  return flights.map((members, index) => seededShuffle(members, `${seed}:inside:${index}`));
}

function scoreFlights(
  flights: DrawPlayer[][],
  allPlayers: DrawPlayer[],
  worstIds: Set<string>,
): DrawBalanceMetrics {
  const effective = effectiveHandicaps(allPlayers);
  const overallAverage =
    allPlayers.reduce(
      (sum, player) => sum + (effective.get(player.competitionPlayerId) ?? 0),
      0,
    ) / Math.max(1, allPlayers.length);
  const totalGuides = allPlayers.filter((player) => player.knowsCourse).length;
  const needGuideInEveryFlight = totalGuides >= flights.length;

  let worstHandicapCollisions = 0;
  let flightsWithoutCourseGuide = 0;
  let courseGuideDeviation = 0;
  let mentorshipPenalty = 0;
  const averages: number[] = [];

  for (const members of flights) {
    const average =
      members.reduce(
        (sum, player) => sum + (effective.get(player.competitionPlayerId) ?? overallAverage),
        0,
      ) / Math.max(1, members.length);
    averages.push(average);

    const worstCount = members.filter((member) => worstIds.has(member.competitionPlayerId)).length;
    worstHandicapCollisions += Math.max(0, worstCount - 1);

    const guides = members.filter((member) => member.knowsCourse);
    if (needGuideInEveryFlight && guides.length === 0) flightsWithoutCourseGuide += 1;
    const idealGuides = totalGuides * (members.length / Math.max(1, allPlayers.length));
    courseGuideDeviation += Math.abs(guides.length - idealGuides);

    const bestGuideHandicap =
      guides.length === 0
        ? null
        : Math.min(
            ...guides.map((guide) => effective.get(guide.competitionPlayerId) ?? overallAverage),
          );

    for (const member of members) {
      if (member.knowsCourse) continue;
      const handicap = effective.get(member.competitionPlayerId) ?? overallAverage;
      const priority = 1 + Math.max(0, handicap - overallAverage) / 10;
      if (bestGuideHandicap === null) {
        mentorshipPenalty += priority * 2;
      } else if (bestGuideHandicap >= handicap) {
        mentorshipPenalty += priority + (bestGuideHandicap - handicap) / 10;
      }
    }
  }

  const handicapAverageRangeTenths =
    averages.length === 0 ? 0 : Math.max(...averages) - Math.min(...averages);
  const handicapVariance =
    averages.reduce((sum, value) => sum + ((value - overallAverage) / 10) ** 2, 0) /
    Math.max(1, averages.length);

  const score =
    worstHandicapCollisions * 1_000_000_000 +
    handicapVariance * 100_000 +
    (handicapAverageRangeTenths / 10) * 20_000 +
    flightsWithoutCourseGuide * 300_000 +
    courseGuideDeviation * 30_000 +
    mentorshipPenalty * 5_000;

  return {
    worstHandicapCollisions,
    handicapAverageRangeTenths,
    handicapVariance,
    flightsWithoutCourseGuide,
    courseGuideDeviation,
    mentorshipPenalty,
    missingHandicapCount: allPlayers.filter((player) => player.handicapIndexTenths === null).length,
    score,
  };
}

function candidateKey(flights: DrawPlayer[][]): string {
  return flights
    .map((members) => members.map((member) => member.competitionPlayerId).sort().join(','))
    .join('|');
}

/**
 * Genera una propuesta equilibrada sin escribir nada en base de datos.
 *
 * La misma semilla reproduce exactamente la misma propuesta. Una semilla nueva
 * explora miles de candidatos distintos y escoge aleatoriamente entre los que
 * quedan dentro de un 5 % del mejor resultado encontrado.
 */
export function drawFlights(params: {
  players: DrawPlayer[];
  seed: string;
  distribution?: number[];
}): DrawProposal {
  const active = params.players.filter((player) => player.isActive);
  const distribution = params.distribution ?? distributionFor(active.length);

  const total = distribution.reduce((sum, size) => sum + size, 0);
  if (total !== active.length) {
    throw new Error(
      `La distribucion suma ${total} plazas y hay ${active.length} jugadores activos.`,
    );
  }
  if (active.length === 0) {
    return {
      flights: [],
      seed: params.seed,
      distribution: [],
      playerCount: 0,
      metrics: scoreFlights([], [], new Set()),
    };
  }

  const worstIds = worstHandicapPlayerIds(active);
  const iterations = Math.max(2_000, Math.min(8_000, active.length * 400));
  const candidates = new Map<
    string,
    { flights: DrawPlayer[][]; metrics: DrawBalanceMetrics }
  >();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const candidateSeed = `${params.seed}:candidate:${iteration}`;
    const raw =
      iteration % 5 === 0
        ? separateWorstPlayers(
            partition(active, distribution, `${candidateSeed}:random`),
            worstIds,
            candidateSeed,
          )
        : stratifiedPartition(active, distribution, candidateSeed);
    const key = candidateKey(raw);
    if (candidates.has(key)) continue;
    candidates.set(key, { flights: raw, metrics: scoreFlights(raw, active, worstIds) });
  }

  const ranked = [...candidates.values()].sort((left, right) => left.metrics.score - right.metrics.score);
  const best = ranked[0];
  if (!best) throw new Error('No se ha podido generar ningun sorteo valido.');

  const tolerance = Math.max(5_000, Math.abs(best.metrics.score) * 0.05);
  const similar = ranked
    .filter(
      (candidate) =>
        candidate.metrics.worstHandicapCollisions === best.metrics.worstHandicapCollisions &&
        candidate.metrics.score <= best.metrics.score + tolerance,
    )
    .slice(0, 80);
  const selected = seededShuffle(similar, `${params.seed}:final-choice`)[0] ?? best;

  const flights: ProposedFlight[] = selected.flights.map((members, index) => ({
    order: index + 1,
    name: `Partido ${index + 1}`,
    memberIds: members.map((player) => player.competitionPlayerId),
    teeTime: null,
  }));

  return {
    flights,
    seed: params.seed,
    distribution: [...distribution],
    playerCount: active.length,
    metrics: selected.metrics,
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
  /**
   * Si hay que exigir hora de salida en todos los partidos para confirmar.
   *
   * Por omision si, como hasta ahora. Se puede confirmar el sorteo sin horas
   * cuando todavia no se conoce la hora: se fijan despues en cada partido, y el
   * resumen del panel sigue avisando de los partidos sin hora como incidencia
   * que impide empezar.
   */
  requireTeeTimes?: boolean;
}): ConfirmResult {
  const now = params.now ?? new Date();
  const errors: string[] = [];

  if (params.actorRole !== 'ADMIN') {
    errors.push('Solo un administrador puede confirmar los partidos.');
  }

  const issues = validateFlights({
    flights: params.proposal.flights,
    players: params.players,
    requireTeeTimes: params.requireTeeTimes ?? true,
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
