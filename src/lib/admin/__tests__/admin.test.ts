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
import {
  applyRevealAction,
  availableActions,
  initialRevealState,
  isSnapshotOutdated,
  MIN_STEP_INTERVAL_MS,
  playerFacingMessage,
  visibleGroupCount,
  type ActionContext,
  type RevealState,
} from '../../reveal/controller';
import { resolveRoster } from '../../seed/roster';

const players: DrawPlayer[] = resolveRoster().map((r) => ({
  competitionPlayerId: r.slug,
  displayName: r.displayName,
  isActive: true,
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
    assert.ok(primeros.size > 5, `solo ${primeros.size} jugadores distintos abrieron el sorteo`);
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
});

describe('control de la revelacion', () => {
  const context = (overrides: Partial<ActionContext> = {}): ActionContext => ({
    actorId: 'admin',
    actorRole: 'ADMIN',
    currentFingerprint: 'abc123',
    now: 1_000_000,
    totalGroups: 5,
    snapshotId: 'snap1',
    ...overrides,
  });

  const revealing = (revealedCount = 0, overrides: Partial<RevealState> = {}): RevealState => ({
    status: 'REVEALING',
    snapshotId: 'snap1',
    snapshotFingerprint: 'abc123',
    revealedCount,
    totalGroups: 5,
    isPaused: false,
    nextActionAvailableAt: 0,
    publishedAt: null,
    updatedById: 'admin',
    ...overrides,
  });

  test('un jugador no controla la revelacion', () => {
    const result = applyRevealAction(initialRevealState(), 'START', context({ actorRole: 'PLAYER' }));
    assert.equal(result.ok, false);
  });

  test('oculta: el jugador ve el mensaje de pendiente y ninguna posicion', () => {
    const state = initialRevealState();
    assert.equal(visibleGroupCount(state, 'PLAYER'), 0);
    assert.equal(playerFacingMessage(state), 'Clasificacion pendiente de publicacion');
  });

  test('empezar congela la huella de los datos', () => {
    const result = applyRevealAction(initialRevealState(), 'START', context());
    assert.equal(result.ok, true);
    assert.equal(result.state.status, 'REVEALING');
    assert.equal(result.state.snapshotFingerprint, 'abc123');
    assert.equal(result.state.revealedCount, 0);
    assert.equal(result.audit?.action, 'REVEAL_START');
  });

  test('no se puede empezar sin clasificacion congelada', () => {
    const result = applyRevealAction(
      initialRevealState(),
      'START',
      context({ snapshotId: undefined }),
    );
    assert.equal(result.ok, false);
  });

  test('no se puede empezar con la clasificacion vacia', () => {
    const result = applyRevealAction(initialRevealState(), 'START', context({ totalGroups: 0 }));
    assert.equal(result.ok, false);
  });

  test('revelar avanza de uno en uno', () => {
    let state = revealing(0);
    for (let i = 1; i <= 5; i += 1) {
      const result = applyRevealAction(state, 'REVEAL_NEXT', context({ now: i * 10_000 }));
      assert.equal(result.ok, true, `fallo en el paso ${i}`);
      assert.equal(result.state.revealedCount, i);
      state = result.state;
    }
    assert.equal(applyRevealAction(state, 'REVEAL_NEXT', context({ now: 999_999 })).ok, false);
  });

  test('no se pueden dar saltos: hay una pausa minima entre posiciones', () => {
    const result = applyRevealAction(revealing(1, { nextActionAvailableAt: 5_000 }), 'REVEAL_NEXT', context({ now: 4_000 }));
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /Espera un momento/);

    const despues = applyRevealAction(
      revealing(1, { nextActionAvailableAt: 5_000 }),
      'REVEAL_NEXT',
      context({ now: 5_000 }),
    );
    assert.equal(despues.ok, true);
    assert.equal(despues.state.nextActionAvailableAt, 5_000 + MIN_STEP_INTERVAL_MS);
  });

  test('en pausa no se revela, y al reanudar si', () => {
    const pausado = applyRevealAction(revealing(2), 'PAUSE', context());
    assert.equal(pausado.state.isPaused, true);
    assert.equal(applyRevealAction(pausado.state, 'REVEAL_NEXT', context()).ok, false);

    const reanudado = applyRevealAction(pausado.state, 'RESUME', context());
    assert.equal(reanudado.state.isPaused, false);
    assert.equal(applyRevealAction(reanudado.state, 'REVEAL_NEXT', context()).ok, true);
  });

  test('retroceder solo oculta la ultima tarjeta y no toca nada deportivo', () => {
    const state = revealing(3);
    const result = applyRevealAction(state, 'BACK', context());
    assert.equal(result.ok, true);
    assert.equal(result.state.revealedCount, 2);
    // Ningun dato deportivo cambia: mismo snapshot, misma huella, mismo total.
    assert.equal(result.state.snapshotId, state.snapshotId);
    assert.equal(result.state.snapshotFingerprint, state.snapshotFingerprint);
    assert.equal(result.state.totalGroups, state.totalGroups);
  });

  test('no se retrocede desde cero', () => {
    assert.equal(applyRevealAction(revealing(0), 'BACK', context()).ok, false);
  });

  test('corregir una tarjeta a mitad bloquea revelar y publicar', () => {
    const state = revealing(3);
    const cambiado = context({ currentFingerprint: 'OTRA-HUELLA' });

    assert.equal(isSnapshotOutdated(state, 'OTRA-HUELLA'), true);

    const siguiente = applyRevealAction(state, 'REVEAL_NEXT', cambiado);
    assert.equal(siguiente.ok, false);
    assert.match(siguiente.errors[0], /Reinicia la revelacion/);

    const publicar = applyRevealAction(revealing(5), 'PUBLISH', cambiado);
    assert.equal(publicar.ok, false);

    // Las posiciones ya visibles no se mueven en silencio.
    assert.equal(siguiente.state.revealedCount, 3);
  });

  test('reiniciar con datos actualizados desbloquea la presentacion', () => {
    const state = revealing(3);
    const result = applyRevealAction(
      state,
      'RESTART',
      context({ currentFingerprint: 'NUEVA', snapshotId: 'snap2', totalGroups: 5 }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.state.revealedCount, 0);
    assert.equal(result.state.snapshotId, 'snap2');
    assert.equal(result.state.snapshotFingerprint, 'NUEVA');
    assert.equal(
      applyRevealAction(result.state, 'REVEAL_NEXT', context({ currentFingerprint: 'NUEVA', now: 2_000_000 })).ok,
      true,
    );
  });

  test('no se publica sin revelar todas las posiciones', () => {
    const result = applyRevealAction(revealing(4), 'PUBLISH', context());
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /Faltan 1 posiciones/);
  });

  test('publicar cierra la presentacion y abre todas las tarjetas', () => {
    const result = applyRevealAction(revealing(5), 'PUBLISH', context({ now: 1_700_000_000_000 }));
    assert.equal(result.ok, true);
    assert.equal(result.state.status, 'PUBLISHED');
    assert.ok(result.state.publishedAt);
    assert.equal(visibleGroupCount(result.state, 'PLAYER'), 5);
    assert.equal(playerFacingMessage(result.state), null);
  });

  test('publicada no se reinicia ni se vuelve a empezar', () => {
    const publicada = revealing(5, { status: 'PUBLISHED', publishedAt: 'x' });
    assert.equal(applyRevealAction(publicada, 'RESTART', context()).ok, false);
    assert.equal(applyRevealAction(publicada, 'START', context()).ok, false);
    assert.equal(applyRevealAction(publicada, 'PUBLISH', context()).ok, false);
  });

  test('el jugador solo ve lo revelado; el admin ve el provisional completo', () => {
    const state = revealing(2);
    assert.equal(visibleGroupCount(state, 'PLAYER'), 2);
    assert.equal(visibleGroupCount(state, 'ADMIN'), 5);
  });

  test('los botones del panel coinciden con lo que realmente se puede hacer', () => {
    const state = revealing(5);
    const actions = availableActions(state, context());
    const enabled = actions.filter((a) => a.enabled).map((a) => a.action).sort();
    assert.deepEqual(enabled, ['BACK', 'PAUSE', 'PUBLISH', 'RESTART']);
    for (const action of actions.filter((a) => !a.enabled)) {
      assert.ok(action.reason, `${action.action} deshabilitado sin motivo`);
    }
  });
});
