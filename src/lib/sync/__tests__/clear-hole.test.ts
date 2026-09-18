/**
 * Borrar el resultado de un hoyo, y la guardia contra datos offline antiguos
 * (secciones 4, 3.5 y 30).
 *
 * Los dos requisitos duros que estos tests protegen:
 *
 *   1. VACIO NO ES RAYA. Un hoyo vacio no cuenta como jugado, no da puntos e
 *      impide finalizar la tarjeta. Una raya cuenta, vale 0 y permite
 *      finalizar. Confundirlas regala una tarjeta completa a quien le falta un
 *      hoyo.
 *   2. Un resultado borrado NO puede resucitar. Un movil que apunto nueve hoyos
 *      sin cobertura y vuelve despues de un vaciado no puede reescribirlos.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyMutation, applyBatch, type ServerScorecardState } from '../apply';
import {
  createQueue,
  enqueue,
  generationOf,
  invalidateStaleGenerations,
  markStale,
  nextBatch,
  operationOf,
  prepareLogout,
  queueStats,
  type HoleMutation,
} from '../queue';
import {
  canFinish,
  computeTotals,
  deriveStatus,
  resolveHole,
  resolveScorecard,
  type HoleScoreInput,
} from '../../golf/stableford';
import { allocateStrokes } from '../../golf/strokes';
import { ULZAMA_HOLES } from '../../golf/course';

const OWNER = 'user-1';
const DEVICE = 'device-a';

function state(overrides: Partial<ServerScorecardState> = {}): ServerScorecardState {
  return {
    id: 'card-1',
    ownerUserId: OWNER,
    version: 5,
    status: 'IN_PLAY',
    allocationVersion: 1,
    holes: {
      7: {
        grossStrokes: 6,
        isPickup: false,
        isOverridden: false,
        serverVersion: 5,
        lastWriterClientId: DEVICE,
      },
    },
    ...overrides,
  };
}

function clearMutation(overrides: Partial<HoleMutation> = {}): HoleMutation {
  return {
    clientMutationId: 'm-clear-1',
    clientId: DEVICE,
    userId: OWNER,
    scorecardId: 'card-1',
    holeNumber: 7,
    operation: 'CLEAR',
    grossStrokes: null,
    isPickup: false,
    baseVersion: 5,
    scoreGeneration: 0,
    createdAtLocal: '2026-06-13T10:00:00.000Z',
    ...overrides,
  };
}

const PLAYER = { actorUserId: OWNER, actorRole: 'PLAYER' as const };

describe('vacio no es raya', () => {
  const hole = ULZAMA_HOLES[4]; // hoyo 5, par 5

  test('un hoyo vacio no cuenta como jugado y no da puntos', () => {
    const vacio = resolveHole(hole, 2, {
      holeNumber: 5,
      grossStrokes: null,
      isPickup: false,
    });
    assert.equal(vacio.grossStrokes, null);
    assert.equal(vacio.isPickup, false);
    assert.equal(vacio.stablefordPoints, 0);
    assert.equal(vacio.netStrokes, null);
  });

  test('una raya cuenta como jugada, vale 0 y es un resultado valido', () => {
    const raya = resolveHole(hole, 2, { holeNumber: 5, grossStrokes: null, isPickup: true });
    assert.equal(raya.isPickup, true);
    assert.equal(raya.stablefordPoints, 0);
  });

  test('los totales cuentan la raya y NO el vacio', () => {
    const conRaya = computeTotals([
      resolveHole(hole, 2, { holeNumber: 5, grossStrokes: null, isPickup: true }),
    ]);
    const conVacio = computeTotals([
      resolveHole(hole, 2, { holeNumber: 5, grossStrokes: null, isPickup: false }),
    ]);

    assert.equal(conRaya.total.holesPlayed, 1);
    assert.equal(conRaya.total.pickups, 1);
    assert.equal(conVacio.total.holesPlayed, 0);
    assert.equal(conVacio.total.pickups, 0);
  });

  test('un hoyo vacio impide finalizar la tarjeta y una raya no', () => {
    const strokes = new Map(
      allocateStrokes(20, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]),
    );

    const conTodo = (valor: HoleScoreInput) => {
      const inputs = new Map<number, HoleScoreInput>();
      for (const h of ULZAMA_HOLES) {
        inputs.set(h.holeNumber, { holeNumber: h.holeNumber, grossStrokes: 5, isPickup: false });
      }
      inputs.set(valor.holeNumber, valor);
      return resolveScorecard(ULZAMA_HOLES, strokes, inputs);
    };

    const conRaya = conTodo({ holeNumber: 7, grossStrokes: null, isPickup: true });
    assert.equal(canFinish(conRaya).ok, true);

    const conVacio = conTodo({ holeNumber: 7, grossStrokes: null, isPickup: false });
    assert.equal(canFinish(conVacio).ok, false);
    assert.deepEqual(canFinish(conVacio).missingHoles, [7]);
  });

  test('borrar el ultimo resultado devuelve la tarjeta a Sin comenzar', () => {
    const strokes = new Map(
      allocateStrokes(20, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]),
    );
    const vacia = resolveScorecard(ULZAMA_HOLES, strokes, new Map());
    assert.equal(deriveStatus(vacia, false, false, false), 'NOT_STARTED');
  });

  test('con otros resultados la tarjeta se queda En juego', () => {
    const strokes = new Map(
      allocateStrokes(20, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]),
    );
    const inputs = new Map<number, HoleScoreInput>([
      [1, { holeNumber: 1, grossStrokes: 5, isPickup: false }],
    ]);
    const results = resolveScorecard(ULZAMA_HOLES, strokes, inputs);
    assert.equal(deriveStatus(results, false, false, false), 'IN_PLAY');
  });

  test('una tarjeta completa y confirmada deja de estar finalizada al vaciarse un hoyo', () => {
    const strokes = new Map(
      allocateStrokes(20, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]),
    );
    const inputs = new Map<number, HoleScoreInput>();
    for (const h of ULZAMA_HOLES) {
      inputs.set(h.holeNumber, { holeNumber: h.holeNumber, grossStrokes: 5, isPickup: false });
    }
    assert.equal(deriveStatus(resolveScorecard(ULZAMA_HOLES, strokes, inputs), true, false, false), 'FINISHED');

    inputs.set(7, { holeNumber: 7, grossStrokes: null, isPickup: false });
    assert.equal(
      deriveStatus(resolveScorecard(ULZAMA_HOLES, strokes, inputs), true, false, false),
      'IN_PLAY',
      'con un hueco no puede seguir finalizada',
    );
  });
});

describe('borrar un resultado: autorizacion', () => {
  test('el jugador puede borrar un resultado propio', () => {
    const outcome = applyMutation(state(), clearMutation(), new Set(), PLAYER);
    assert.equal(outcome.type, 'APPLIED');
  });

  test('no puede borrar el de otro jugador', () => {
    const outcome = applyMutation(
      state({ ownerUserId: 'otro' }),
      clearMutation(),
      new Set(),
      PLAYER,
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') assert.equal(outcome.code, 'NOT_OWNER');
  });

  test('no puede borrar en una tarjeta bloqueada', () => {
    const outcome = applyMutation(
      state({ status: 'LOCKED' }),
      clearMutation(),
      new Set(),
      PLAYER,
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') assert.equal(outcome.code, 'CARD_LOCKED');
  });

  test('no puede borrar con la competicion cerrada', () => {
    const outcome = applyMutation(state(), clearMutation(), new Set(), {
      ...PLAYER,
      competitionClosed: true,
    });
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') assert.equal(outcome.code, 'COMPETITION_CLOSED');
  });

  test('borrar NO amplia permisos: el administrador conserva los suyos', () => {
    const outcome = applyMutation(state({ status: 'LOCKED' }), clearMutation(), new Set(), {
      actorUserId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(outcome.type, 'APPLIED');
  });

  test('un jugador no puede pisar una correccion administrativa borrandola', () => {
    const conCorreccion = state({
      holes: {
        7: {
          grossStrokes: 6,
          isPickup: false,
          isOverridden: true,
          serverVersion: 5,
          lastWriterClientId: null,
        },
      },
    });
    const outcome = applyMutation(conCorreccion, clearMutation(), new Set(), PLAYER);
    assert.equal(outcome.type, 'CONFLICT');
    if (outcome.type === 'CONFLICT') {
      assert.equal(outcome.conflict.reason, 'ADMIN_OVERRIDE');
    }
  });
});

describe('borrar un resultado: efecto y auditoria', () => {
  test('el hoyo queda vacio, no en raya', () => {
    const outcome = applyMutation(state(), clearMutation(), new Set(), PLAYER);
    assert.equal(outcome.type, 'APPLIED');
    if (outcome.type !== 'APPLIED') return;

    const hoyo = outcome.state.holes[7];
    assert.equal(hoyo.grossStrokes, null);
    assert.equal(hoyo.isPickup, false, 'un resultado borrado NO se convierte en raya');
  });

  test('el registro del hoyo se conserva con quien lo toco y con que version', () => {
    // Si se borrase la entrada, otro dispositivo con una version antigua podria
    // escribir encima sin que nadie lo marcase como conflicto.
    const outcome = applyMutation(state(), clearMutation(), new Set(), PLAYER);
    if (outcome.type !== 'APPLIED') throw new Error('deberia aplicarse');

    assert.equal(outcome.state.holes[7].serverVersion, 6);
    assert.equal(outcome.state.holes[7].lastWriterClientId, DEVICE);
    assert.equal(outcome.version, 6, 'la version de la tarjeta sube');
  });

  test('la auditoria distingue borrar de escribir', () => {
    const outcome = applyMutation(state(), clearMutation(), new Set(), PLAYER);
    if (outcome.type !== 'APPLIED') throw new Error('deberia aplicarse');

    assert.equal(outcome.audit.action, 'HOLE_SCORE_CLEARED');
    assert.deepEqual(outcome.audit.beforeData, { grossStrokes: 6, isPickup: false });
    assert.deepEqual(outcome.audit.afterData, {
      grossStrokes: null,
      isPickup: false,
      cleared: true,
    });
  });

  test('una operacion de borrado con golpes dentro es un estado imposible', () => {
    const outcome = applyMutation(
      state(),
      clearMutation({ grossStrokes: 4 }),
      new Set(),
      PLAYER,
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') assert.equal(outcome.code, 'INVALID_STROKES');
  });

  test('una operacion de borrado marcada como raya tambien', () => {
    const outcome = applyMutation(
      state(),
      clearMutation({ isPickup: true }),
      new Set(),
      PLAYER,
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') assert.equal(outcome.code, 'INVALID_STROKES');
  });

  test('borrar es idempotente: reenviarlo no da error ni duplica', () => {
    const primero = applyMutation(state(), clearMutation(), new Set(), PLAYER);
    assert.equal(primero.type, 'APPLIED');

    const reenvio = applyMutation(
      state(),
      clearMutation(),
      new Set(['m-clear-1']),
      PLAYER,
    );
    assert.equal(reenvio.type, 'DUPLICATE');
  });

  test('borrar un hoyo que no tiene nada no falla', () => {
    const outcome = applyMutation(
      state({ holes: {} }),
      clearMutation(),
      new Set(),
      PLAYER,
    );
    assert.equal(outcome.type, 'APPLIED');
    if (outcome.type === 'APPLIED') assert.equal(outcome.audit.beforeData, null);
  });

  test('escribir despues de borrar vuelve a dejar el resultado', () => {
    const borrado = applyMutation(state(), clearMutation(), new Set(), PLAYER);
    if (borrado.type !== 'APPLIED') throw new Error('deberia aplicarse');

    const escrito = applyMutation(
      borrado.state,
      {
        ...clearMutation({
          clientMutationId: 'm-write-1',
          operation: 'WRITE',
          grossStrokes: 5,
          baseVersion: borrado.version,
        }),
      },
      new Set(['m-clear-1']),
      PLAYER,
    );

    assert.equal(escrito.type, 'APPLIED');
    if (escrito.type === 'APPLIED') {
      assert.equal(escrito.state.holes[7].grossStrokes, 5);
    }
  });
});

describe('conflicto al borrar', () => {
  test('otro dispositivo escribio despues: no se sobreescribe en silencio', () => {
    const conOtro = state({
      holes: {
        7: {
          grossStrokes: 4,
          isPickup: false,
          isOverridden: false,
          serverVersion: 9,
          lastWriterClientId: 'device-b',
        },
      },
    });

    const outcome = applyMutation(conOtro, clearMutation({ baseVersion: 5 }), new Set(), PLAYER);
    assert.equal(outcome.type, 'CONFLICT');
    if (outcome.type === 'CONFLICT') {
      assert.equal(outcome.conflict.reason, 'OTHER_DEVICE');
      // El conflicto lleva los dos valores para poder ensenarlos.
      assert.deepEqual(outcome.conflict.serverValue, { grossStrokes: 4, isPickup: false });
      assert.deepEqual(outcome.conflict.localValue, { grossStrokes: null, isPickup: false });
    }
  });

  test('el mismo dispositivo corrigiendose no genera conflicto', () => {
    const mismo = state({
      holes: {
        7: {
          grossStrokes: 4,
          isPickup: false,
          isOverridden: false,
          serverVersion: 9,
          lastWriterClientId: DEVICE,
        },
      },
    });
    const outcome = applyMutation(mismo, clearMutation({ baseVersion: 5 }), new Set(), PLAYER);
    assert.equal(outcome.type, 'APPLIED');
  });
});

describe('guardia contra datos offline anteriores a un vaciado', () => {
  test('una operacion de una generacion anterior se rechaza', () => {
    const outcome = applyMutation(state(), clearMutation({ scoreGeneration: 0 }), new Set(), {
      ...PLAYER,
      competitionScoreGeneration: 1,
    });

    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') {
      assert.equal(outcome.code, 'STALE_GENERATION');
      assert.match(outcome.message, /vaciado las tarjetas/);
    }
  });

  test('una escritura de una generacion anterior tampoco resucita un resultado', () => {
    const outcome = applyMutation(
      state({ holes: {} }),
      clearMutation({
        clientMutationId: 'm-vieja',
        operation: 'WRITE',
        grossStrokes: 7,
        scoreGeneration: 0,
      }),
      new Set(),
      { ...PLAYER, competitionScoreGeneration: 2 },
    );

    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') assert.equal(outcome.code, 'STALE_GENERATION');
  });

  test('el rechazo ocurre antes de la autorizacion y de la validacion', () => {
    // Una operacion obsoleta Y mal formada tiene que reportarse como obsoleta:
    // es la causa real, y el jugador necesita saber que hubo un vaciado.
    const outcome = applyMutation(
      state(),
      clearMutation({ grossStrokes: 99, scoreGeneration: 0 }),
      new Set(),
      { ...PLAYER, competitionScoreGeneration: 1 },
    );
    assert.equal(outcome.type, 'REJECTED');
    if (outcome.type === 'REJECTED') assert.equal(outcome.code, 'STALE_GENERATION');
  });

  test('la generacion actual pasa sin problema', () => {
    const outcome = applyMutation(state(), clearMutation({ scoreGeneration: 1 }), new Set(), {
      ...PLAYER,
      competitionScoreGeneration: 1,
    });
    assert.equal(outcome.type, 'APPLIED');
  });

  test('sin generacion declarada en el contexto, el comportamiento no cambia', () => {
    // Es lo que mantiene compatible cualquier llamada que no tenga el dato.
    const outcome = applyMutation(state(), clearMutation({ scoreGeneration: 0 }), new Set(), PLAYER);
    assert.equal(outcome.type, 'APPLIED');
  });

  test('un lote mezclado aplica lo nuevo y rechaza lo viejo', () => {
    const result = applyBatch(
      state({ holes: {} }),
      [
        clearMutation({
          clientMutationId: 'vieja',
          operation: 'WRITE',
          grossStrokes: 5,
          holeNumber: 3,
          scoreGeneration: 0,
        }),
        clearMutation({
          clientMutationId: 'nueva',
          operation: 'WRITE',
          grossStrokes: 4,
          holeNumber: 4,
          scoreGeneration: 1,
        }),
      ],
      new Set(),
      { ...PLAYER, competitionScoreGeneration: 1 },
    );

    assert.equal(result.outcomes[0].type, 'REJECTED');
    assert.equal(result.outcomes[1].type, 'APPLIED');
    assert.deepEqual(result.appliedIds, ['nueva']);
    assert.equal(
      result.settledIds.includes('vieja'),
      false,
      'una operacion rechazada no se retira de la cola sin avisar',
    );
  });
});

describe('la cola del movil ante un vaciado', () => {
  const mutation = (id: string, hole: number, generation: number): HoleMutation =>
    clearMutation({
      clientMutationId: id,
      holeNumber: hole,
      operation: 'WRITE',
      grossStrokes: 5,
      scoreGeneration: generation,
    });

  test('los valores por omision mantienen legible una cola de la version anterior', () => {
    const antigua = {
      clientMutationId: 'vieja',
      clientId: DEVICE,
      userId: OWNER,
      scorecardId: 'card-1',
      holeNumber: 7,
      grossStrokes: 5,
      isPickup: false,
      baseVersion: 3,
      createdAtLocal: '2026-06-13T10:00:00.000Z',
    } as HoleMutation;

    assert.equal(operationOf(antigua), 'WRITE');
    assert.equal(generationOf(antigua), 0);
  });

  test('las operaciones de generaciones anteriores se marcan como obsoletas', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation('a', 3, 0));
    queue = enqueue(queue, mutation('b', 4, 0));
    queue = enqueue(queue, mutation('c', 5, 1));

    const result = invalidateStaleGenerations(queue, 1);

    assert.equal(result.invalidated, 2);
    assert.deepEqual(result.holes, [3, 4]);
    assert.equal(queueStats(result.queue).stale, 2);
    assert.equal(queueStats(result.queue).pending, 1);
  });

  test('una obsoleta no se envia nunca mas', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation('a', 3, 0));
    queue = enqueue(queue, mutation('b', 4, 1));

    const { queue: limpia } = invalidateStaleGenerations(queue, 1);
    const batch = nextBatch(limpia);

    assert.deepEqual(
      batch.map((item) => item.mutation.clientMutationId),
      ['b'],
      'solo sube la de la generacion vigente',
    );
  });

  test('una obsoleta NO detiene la cola de lo que venga detras', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation('vieja', 3, 0));
    queue = enqueue(queue, mutation('nueva1', 4, 1));
    queue = enqueue(queue, mutation('nueva2', 5, 1));

    const { queue: limpia } = invalidateStaleGenerations(queue, 1);
    assert.deepEqual(
      nextBatch(limpia).map((item) => item.mutation.clientMutationId),
      ['nueva1', 'nueva2'],
    );
  });

  test('no se borran: quedan marcadas y con el motivo, para poder avisar', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation('a', 3, 0));

    const { queue: limpia } = invalidateStaleGenerations(queue, 1);
    const item = limpia.items.find((i) => i.mutation.clientMutationId === 'a');

    assert.ok(item, 'la operacion sigue en la cola');
    assert.equal(item.status, 'STALE');
    assert.match(item.lastError ?? '', /vaciado las tarjetas/);
  });

  test('lo ya aplicado o en conflicto no se reescribe', () => {
    let queue = createQueue();
    queue = enqueue(queue, mutation('a', 3, 0));
    queue = markStale(queue, 'a', 'manual');
    const { invalidated } = invalidateStaleGenerations(queue, 5);
    assert.equal(invalidated, 0, 'ya estaba marcada: no se cuenta dos veces');
  });

  test('una operacion obsoleta no bloquea el cierre de sesion', () => {
    // No esta pendiente de enviar: no hay nada que perder al salir.
    let queue = createQueue();
    queue = enqueue(queue, mutation('a', 3, 0));
    const { queue: limpia } = invalidateStaleGenerations(queue, 1);

    const logout = prepareLogout(limpia, OWNER);
    assert.equal(logout.safeToClear, true);
    assert.equal(logout.unsentCount, 0);
  });
});
