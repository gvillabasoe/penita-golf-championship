/**
 * Sorteo equilibrado de parejas sobre partidos ya confirmados.
 *
 * Las restricciones duras se aplican durante la construccion, no despues:
 * integrantes de partidos distintos y ningun emparejamiento entre los cuatro
 * HCP mas altos. Entre las soluciones validas se puntua el equilibrio de HCP y
 * se elige de forma aleatoria entre las mejores usando una semilla reproducible.
 */

import { seededShuffle } from './draw';

export interface PairDrawPlayer {
  competitionPlayerId: string;
  displayName: string;
  isActive: boolean;
  handicapIndexTenths: number | null;
  flightId: string;
  flightOrder: number;
}

export interface ProposedPairAssignment {
  pairNumber: number;
  memberIds: string[];
  isSolo: boolean;
  equivalentHandicapTenths: number;
}

export interface PairDrawMetrics {
  handicapVariance: number;
  handicapRangeTenths: number;
  complementPenalty: number;
  missingHandicapCount: number;
  score: number;
}

export interface PairDrawProposal {
  seed: string;
  pairs: ProposedPairAssignment[];
  soloPlayerId: string | null;
  playerCount: number;
  metrics: PairDrawMetrics;
}

interface RawCandidate {
  pairs: Array<[PairDrawPlayer, PairDrawPlayer]>;
  solo: PairDrawPlayer | null;
  metrics: PairDrawMetrics;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function effectiveHandicaps(players: PairDrawPlayer[]): Map<string, number> {
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

/** Los cuatro HCP mas altos de los participantes del sorteo. */
export function worstPairHandicapPlayerIds(players: PairDrawPlayer[]): Set<string> {
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

function canPair(
  left: PairDrawPlayer,
  right: PairDrawPlayer,
  worstIds: Set<string>,
): boolean {
  if (left.flightId === right.flightId) return false;
  if (
    worstIds.has(left.competitionPlayerId) &&
    worstIds.has(right.competitionPlayerId)
  ) {
    return false;
  }
  return true;
}

function buildMatching(params: {
  players: PairDrawPlayer[];
  worstIds: Set<string>;
  effective: Map<string, number>;
  targetTeamHandicap: number;
  seed: string;
}): Array<[PairDrawPlayer, PairDrawPlayer]> | null {
  const recurse = (
    remaining: PairDrawPlayer[],
    pairs: Array<[PairDrawPlayer, PairDrawPlayer]>,
    depth: number,
  ): Array<[PairDrawPlayer, PairDrawPlayer]> | null => {
    if (remaining.length === 0) return pairs;

    const withCounts = remaining.map((player) => ({
      player,
      eligible: remaining.filter(
        (candidate) =>
          candidate.competitionPlayerId !== player.competitionPlayerId &&
          canPair(player, candidate, params.worstIds),
      ).length,
    }));
    const minimum = Math.min(...withCounts.map((entry) => entry.eligible));
    if (minimum === 0) return null;

    const first = seededShuffle(
      withCounts.filter((entry) => entry.eligible === minimum).map((entry) => entry.player),
      `${params.seed}:first:${depth}`,
    )[0];
    if (!first) return null;

    const shuffledPartners = seededShuffle(
      remaining.filter(
        (candidate) =>
          candidate.competitionPlayerId !== first.competitionPlayerId &&
          canPair(first, candidate, params.worstIds),
      ),
      `${params.seed}:partners:${depth}:${first.competitionPlayerId}`,
    );
    const deviation = (candidate: PairDrawPlayer) =>
      Math.abs(
        (params.effective.get(first.competitionPlayerId) ?? 0) +
          (params.effective.get(candidate.competitionPlayerId) ?? 0) -
          params.targetTeamHandicap,
      );
    const bestDeviation = Math.min(...shuffledPartners.map(deviation));
    // Una diferencia de hasta 3,0 puntos de HCP de equipo se considera
    // equivalente a efectos del sorteo. Dentro de ese margen manda el azar;
    // el resto queda ordenado por equilibrio para que el backtracking siempre
    // conserve una salida valida.
    const nearEquivalent = shuffledPartners.filter(
      (candidate) => deviation(candidate) <= bestDeviation + 30,
    );
    const remainingPartners = shuffledPartners
      .filter((candidate) => !nearEquivalent.includes(candidate))
      .sort((left, right) => deviation(left) - deviation(right));
    const partners = [...nearEquivalent, ...remainingPartners];

    for (const partner of partners) {
      const next = remaining.filter(
        (player) =>
          player.competitionPlayerId !== first.competitionPlayerId &&
          player.competitionPlayerId !== partner.competitionPlayerId,
      );
      const result = recurse(next, [...pairs, [first, partner]], depth + 1);
      if (result) return result;
    }

    return null;
  };

  return recurse(params.players, [], 0);
}

function scoreCandidate(
  pairs: Array<[PairDrawPlayer, PairDrawPlayer]>,
  solo: PairDrawPlayer | null,
  allPlayers: PairDrawPlayer[],
  effective: Map<string, number>,
): PairDrawMetrics {
  const teamHandicaps = pairs.map(
    ([left, right]) =>
      (effective.get(left.competitionPlayerId) ?? 0) +
      (effective.get(right.competitionPlayerId) ?? 0),
  );
  if (solo) {
    teamHandicaps.push((effective.get(solo.competitionPlayerId) ?? 0) * 2);
  }

  const average =
    teamHandicaps.reduce((sum, value) => sum + value, 0) / Math.max(1, teamHandicaps.length);
  const handicapVariance =
    teamHandicaps.reduce((sum, value) => sum + ((value - average) / 10) ** 2, 0) /
    Math.max(1, teamHandicaps.length);
  const handicapRangeTenths =
    teamHandicaps.length === 0 ? 0 : Math.max(...teamHandicaps) - Math.min(...teamHandicaps);

  const ranked = [...allPlayers].sort((left, right) => {
    const byHandicap =
      (effective.get(left.competitionPlayerId) ?? 0) -
      (effective.get(right.competitionPlayerId) ?? 0);
    return byHandicap || left.displayName.localeCompare(right.displayName, 'es');
  });
  const rank = new Map(
    ranked.map((player, index) => [player.competitionPlayerId, index] as const),
  );
  const idealRankSum = Math.max(0, ranked.length - 1);
  let complementPenalty = 0;
  for (const [left, right] of pairs) {
    complementPenalty += Math.abs(
      (rank.get(left.competitionPlayerId) ?? 0) +
        (rank.get(right.competitionPlayerId) ?? 0) -
        idealRankSum,
    );
  }
  if (solo) {
    complementPenalty +=
      Math.abs((rank.get(solo.competitionPlayerId) ?? 0) * 2 - idealRankSum) * 1.5;
  }

  const score =
    handicapVariance * 100_000 +
    (handicapRangeTenths / 10) * 20_000 +
    complementPenalty * 5_000;

  return {
    handicapVariance,
    handicapRangeTenths,
    complementPenalty,
    missingHandicapCount: allPlayers.filter((player) => player.handicapIndexTenths === null).length,
    score,
  };
}

function candidateKey(candidate: RawCandidate): string {
  const pairs = candidate.pairs
    .map(([left, right]) =>
      [left.competitionPlayerId, right.competitionPlayerId].sort().join(':'),
    )
    .sort()
    .join('|');
  return `${pairs};solo=${candidate.solo?.competitionPlayerId ?? ''}`;
}

/** Comprueba las restricciones duras de una propuesta. */
export function validatePairDraw(
  proposal: PairDrawProposal,
  players: PairDrawPlayer[],
): string[] {
  const errors: string[] = [];
  const byId = new Map(players.map((player) => [player.competitionPlayerId, player]));
  const worstIds = worstPairHandicapPlayerIds(players);
  const assigned: string[] = [];

  for (const pair of proposal.pairs) {
    assigned.push(...pair.memberIds);
    if (pair.isSolo) {
      if (pair.memberIds.length !== 1) errors.push(`La pareja ${pair.pairNumber} no es un individual valido.`);
      continue;
    }
    if (pair.memberIds.length !== 2) {
      errors.push(`La pareja ${pair.pairNumber} no tiene dos integrantes.`);
      continue;
    }
    const left = byId.get(pair.memberIds[0]);
    const right = byId.get(pair.memberIds[1]);
    if (!left || !right) {
      errors.push(`La pareja ${pair.pairNumber} contiene un jugador desconocido.`);
      continue;
    }
    if (left.flightId === right.flightId) {
      errors.push(`${left.displayName} y ${right.displayName} pertenecen al mismo partido.`);
    }
    if (worstIds.has(left.competitionPlayerId) && worstIds.has(right.competitionPlayerId)) {
      errors.push(`${left.displayName} y ${right.displayName} estan entre los cuatro HCP mas altos.`);
    }
  }

  if (assigned.length !== players.length || new Set(assigned).size !== players.length) {
    errors.push('Cada participante debe aparecer exactamente una vez en el sorteo de parejas.');
  }
  if (players.length % 2 === 1 && proposal.pairs.filter((pair) => pair.isSolo).length !== 1) {
    errors.push('Con un numero impar debe existir exactamente un participante individual.');
  }
  if (players.length % 2 === 0 && proposal.pairs.some((pair) => pair.isSolo)) {
    errors.push('Con un numero par no puede existir un participante individual.');
  }

  return errors;
}

/**
 * Genera parejas equilibradas sobre los partidos confirmados.
 *
 * Para un numero impar, cada candidato prueba tambien un jugador individual.
 * Su HCP equivalente es el doble para que la eleccion del individual participe
 * en la misma funcion de equilibrio que las parejas reales.
 */
export function drawPairs(params: {
  players: PairDrawPlayer[];
  seed: string;
}): PairDrawProposal {
  const active = params.players.filter((player) => player.isActive);
  if (active.length < 2) {
    throw new Error('Se necesitan al menos dos participantes activos para sortear parejas.');
  }
  if (active.some((player) => !player.flightId)) {
    throw new Error('Todos los participantes deben tener un partido confirmado.');
  }

  const effective = effectiveHandicaps(active);
  const worstIds = worstPairHandicapPlayerIds(active);
  const targetTeamHandicap =
    (active.reduce(
      (sum, player) => sum + (effective.get(player.competitionPlayerId) ?? 0),
      0,
    ) /
      active.length) *
    2;
  const odd = active.length % 2 === 1;
  const soloOrder = odd
    ? seededShuffle(active, `${params.seed}:solo-order`)
    : [null];
  const iterations = Math.max(900, Math.min(4_000, active.length * 260));
  const candidates = new Map<string, RawCandidate>();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const solo = odd ? soloOrder[iteration % soloOrder.length] ?? null : null;
    const remaining = solo
      ? active.filter((player) => player.competitionPlayerId !== solo.competitionPlayerId)
      : active;
    const pairs = buildMatching({
      players: remaining,
      worstIds,
      effective,
      targetTeamHandicap,
      seed: `${params.seed}:candidate:${iteration}`,
    });
    if (!pairs) continue;

    const candidate: RawCandidate = {
      pairs,
      solo,
      metrics: scoreCandidate(pairs, solo, active, effective),
    };
    const key = candidateKey(candidate);
    if (!candidates.has(key)) candidates.set(key, candidate);
  }

  const ranked = [...candidates.values()].sort((left, right) => left.metrics.score - right.metrics.score);
  const best = ranked[0];
  if (!best) {
    throw new Error(
      'No existe una combinacion valida con participantes de partidos distintos y los cuatro HCP mas altos separados.',
    );
  }

  let selectionPool: RawCandidate[];
  if (odd) {
    // El jugador individual no puede ser siempre el mismo "mediano". Primero
    // se conserva la mejor solucion encontrada para cada posible individual,
    // se descartan las que deterioran demasiado el equilibrio y, entre las
    // restantes, se elige el individual de forma aleatoria. Despues se elige
    // tambien aleatoriamente una de sus combinaciones equivalentes.
    const bestBySolo = new Map<string, RawCandidate>();
    for (const candidate of ranked) {
      const soloId = candidate.solo?.competitionPlayerId;
      if (soloId && !bestBySolo.has(soloId)) bestBySolo.set(soloId, candidate);
    }
    const soloTolerance = Math.max(900_000, Math.abs(best.metrics.score) * 0.20);
    const balancedSolos = [...bestBySolo.values()].filter(
      (candidate) => candidate.metrics.score <= best.metrics.score + soloTolerance,
    );
    const chosenSolo =
      seededShuffle(balancedSolos, `${params.seed}:solo-choice`)[0]?.solo ?? best.solo;
    const chosenSoloBest =
      (chosenSolo && bestBySolo.get(chosenSolo.competitionPlayerId)) ?? best;
    const pairingTolerance = Math.max(
      25_000,
      Math.abs(chosenSoloBest.metrics.score) * 0.07,
    );
    selectionPool = ranked
      .filter(
        (candidate) =>
          candidate.solo?.competitionPlayerId === chosenSolo?.competitionPlayerId &&
          candidate.metrics.score <= chosenSoloBest.metrics.score + pairingTolerance,
      )
      .slice(0, 120);
  } else {
    const tolerance = Math.max(300_000, Math.abs(best.metrics.score) * 0.12);
    selectionPool = ranked
      .filter((candidate) => candidate.metrics.score <= best.metrics.score + tolerance)
      .slice(0, 120);
  }
  const selected = seededShuffle(selectionPool, `${params.seed}:final-choice`)[0] ?? best;

  const shuffledTeams = seededShuffle(
    [
      ...selected.pairs.map((members) => ({ members, isSolo: false })),
      ...(selected.solo ? [{ members: [selected.solo] as [PairDrawPlayer], isSolo: true }] : []),
    ],
    `${params.seed}:pair-order`,
  );

  const proposal: PairDrawProposal = {
    seed: params.seed,
    pairs: shuffledTeams.map((team, index) => ({
      pairNumber: index + 1,
      memberIds: team.members.map((member) => member.competitionPlayerId),
      isSolo: team.isSolo,
      equivalentHandicapTenths: team.isSolo
        ? (effective.get(team.members[0].competitionPlayerId) ?? 0) * 2
        : team.members.reduce(
            (sum, member) => sum + (effective.get(member.competitionPlayerId) ?? 0),
            0,
          ),
    })),
    soloPlayerId: selected.solo?.competitionPlayerId ?? null,
    playerCount: active.length,
    metrics: selected.metrics,
  };

  const errors = validatePairDraw(proposal, active);
  if (errors.length > 0) throw new Error(errors.join(' '));
  return proposal;
}
