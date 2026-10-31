import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  assignTeeTimes,
  confirmDraw,
  distributionFor,
  drawFlights,
  MAX_FLIGHT_SIZE,
  movePlayer,
  PROPOSED_DISTRIBUTIONS,
  seededShuffle,
  validateFlights,
  type DrawPlayer,
  type ProposedFlight,
} from '../../admin/draw';
import { resolveRoster } from '../../seed/roster';

const players: DrawPlayer[] = resolveRoster().map((r, index) => ({
  competitionPlayerId: r.slug,
  displayName: r.displayName,
  isActive: true,
  handicapIndexTenths: 40 + index * 24,
  knowsCourse: [0, 3, 6, 9].includes(index),
}));

describe('distribuciones de partidos', () => {
  test('las seis distribuciones de la seccion 59 son exactamente las del pliego', () => {
    assert.deepEqual(PROPOSED_DISTRIBUTIONS[10], [4, 3, 3]);
    assert.deepEqual(PROPOSED_DISTRIBUTIONS[11], [4, 4, 3]);
    assert.deepEqual(PROPOSED_DISTRIBUTIONS[12], [4, 4, 4]);
    assert.deepEqual(PROPOSED_DISTRIBUTIONS[13], [4, 3, 3, 3]);
    assert.deepEqual(PROPOSED_DISTRIBUTIONS[14], [4, 4, 3, 3]);
    assert.deepEqual(PROPOSED_DISTRIBUTIONS[15], [3, 3, 3, 3, 3]);
  });

  test('con los 13 de esta edicion sale 4+3+3+3', () => {
    assert.deepEqual(distributionFor(13), [4, 3, 3, 3]);
    assert.equal(distributionFor(13).reduce((a, b) => a + b, 0), 13);
  });

  test('cada distribucion suma su numero de jugadores', () => {
    for (const [count, distribution] of Object.entries(PROPOSED_DISTRIBUTIONS)) {
      assert.equal(distribution.reduce((a, b) => a + b, 0), Number(count));
    }
  });

  test('fuera del rango del pliego reparte sin dejar a nadie solo', () => {
    for (let count = 2; count <= 40; count += 1) {
      const distribution = distributionFor(count);
      assert.equal(distribution.reduce((a, b) => a + b, 0), count, `falla con ${count}`);
      for (const size of distribution) {
        assert.ok(size <= MAX_FLIGHT_SIZE, `partido de ${size} con ${count} jugadores`);
        if (count >= 2) assert.ok(size >= 2, `partido de ${size} con ${count} jugadores`);
      }
    }
  });

  test('cero jugadores no revienta', () => {
    assert.deepEqual(distributionFor(0), []);
  });

  test('rechaza entradas absurdas', () => {
    assert.throws(() => distributionFor(-1));
    assert.throws(() => distributionFor(3.5));
  });
});

describe('sorteo', () => {
  test('la misma semilla da exactamente el mismo sorteo', () => {
    const a = drawFlights({ players, seed: 'ulzama-2026' });
    const b = drawFlights({ players, seed: 'ulzama-2026' });
    assert.deepEqual(a.flights, b.flights);
  });

  test('semillas distintas dan sorteos distintos', () => {
    const a = drawFlights({ players, seed: 'semilla-a' });
    const b = drawFlights({ players, seed: 'semilla-b' });
    assert.notDeepEqual(a.flights, b.flights);
  });

  test('todos los jugadores entran una sola vez', () => {
    const proposal = drawFlights({ players, seed: 'x' });
    const assigned = proposal.flights.flatMap((f) => f.memberIds);
    assert.equal(assigned.length, 13);
    assert.equal(new Set(assigned).size, 13);
    assert.deepEqual(
      [...assigned].sort(),
      players.map((p) => p.competitionPlayerId).sort(),
    );
  });

  test('respeta la distribucion 4+3+3+3', () => {
    const proposal = drawFlights({ players, seed: 'x' });
    assert.deepEqual(proposal.flights.map((f) => f.memberIds.length), [4, 3, 3, 3]);
  });

  test('un jugador desactivado no entra en ningun partido', () => {
    const conInactivo = players.map((p, i) => (i === 5 ? { ...p, isActive: false } : p));
    const proposal = drawFlights({ players: conInactivo, seed: 'x' });
    const assigned = proposal.flights.flatMap((f) => f.memberIds);
    assert.equal(assigned.length, 12);
    assert.equal(assigned.includes(conInactivo[5].competitionPlayerId), false);
    assert.equal(proposal.playerCount, 12);
  });

  test('separa a los cuatro HCP mas altos entre los cuatro partidos', () => {
    const proposal = drawFlights({ players, seed: 'equilibrio-hcp' });
    const worst = new Set(
      [...players]
        .sort((left, right) =>
          (right.handicapIndexTenths ?? 0) - (left.handicapIndexTenths ?? 0),
        )
        .slice(0, 4)
        .map((player) => player.competitionPlayerId),
    );
    for (const flight of proposal.flights) {
      assert.ok(
        flight.memberIds.filter((id) => worst.has(id)).length <= 1,
        `coinciden varios HCP altos en ${flight.name}`,
      );
    }
    assert.equal(proposal.metrics.worstHandicapCollisions, 0);
  });

  test('reparte a quienes conocen el campo y mantiene cercanas las medias de HCP', () => {
    const proposal = drawFlights({ players, seed: 'guias-y-hcp' });
    const byId = new Map(players.map((player) => [player.competitionPlayerId, player]));
    for (const flight of proposal.flights) {
      assert.ok(
        flight.memberIds.some((id) => byId.get(id)?.knowsCourse),
        `${flight.name} no tiene ningun jugador que conozca el campo`,
      );
    }
    assert.equal(proposal.metrics.flightsWithoutCourseGuide, 0);
    assert.ok(
      proposal.metrics.handicapAverageRangeTenths <= 35,
      `rango de medias demasiado alto: ${proposal.metrics.handicapAverageRangeTenths}`,
    );
  });

  test('prioriza un conocedor de HCP bajo junto a jugadores que no conocen el campo y tienen peor HCP', () => {
    const guidedPlayers: DrawPlayer[] = Array.from({ length: 12 }, (_, index) => ({
      competitionPlayerId: `guia-${index + 1}`,
      displayName: `Jugador ${index + 1}`,
      isActive: true,
      handicapIndexTenths: 40 + index * 20,
      knowsCourse: index < 3,
    }));
    const proposal = drawFlights({
      players: guidedPlayers,
      seed: 'mentores-del-campo',
      distribution: [4, 4, 4],
    });
    const byId = new Map(
      guidedPlayers.map((player) => [player.competitionPlayerId, player] as const),
    );

    for (const flight of proposal.flights) {
      const members = flight.memberIds.map((id) => byId.get(id)!);
      const guides = members.filter((member) => member.knowsCourse);
      assert.equal(guides.length, 1, `${flight.name} no tiene exactamente una guia`);
      assert.ok(
        members.some(
          (member) =>
            !member.knowsCourse &&
            (member.handicapIndexTenths ?? 0) > (guides[0].handicapIndexTenths ?? 0),
        ),
        `${flight.name} no combina la guia con un jugador de peor HCP`,
      );
    }
    assert.equal(proposal.metrics.flightsWithoutCourseGuide, 0);
    assert.equal(proposal.metrics.mentorshipPenalty, 0);
  });

  test('guarda la semilla para poder reproducir el sorteo', () => {
    const proposal = drawFlights({ players, seed: 'ulzama-2026' });
    assert.equal(proposal.seed, 'ulzama-2026');
    const reproducido = drawFlights({
      players,
      seed: proposal.seed,
      distribution: proposal.distribution,
    });
    assert.deepEqual(reproducido.flights, proposal.flights);
  });

  test('una distribucion que no cuadra con los jugadores falla en vez de inventar', () => {
    assert.throws(() => drawFlights({ players, seed: 'x', distribution: [4, 4, 4] }));
  });

  test('el mezclado no muta la entrada', () => {
    const original = [1, 2, 3, 4, 5];
    const copia = [...original];
    seededShuffle(original, 'x');
    assert.deepEqual(original, copia);
  });

  test('el mezclado reparte: ningun jugador se queda siempre en el primer partido', () => {
    const primeros = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      primeros.add(drawFlights({ players, seed: `semilla-${i}` }).flights[0].memberIds[0]);
    }
    assert.ok(primeros.size >= 4, `solo ${primeros.size} jugadores distintos abrieron el sorteo`);
  });
});

describe('horas de salida', () => {
  test('reparte con el intervalo indicado', () => {
    const proposal = drawFlights({ players, seed: 'x' });
    const conHoras = assignTeeTimes(proposal.flights, '2026-06-13T09:00:00+02:00', 10);
    assert.equal(conHoras[0].teeTime, '2026-06-13T07:00:00.000Z'); // 09:00 en Madrid
    assert.equal(conHoras[1].teeTime, '2026-06-13T07:10:00.000Z');
    assert.equal(conHoras[3].teeTime, '2026-06-13T07:30:00.000Z');
  });

  test('no depende de la zona horaria del servidor', () => {
    // Vercel corre en UTC; el torneo se juega en Europe/Madrid. La hora se
    // interpreta por el desplazamiento explicito de la cadena.
    const flights: ProposedFlight[] = [{ order: 1, name: 'P1', memberIds: ['a'], teeTime: null }];
    const madrid = assignTeeTimes(flights, '2026-06-13T09:00:00+02:00');
    const utc = assignTeeTimes(flights, '2026-06-13T09:00:00Z');
    assert.notEqual(madrid[0].teeTime, utc[0].teeTime);
    assert.equal(madrid[0].teeTime, '2026-06-13T07:00:00.000Z');
  });

  test('rechaza horas e intervalos invalidos', () => {
    const flights: ProposedFlight[] = [{ order: 1, name: 'P1', memberIds: ['a'], teeTime: null }];
    assert.throws(() => assignTeeTimes(flights, 'manana por la manana'));
    assert.throws(() => assignTeeTimes(flights, '2026-06-13T09:00:00Z', 0));
    assert.throws(() => assignTeeTimes(flights, '2026-06-13T09:00:00Z', 90));
  });
});

describe('validacion de partidos', () => {
  const base = () =>
    assignTeeTimes(drawFlights({ players, seed: 'x' }).flights, '2026-06-13T09:00:00+02:00');

  test('un sorteo limpio no tiene incidencias', () => {
    assert.deepEqual(validateFlights({ flights: base(), players, requireTeeTimes: true }), []);
  });

  test('detecta un jugador en dos partidos', () => {
    const flights = base();
    const duplicado = flights[0].memberIds[0];
    flights[1] = { ...flights[1], memberIds: [...flights[1].memberIds, duplicado] };
    const issues = validateFlights({ flights, players, requireTeeTimes: true });
    const duplicate = issues.find((i) => i.code === 'DUPLICATED_PLAYER');
    assert.ok(duplicate);
    assert.match(duplicate.message, /partidos 1 y 2/);
  });

  test('detecta un jugador activo sin partido', () => {
    const flights = base();
    flights[0] = { ...flights[0], memberIds: flights[0].memberIds.slice(1) };
    const issues = validateFlights({ flights, players, requireTeeTimes: true });
    assert.equal(issues.filter((i) => i.code === 'UNASSIGNED_PLAYER').length, 1);
  });

  test('detecta un partido de mas de cuatro', () => {
    const flights = base();
    flights[0] = { ...flights[0], memberIds: [...flights[0].memberIds, 'extra'] };
    const issues = validateFlights({ flights, players, requireTeeTimes: true });
    assert.ok(issues.some((i) => i.code === 'FLIGHT_TOO_LARGE'));
  });

  test('un partido de uno es aviso, no error, y explica por que', () => {
    const flights: ProposedFlight[] = [
      { order: 1, name: 'P1', memberIds: ['gvillabaso'], teeTime: '2026-06-13T07:00:00Z' },
    ];
    const issues = validateFlights({
      flights,
      players: [players[0]],
      requireTeeTimes: true,
    });
    const warning = issues.find((i) => i.code === 'FLIGHT_TOO_SMALL');
    assert.ok(warning);
    assert.equal(warning.severity, 'WARNING');
    assert.match(warning.message, /revisar su tarjeta/);
  });

  test('las horas solo son obligatorias al confirmar', () => {
    const sinHoras = drawFlights({ players, seed: 'x' }).flights;
    assert.deepEqual(validateFlights({ flights: sinHoras, players, requireTeeTimes: false }), []);
    assert.equal(
      validateFlights({ flights: sinHoras, players, requireTeeTimes: true }).filter(
        (i) => i.code === 'MISSING_TEE_TIME',
      ).length,
      4,
    );
  });

  test('detecta un jugador desactivado con partido asignado', () => {
    const flights = base();
    const conInactivo = players.map((p, i) =>
      p.competitionPlayerId === flights[0].memberIds[0] ? { ...p, isActive: false } : p,
    );
    const issues = validateFlights({ flights, players: conInactivo, requireTeeTimes: true });
    assert.ok(issues.some((i) => i.code === 'INACTIVE_PLAYER_ASSIGNED'));
  });

  test('avisa de dos partidos a la misma hora', () => {
    const flights = base();
    flights[1] = { ...flights[1], teeTime: flights[0].teeTime };
    const issues = validateFlights({ flights, players, requireTeeTimes: true });
    const warning = issues.find((i) => i.code === 'DUPLICATED_TEE_TIME');
    assert.ok(warning);
    assert.equal(warning.severity, 'WARNING');
  });
});

describe('mover jugadores y confirmar', () => {
  const base = () =>
    assignTeeTimes(drawFlights({ players, seed: 'x' }).flights, '2026-06-13T09:00:00+02:00');

  test('mover un jugador lo quita del anterior y lo pone en el nuevo', () => {
    const flights = base();
    const jugador = flights[0].memberIds[0];
    const result = movePlayer({ flights, competitionPlayerId: jugador, toFlightOrder: 2 });
    assert.equal(result.ok, true);
    assert.equal(result.flights[0].memberIds.includes(jugador), false);
    assert.equal(result.flights[1].memberIds.includes(jugador), true);
    // Sigue habiendo 13 y ninguno repetido.
    const assigned = result.flights.flatMap((f) => f.memberIds);
    assert.equal(assigned.length, 13);
    assert.equal(new Set(assigned).size, 13);
  });

  test('no se puede mover a un partido lleno', () => {
    const flights = base();
    const result = movePlayer({
      flights,
      competitionPlayerId: flights[1].memberIds[0],
      toFlightOrder: 1, // el 1 ya tiene 4
    });
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /ya tiene 4/);
  });

  test('no se puede mover a un partido que no existe', () => {
    const flights = base();
    const result = movePlayer({
      flights,
      competitionPlayerId: flights[0].memberIds[0],
      toFlightOrder: 99,
    });
    assert.equal(result.ok, false);
  });

  test('confirmar exige rol de administrador', () => {
    const proposal = drawFlights({ players, seed: 'x' });
    proposal.flights = assignTeeTimes(proposal.flights, '2026-06-13T09:00:00+02:00');
    const result = confirmDraw({ proposal, players, actorId: 'u1', actorRole: 'PLAYER' });
    assert.equal(result.ok, false);
  });

  test('confirmar guarda la semilla en la auditoria', () => {
    const proposal = drawFlights({ players, seed: 'ulzama-2026' });
    proposal.flights = assignTeeTimes(proposal.flights, '2026-06-13T09:00:00+02:00');
    const result = confirmDraw({
      proposal,
      players,
      actorId: 'admin',
      actorRole: 'ADMIN',
      now: new Date('2026-06-01T10:00:00Z'),
    });
    assert.equal(result.ok, true);
    assert.equal(result.audit?.action, 'FLIGHTS_CONFIRMED');
    const data = result.audit?.afterData as { seed: string; flights: unknown[] };
    assert.equal(data.seed, 'ulzama-2026');
    assert.equal(data.flights.length, 4);
  });

  test('no se confirma sin horas de salida', () => {
    const proposal = drawFlights({ players, seed: 'x' });
    const result = confirmDraw({ proposal, players, actorId: 'admin', actorRole: 'ADMIN' });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 4);
  });

  test('sin horas se puede confirmar si se pide expresamente, para fijarlas despues', () => {
    // Cuando aun no se sabe a que hora se sale, el sorteo se guarda sin horas y
    // se fijan despues en cada partido. Por omision se siguen exigiendo.
    const proposal = drawFlights({ players, seed: 'sin-horas' });
    const sinPedir = confirmDraw({ proposal, players, actorId: 'admin', actorRole: 'ADMIN' });
    assert.equal(sinPedir.ok, false, 'por omision se siguen exigiendo las horas');

    const result = confirmDraw({
      proposal,
      players,
      actorId: 'admin',
      actorRole: 'ADMIN',
      requireTeeTimes: false,
    });
    assert.equal(result.ok, true);
    assert.ok(result.audit);
  });

  test('sin horas, un jugador que no es admin sigue sin poder confirmar', () => {
    const proposal = drawFlights({ players, seed: 'sin-horas' });
    const result = confirmDraw({
      proposal,
      players,
      actorId: 'u1',
      actorRole: 'PLAYER',
      requireTeeTimes: false,
    });
    assert.equal(result.ok, false);
  });
});
