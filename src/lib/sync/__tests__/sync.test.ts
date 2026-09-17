import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  backoffFor,
  createQueue,
  enqueue,
  markApplied,
  markConflict,
  markFailed,
  markInFlight,
  nextBatch,
  prepareLogout,
  pruneApplied,
  QUEUE_CONFIG,
  queueStats,
  type HoleMutation,
} from '../queue';
import {
  applyBatch,
  applyMutation,
  resolveConflict,
  type ServerScorecardState,
} from '../apply';

const DEVICE = 'movil-gonzalo';

const mutation = (overrides: Partial<HoleMutation> = {}): HoleMutation => ({
  clientMutationId: `m-${overrides.holeNumber ?? 1}`,
  clientId: DEVICE,
  userId: 'u1',
  scorecardId: 'sc1',
  holeNumber: 1,
  grossStrokes: 5,
  isPickup: false,
  baseVersion: 0,
  createdAtLocal: '2026-09-17T09:00:00.000Z',
  ...overrides,
});

const serverState = (overrides: Partial<ServerScorecardState> = {}): ServerScorecardState => ({
  id: 'sc1',
  ownerUserId: 'u1',
  version: 0,
  status: 'IN_PLAY',
  holes: {},
  allocationVersion: 1,
  ...overrides,
});

describe('cola sin conexion', () => {
  test('encola en orden y cuenta los pendientes', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ holeNumber: 1, clientMutationId: 'a' }), 1000);
    queue = enqueue(queue, mutation({ holeNumber: 2, clientMutationId: 'b' }), 1001);
    assert.equal(queue.items.length, 2);
    assert.deepEqual(queue.items.map((i) => i.sequence), [1, 2]);
    assert.equal(queueStats(queue).pending, 2);
    assert.deepEqual(queueStats(queue).pendingHoles, [1, 2]);
  });

  test('el mismo clientMutationId no se duplica (doble toque en confirmar)', () => {
    let queue = createQueue();
    const m = mutation({ clientMutationId: 'mismo' });
    queue = enqueue(queue, m, 1000);
    queue = enqueue(queue, m, 1001);
    assert.equal(queue.items.length, 1);
  });

  test('conserva dos escrituras del mismo hoyo si son operaciones distintas', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ clientMutationId: 'a', holeNumber: 7, grossStrokes: 5 }));
    queue = enqueue(queue, mutation({ clientMutationId: 'b', holeNumber: 7, grossStrokes: 6 }));
    assert.equal(queue.items.length, 2);
    const batch = nextBatch(queue, Date.now() + 1);
    assert.deepEqual(batch.map((i) => i.mutation.grossStrokes), [5, 6]);
  });

  test('el lote respeta el orden de insercion', () => {
    let queue = createQueue();
    for (let hole = 1; hole <= 5; hole += 1) {
      queue = enqueue(queue, mutation({ clientMutationId: `m${hole}`, holeNumber: hole }), 1000);
    }
    const batch = nextBatch(queue, 2000);
    assert.deepEqual(batch.map((i) => i.mutation.holeNumber), [1, 2, 3, 4, 5]);
  });

  test('el lote tiene tope de tamano', () => {
    let queue = createQueue();
    for (let i = 0; i < QUEUE_CONFIG.maxBatchSize + 10; i += 1) {
      queue = enqueue(queue, mutation({ clientMutationId: `m${i}`, holeNumber: (i % 18) + 1 }), 1000);
    }
    assert.equal(nextBatch(queue, 2000).length, QUEUE_CONFIG.maxBatchSize);
  });

  test('el retroceso exponencial crece y tiene techo', () => {
    assert.equal(backoffFor(1), 1_000);
    assert.equal(backoffFor(2), 2_000);
    assert.equal(backoffFor(3), 4_000);
    assert.equal(backoffFor(10), QUEUE_CONFIG.maxBackoffMs);
    assert.equal(backoffFor(100), QUEUE_CONFIG.maxBackoffMs);
  });

  test('un fallo transitorio vuelve a pendiente con espera', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ clientMutationId: 'a' }), 0);
    queue = markInFlight(queue, 'a');
    queue = markFailed(queue, 'a', 'timeout', 5_000);

    const item = queue.items[0];
    assert.equal(item.status, 'PENDING');
    assert.equal(item.attempts, 1);
    assert.equal(item.nextAttemptAt, 6_000);
    assert.equal(nextBatch(queue, 5_500).length, 0, 'no debe reintentar antes de tiempo');
    assert.equal(nextBatch(queue, 6_000).length, 1);
  });

  test('tras agotar los intentos la operacion muere y detiene la cola', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ clientMutationId: 'a', holeNumber: 1 }), 0);
    queue = enqueue(queue, mutation({ clientMutationId: 'b', holeNumber: 2 }), 0);

    for (let i = 0; i < QUEUE_CONFIG.maxAttempts; i += 1) {
      queue = markInFlight(queue, 'a');
      queue = markFailed(queue, 'a', 'error', 0);
    }

    assert.equal(queue.items[0].status, 'FAILED');
    assert.equal(queueStats(queue).hasPermanentFailure, true);
    assert.equal(
      nextBatch(queue, 1_000_000).length,
      0,
      'una operacion muerta no debe dejar pasar a las siguientes',
    );
  });

  test('una operacion aplicada se retira y deja pasar a la siguiente', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ clientMutationId: 'a', holeNumber: 1 }), 0);
    queue = enqueue(queue, mutation({ clientMutationId: 'b', holeNumber: 2 }), 0);
    queue = markApplied(queue, 'a');

    assert.deepEqual(nextBatch(queue, 1000).map((i) => i.mutation.clientMutationId), ['b']);
    queue = pruneApplied(queue);
    assert.equal(queue.items.length, 1);
  });

  test('un conflicto no se reintenta: lo resuelve una persona', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ clientMutationId: 'a' }), 0);
    queue = markConflict(queue, 'a', 'el administrador corrigio el hoyo');

    assert.equal(queueStats(queue).conflicts, 1);
    assert.equal(nextBatch(queue, 1_000_000).length, 0);
  });

  test('cerrar sesion con operaciones sin enviar no borra sin avisar', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ clientMutationId: 'a', userId: 'u1' }), 0);
    queue = enqueue(queue, mutation({ clientMutationId: 'b', userId: 'u2' }), 0);

    const result = prepareLogout(queue, 'u1');
    assert.equal(result.safeToClear, false);
    assert.equal(result.unsentCount, 1);
    // Los datos del otro usuario del mismo dispositivo no se tocan.
    assert.equal(result.queue.items.length, 1);
    assert.equal(result.queue.items[0].mutation.userId, 'u2');
  });

  test('cerrar sesion con todo sincronizado es seguro', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation({ clientMutationId: 'a', userId: 'u1' }), 0);
    queue = markApplied(queue, 'a');
    assert.equal(prepareLogout(queue, 'u1').safeToClear, true);
  });
});

describe('idempotencia en el servidor', () => {
  test('la primera vez se aplica y sube la version', () => {
    const outcome = applyMutation(serverState(), mutation(), new Set(), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.equal(outcome.type, 'APPLIED');
    if (outcome.type !== 'APPLIED') return;
    assert.equal(outcome.version, 1);
    assert.equal(outcome.state.holes[1].grossStrokes, 5);
    assert.equal(outcome.audit.action, 'HOLE_SCORE_WRITTEN');
  });

  test('reenviar la misma operacion no duplica nada', () => {
    const state = serverState({ version: 1 });
    const outcome = applyMutation(state, mutation(), new Set(['m-1']), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.deepEqual(outcome, { type: 'DUPLICATE', clientMutationId: 'm-1', version: 1 });
  });

  test('reenviar un lote entero tras un corte de red es seguro', () => {
    // Escenario real: el movil envia 9 hoyos, el servidor los aplica y la
    // respuesta se pierde. El movil reintenta el mismo lote.
    const mutations = Array.from({ length: 9 }, (_, i) =>
      mutation({ clientMutationId: `h${i + 1}`, holeNumber: i + 1, grossStrokes: 5 }),
    );

    const primera = applyBatch(serverState(), mutations, new Set(), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.equal(primera.appliedIds.length, 9);
    assert.equal(primera.state.version, 9);

    const segunda = applyBatch(primera.state, mutations, new Set(primera.appliedIds), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.equal(segunda.appliedIds.length, 0, 'nada debe volver a aplicarse');
    assert.equal(segunda.state.version, 9, 'la version no puede moverse');
    assert.equal(segunda.settledIds.length, 9, 'el movil debe poder vaciar la cola');
    assert.deepEqual(segunda.conflicts, []);
  });
});

describe('conflictos', () => {
  test('el mismo dispositivo corrigiendo su propio hoyo NO es conflicto', () => {
    // Este es el caso que rompe la version optimista ingenua: el jugador apunta
    // 5 y luego 6 en el mismo hoyo, ambas con baseVersion 0.
    const mutations = [
      mutation({ clientMutationId: 'a', holeNumber: 7, grossStrokes: 5, baseVersion: 0 }),
      mutation({ clientMutationId: 'b', holeNumber: 7, grossStrokes: 6, baseVersion: 0 }),
    ];
    const result = applyBatch(serverState(), mutations, new Set(), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.deepEqual(result.conflicts, [], 'no debe haber conflictos consigo mismo');
    assert.equal(result.state.holes[7].grossStrokes, 6, 'gana la ultima');
    assert.equal(result.state.version, 2);
  });

  test('una version base antigua no da conflicto si el hoyo no ha cambiado', () => {
    // El admin toco el hoyo 3; el jugador vuelve con 9 hoyos basados en la v0.
    const state = serverState({
      version: 4,
      holes: {
        3: {
          grossStrokes: 4,
          isPickup: false,
          isOverridden: true,
          serverVersion: 4,
          lastWriterClientId: null,
        },
      },
    });
    const outcome = applyMutation(state, mutation({ holeNumber: 8, baseVersion: 0 }), new Set(), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.equal(outcome.type, 'APPLIED', 'el hoyo 8 no tiene nada que ver con el 3');
  });

  test('otro dispositivo escribio el mismo hoyo: conflicto', () => {
    const state = serverState({
      version: 3,
      holes: {
        7: {
          grossStrokes: 4,
          isPickup: false,
          isOverridden: false,
          serverVersion: 3,
          lastWriterClientId: 'otro-movil',
        },
      },
    });
    const outcome = applyMutation(
      state,
      mutation({ holeNumber: 7, grossStrokes: 6, baseVersion: 1 }),
      new Set(),
      { actorUserId: 'u1', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'CONFLICT');
    if (outcome.type !== 'CONFLICT') return;
    assert.equal(outcome.conflict.reason, 'OTHER_DEVICE');
    assert.deepEqual(outcome.conflict.localValue, { grossStrokes: 6, isPickup: false });
    assert.deepEqual(outcome.conflict.serverValue, { grossStrokes: 4, isPickup: false });
    assert.equal(outcome.conflict.baseVersion, 1);
    assert.equal(outcome.conflict.serverVersion, 3);
  });

  test('un jugador no puede pisar una correccion administrativa', () => {
    const state = serverState({
      version: 5,
      holes: {
        7: {
          grossStrokes: 4,
          isPickup: false,
          isOverridden: true,
          serverVersion: 5,
          lastWriterClientId: null,
        },
      },
    });
    const outcome = applyMutation(
      state,
      mutation({ holeNumber: 7, grossStrokes: 6, baseVersion: 5 }),
      new Set(),
      { actorUserId: 'u1', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'CONFLICT');
    if (outcome.type !== 'CONFLICT') return;
    assert.equal(outcome.conflict.reason, 'ADMIN_OVERRIDE');
  });

  test('el administrador si puede sobreescribir la correccion de otro', () => {
    const state = serverState({
      version: 5,
      holes: {
        7: {
          grossStrokes: 4,
          isPickup: false,
          isOverridden: true,
          serverVersion: 5,
          lastWriterClientId: null,
        },
      },
    });
    const outcome = applyMutation(
      state,
      mutation({ holeNumber: 7, grossStrokes: 6, userId: 'u1', baseVersion: 5 }),
      new Set(),
      { actorUserId: 'admin', actorRole: 'ADMIN', reason: 'error de transcripcion' },
    );
    assert.equal(outcome.type, 'APPLIED');
    if (outcome.type !== 'APPLIED') return;
    assert.equal(outcome.audit.action, 'HOLE_SCORE_OVERRIDDEN');
    assert.equal(outcome.audit.reason, 'error de transcripcion');
    assert.equal(outcome.state.holes[7].isOverridden, true);
  });

  test('el organizador apuntando SU tarjeta no es una correccion administrativa', () => {
    // Gonzalo Villabaso es jugador y administrador a la vez. Sus propios hoyos
    // no pueden quedar marcados como corregidos por el administrador: se
    // quedaria sin poder corregirse a si mismo mas tarde.
    const outcome = applyMutation(
      serverState({ ownerUserId: 'gonzalo' }),
      mutation({ userId: 'gonzalo' }),
      new Set(),
      { actorUserId: 'gonzalo', actorRole: 'ADMIN' },
    );
    assert.equal(outcome.type, 'APPLIED');
    if (outcome.type !== 'APPLIED') return;
    assert.equal(outcome.audit.action, 'HOLE_SCORE_WRITTEN');
    assert.equal(outcome.state.holes[1].isOverridden, false);
    assert.equal(outcome.state.holes[1].lastWriterClientId, DEVICE);
  });

  test('un lote con un conflicto aplica el resto', () => {
    const state = serverState({
      version: 2,
      holes: {
        7: {
          grossStrokes: 4,
          isPickup: false,
          isOverridden: true,
          serverVersion: 2,
          lastWriterClientId: null,
        },
      },
    });
    const mutations = [
      mutation({ clientMutationId: 'a', holeNumber: 6, grossStrokes: 5, baseVersion: 0 }),
      mutation({ clientMutationId: 'b', holeNumber: 7, grossStrokes: 6, baseVersion: 0 }),
      mutation({ clientMutationId: 'c', holeNumber: 8, grossStrokes: 4, baseVersion: 0 }),
    ];
    const result = applyBatch(state, mutations, new Set(), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].holeNumber, 7);
    assert.deepEqual(result.appliedIds, ['a', 'c']);
    assert.equal(result.state.holes[7].grossStrokes, 4, 'el hoyo en conflicto no se toca');
  });

  test('un cambio de reparto avisa pero NO pierde el resultado', () => {
    const outcome = applyMutation(serverState({ allocationVersion: 3 }), mutation(), new Set(), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
      clientAllocationVersion: 1,
    });
    assert.equal(outcome.type, 'APPLIED');
    if (outcome.type !== 'APPLIED') return;
    assert.equal(outcome.staleAllocation, true);
    assert.equal(outcome.state.holes[1].grossStrokes, 5);
  });
});

describe('rechazos', () => {
  test('no se escribe en la tarjeta de otro', () => {
    const outcome = applyMutation(
      serverState({ ownerUserId: 'u2' }),
      mutation({ userId: 'u1' }),
      new Set(),
      { actorUserId: 'u1', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type !== 'REJECTED') return;
    assert.equal(outcome.code, 'NOT_OWNER');
  });

  test('falsear el userId del payload no sirve de nada', () => {
    // El atacante es u2 (autenticado) y pone userId: 'u1' para escribir en la
    // tarjeta de u1. La decision se toma con la sesion, no con el payload.
    const outcome = applyMutation(
      serverState({ ownerUserId: 'u1' }),
      mutation({ userId: 'u1' }),
      new Set(),
      { actorUserId: 'u2', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type !== 'REJECTED') return;
    assert.equal(outcome.code, 'NOT_OWNER');
  });

  test('un payload con userId incoherente se rechaza aunque sea el dueno', () => {
    const outcome = applyMutation(
      serverState({ ownerUserId: 'u1' }),
      mutation({ userId: 'otro' }),
      new Set(),
      { actorUserId: 'u1', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'REJECTED');
  });

  test('una tarjeta bloqueada rechaza al jugador pero no al admin', () => {
    const locked = serverState({ status: 'LOCKED' });
    const comoJugador = applyMutation(locked, mutation(), new Set(), {
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.equal(comoJugador.type, 'REJECTED');
    if (comoJugador.type === 'REJECTED') assert.equal(comoJugador.code, 'CARD_LOCKED');

    const comoAdmin = applyMutation(locked, mutation(), new Set(), {
      actorUserId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(comoAdmin.type, 'APPLIED');
  });

  test('rechaza el estado imposible "raya con golpes"', () => {
    const outcome = applyMutation(
      serverState(),
      mutation({ isPickup: true, grossStrokes: 4 }),
      new Set(),
      { actorUserId: 'u1', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type !== 'REJECTED') return;
    assert.equal(outcome.code, 'INVALID_STROKES');
  });

  test('rechaza un hoyo sin golpes y sin raya', () => {
    const outcome = applyMutation(
      serverState(),
      mutation({ isPickup: false, grossStrokes: null }),
      new Set(),
      { actorUserId: 'u1', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'REJECTED');
  });

  test('el jugador no puede pasar de 9 golpes; el admin si hasta 20', () => {
    const diez = mutation({ grossStrokes: 10 });
    assert.equal(
      applyMutation(serverState(), diez, new Set(), { actorUserId: 'u1', actorRole: 'PLAYER' }).type,
      'REJECTED',
    );
    assert.equal(
      applyMutation(serverState(), diez, new Set(), { actorUserId: 'a', actorRole: 'ADMIN' }).type,
      'APPLIED',
    );
    assert.equal(
      applyMutation(serverState(), mutation({ grossStrokes: 21 }), new Set(), {
        actorUserId: 'a',
        actorRole: 'ADMIN',
      }).type,
      'REJECTED',
    );
  });

  test('rechaza hoyos fuera de 1-18', () => {
    for (const holeNumber of [0, 19, -1, 1.5]) {
      const outcome = applyMutation(serverState(), mutation({ holeNumber }), new Set(), {
        actorUserId: 'u1',
        actorRole: 'PLAYER',
      });
      assert.equal(outcome.type, 'REJECTED', `deberia rechazar el hoyo ${holeNumber}`);
    }
  });

  test('con la competicion cerrada no se escribe ni siendo admin', () => {
    const outcome = applyMutation(serverState(), mutation(), new Set(), {
      actorUserId: 'admin',
      actorRole: 'ADMIN',
      competitionClosed: true,
    });
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type !== 'REJECTED') return;
    assert.equal(outcome.code, 'COMPETITION_CLOSED');
  });

  test('la idempotencia gana incluso a una tarjeta bloqueada', () => {
    // Si ya se aplico antes de bloquear, un reenvio no puede convertirse en error.
    const outcome = applyMutation(
      serverState({ status: 'LOCKED' }),
      mutation(),
      new Set(['m-1']),
      { actorUserId: 'u1', actorRole: 'PLAYER' },
    );
    assert.equal(outcome.type, 'DUPLICATE');
  });
});

describe('resolucion de conflictos', () => {
  const state = serverState({
    version: 5,
    holes: {
      7: {
        grossStrokes: 4,
        isPickup: false,
        isOverridden: true,
        serverVersion: 5,
        lastWriterClientId: null,
      },
    },
  });
  const conflict = {
    scorecardId: 'sc1',
    holeNumber: 7,
    localValue: { grossStrokes: 6, isPickup: false },
    serverValue: { grossStrokes: 4, isPickup: false },
    baseVersion: 3,
    serverVersion: 5,
    reason: 'ADMIN_OVERRIDE' as const,
    clientMutationId: 'x',
  };

  test('un jugador no resuelve conflictos', () => {
    const result = resolveConflict({
      state,
      conflict,
      resolution: 'KEEP_SERVER',
      actorUserId: 'u1',
      actorRole: 'PLAYER',
    });
    assert.equal(result.ok, false);
  });

  test('quedarse con el servidor no cambia el dato y deja auditoria', () => {
    const result = resolveConflict({
      state,
      conflict,
      resolution: 'KEEP_SERVER',
      actorUserId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(result.ok, true);
    assert.equal(result.state.version, 5);
    assert.equal(result.state.holes[7].grossStrokes, 4);
    assert.equal(result.audit?.action, 'SYNC_CONFLICT_RESOLVED_SERVER');
  });

  test('pisar una correccion administrativa exige motivo por escrito', () => {
    const sinMotivo = resolveConflict({
      state,
      conflict,
      resolution: 'KEEP_LOCAL',
      actorUserId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(sinMotivo.ok, false);
    assert.match(sinMotivo.errors[0], /motivo por escrito/);

    const conMotivo = resolveConflict({
      state,
      conflict,
      resolution: 'KEEP_LOCAL',
      actorUserId: 'admin',
      actorRole: 'ADMIN',
      reason: 'Confirmado con los tres del partido: fueron 6 golpes.',
    });
    assert.equal(conMotivo.ok, true);
    assert.equal(conMotivo.state.holes[7].grossStrokes, 6);
    assert.equal(conMotivo.state.version, 6);
    assert.match(conMotivo.audit?.reason ?? '', /tres del partido/);
  });
});
