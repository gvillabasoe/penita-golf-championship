import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryStore } from '../port';
import {
  QUEUE_SCHEMA_VERSION,
  QueueStore,
  usersWithStoredQueue,
} from '../queue-store';
import { markApplied, nextBatch, queueStats, type HoleMutation } from '../../sync/queue';

const mutation = (overrides: Partial<HoleMutation> = {}): HoleMutation => ({
  clientMutationId: `m-${overrides.holeNumber ?? 1}`,
  clientId: 'movil-gonzalo',
  userId: 'u1',
  scorecardId: 'sc1',
  holeNumber: 1,
  grossStrokes: 5,
  isPickup: false,
  baseVersion: 0,
  createdAtLocal: '2026-06-13T09:00:00.000Z',
  ...overrides,
});

const fixedNow = () => new Date('2026-06-13T09:00:00Z');

describe('el hoyo confirmado no se pierde', () => {
  test('al volver de enqueue el resultado ya esta escrito', async () => {
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);

    await queueStore.enqueue(mutation({ holeNumber: 7, grossStrokes: 6 }));

    // Se simula un cierre de la app: un QueueStore nuevo sobre el mismo almacen.
    const trasReinicio = new QueueStore(store, 'u1', fixedNow);
    const outcome = await trasReinicio.load();

    assert.equal(outcome.status, 'LOADED');
    assert.equal(outcome.queue.items.length, 1);
    assert.equal(outcome.queue.items[0].mutation.holeNumber, 7);
    assert.equal(outcome.queue.items[0].mutation.grossStrokes, 6);
  });

  test('dieciocho hoyos sobreviven al reinicio, en orden', async () => {
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);

    for (let hole = 1; hole <= 18; hole += 1) {
      await queueStore.enqueue(mutation({ clientMutationId: `h${hole}`, holeNumber: hole }));
    }

    const outcome = await new QueueStore(store, 'u1', fixedNow).load();
    assert.equal(outcome.queue.items.length, 18);
    assert.deepEqual(
      outcome.queue.items.map((i) => i.mutation.holeNumber),
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
    assert.deepEqual(
      outcome.queue.items.map((i) => i.sequence),
      Array.from({ length: 18 }, (_, i) => i + 1),
    );
  });

  test('dos confirmaciones simultaneas no se pisan', async () => {
    // Sin update atomico, las dos leerian la misma cola y la segunda escritura
    // borraria la primera: un hoyo confirmado desapareceria en silencio.
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);

    await Promise.all([
      queueStore.enqueue(mutation({ clientMutationId: 'a', holeNumber: 7 })),
      queueStore.enqueue(mutation({ clientMutationId: 'b', holeNumber: 8 })),
    ]);

    const outcome = await queueStore.load();
    assert.equal(outcome.queue.items.length, 2, 'se ha perdido una operacion');
    assert.deepEqual(
      outcome.queue.items.map((i) => i.mutation.clientMutationId).sort(),
      ['a', 'b'],
    );
    // Las secuencias no se repiten: el orden de envio sigue siendo determinista.
    assert.equal(new Set(outcome.queue.items.map((i) => i.sequence)).size, 2);
  });

  test('nueve confirmaciones a la vez no pierden ninguna', async () => {
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);

    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        queueStore.enqueue(mutation({ clientMutationId: `h${i}`, holeNumber: i + 1 })),
      ),
    );

    const outcome = await queueStore.load();
    assert.equal(outcome.queue.items.length, 9);
    assert.equal(new Set(outcome.queue.items.map((i) => i.sequence)).size, 9);
  });

  test('el mismo clientMutationId no se duplica ni al reintentar la interfaz', async () => {
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);
    const m = mutation({ clientMutationId: 'mismo' });

    await queueStore.enqueue(m);
    await queueStore.enqueue(m);
    await queueStore.enqueue(m);

    const outcome = await queueStore.load();
    assert.equal(outcome.queue.items.length, 1);
  });
});

describe('recuperacion de datos ilegibles', () => {
  test('un JSON corrupto se aparta en cuarentena, no se borra', async () => {
    const store = new MemoryStore();
    await store.set('pgc:queue:u1', '{esto no es json');

    const queueStore = new QueueStore(store, 'u1', fixedNow);
    const outcome = await queueStore.load();

    assert.equal(outcome.status, 'RECOVERED');
    if (outcome.status !== 'RECOVERED') return;
    assert.equal(outcome.reason, 'CORRUPT');
    assert.equal(outcome.queue.items.length, 0);

    // El dato original sigue disponible: puede haber hoyos ahi dentro.
    const quarantined = await store.get(outcome.quarantineKey);
    assert.equal(quarantined, '{esto no es json');
    assert.deepEqual(await queueStore.quarantinedKeys(), [outcome.quarantineKey]);
  });

  test('una version de formato desconocida NO se tira', async () => {
    // Caso real de un despliegue: el jugador tiene la app vieja abierta con
    // hoyos pendientes y recibe la nueva. Esos hoyos solo existen en su movil.
    const store = new MemoryStore();
    await store.set(
      'pgc:queue:u1',
      JSON.stringify({ schemaVersion: 99, savedAt: 'x', queue: { items: [], nextSequence: 1 } }),
    );

    const outcome = await new QueueStore(store, 'u1', fixedNow).load();
    assert.equal(outcome.status, 'RECOVERED');
    if (outcome.status !== 'RECOVERED') return;
    assert.equal(outcome.reason, 'UNKNOWN_VERSION');
    assert.match(outcome.message, /version 99/);
    assert.match(outcome.message, /solo existan en este movil/);
    assert.ok(await store.get(outcome.quarantineKey));
  });

  test('una cola con forma incorrecta se aparta igual', async () => {
    const store = new MemoryStore();
    await store.set(
      'pgc:queue:u1',
      JSON.stringify({ schemaVersion: QUEUE_SCHEMA_VERSION, savedAt: 'x', queue: { items: 'no' } }),
    );
    const outcome = await new QueueStore(store, 'u1', fixedNow).load();
    assert.equal(outcome.status, 'RECOVERED');
  });

  test('un dato sin version tampoco se da por bueno', async () => {
    const store = new MemoryStore();
    await store.set('pgc:queue:u1', JSON.stringify({ items: [], nextSequence: 1 }));
    const outcome = await new QueueStore(store, 'u1', fixedNow).load();
    assert.equal(outcome.status, 'RECOVERED');
  });

  test('un almacen vacio arranca limpio sin avisos', async () => {
    const outcome = await new QueueStore(new MemoryStore(), 'u1', fixedNow).load();
    assert.equal(outcome.status, 'EMPTY');
    assert.equal(outcome.queue.items.length, 0);
    assert.equal(outcome.queue.nextSequence, 1);
  });

  test('load nunca lanza, con cualquier basura guardada', async () => {
    // 'null' es el caso que rompio la primera version: JSON.parse devuelve null
    // y el acceso a .schemaVersion lanzaba. La asercion de tipos lo ocultaba.
    for (const basura of ['', 'null', '[]', '0', '"texto"', 'true', '{"schemaVersion":null}', '{}', '\u0000']) {
      const store = new MemoryStore();
      await store.set('pgc:queue:u1', basura);
      await assert.doesNotReject(() => new QueueStore(store, 'u1', fixedNow).load(), `falla con ${JSON.stringify(basura)}`);
    }
  });
});

describe('los datos de dos usuarios no se mezclan', () => {
  test('cada usuario tiene su propio espacio', async () => {
    const store = new MemoryStore();
    const gonzalo = new QueueStore(store, 'gonzalo', fixedNow);
    const alfonso = new QueueStore(store, 'alfonso', fixedNow);

    await gonzalo.enqueue(mutation({ clientMutationId: 'g1', userId: 'gonzalo', holeNumber: 7 }));
    await alfonso.enqueue(mutation({ clientMutationId: 'a1', userId: 'alfonso', holeNumber: 12 }));

    const deGonzalo = await gonzalo.load();
    const deAlfonso = await alfonso.load();

    assert.equal(deGonzalo.queue.items.length, 1);
    assert.equal(deGonzalo.queue.items[0].mutation.holeNumber, 7);
    assert.equal(deAlfonso.queue.items.length, 1);
    assert.equal(deAlfonso.queue.items[0].mutation.holeNumber, 12);
  });

  test('encolar la operacion de otro usuario se rechaza', async () => {
    const store = new MemoryStore();
    const gonzalo = new QueueStore(store, 'gonzalo', fixedNow);
    await assert.rejects(
      () => gonzalo.enqueue(mutation({ userId: 'alfonso' })),
      /no se mezclan/,
    );
  });

  test('cerrar sesion borra lo del usuario que sale y solo eso', async () => {
    // El movil del organizador va a pasar de mano en mano el dia del torneo.
    const store = new MemoryStore();
    const gonzalo = new QueueStore(store, 'gonzalo', fixedNow);
    const alfonso = new QueueStore(store, 'alfonso', fixedNow);

    await gonzalo.enqueue(mutation({ clientMutationId: 'g1', userId: 'gonzalo' }));
    await alfonso.enqueue(mutation({ clientMutationId: 'a1', userId: 'alfonso' }));

    await gonzalo.clearForLogout();

    assert.equal((await gonzalo.load()).status, 'EMPTY');
    assert.equal((await alfonso.load()).queue.items.length, 1, 'se han borrado datos ajenos');
  });

  test('la cuarentena sobrevive al cierre de sesion', async () => {
    // Si hay resultados apartados, el administrador tiene que poder recuperarlos.
    const store = new MemoryStore();
    await store.set('pgc:queue:u1', 'corrupto');
    const queueStore = new QueueStore(store, 'u1', fixedNow);
    const outcome = await queueStore.load();
    assert.equal(outcome.status, 'RECOVERED');

    await queueStore.clearForLogout();
    assert.equal((await queueStore.quarantinedKeys()).length, 1);
  });

  test('se puede saber que usuarios tienen cola en este dispositivo', async () => {
    const store = new MemoryStore();
    await new QueueStore(store, 'gonzalo', fixedNow).enqueue(
      mutation({ clientMutationId: 'g', userId: 'gonzalo' }),
    );
    await new QueueStore(store, 'alfonso', fixedNow).enqueue(
      mutation({ clientMutationId: 'a', userId: 'alfonso' }),
    );
    assert.deepEqual(await usersWithStoredQueue(store), ['alfonso', 'gonzalo']);
  });
});

describe('ciclo completo con la cola', () => {
  test('encolar, enviar, marcar aplicada y persistir el resultado', async () => {
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);

    await queueStore.enqueue(mutation({ clientMutationId: 'h7', holeNumber: 7 }), 1000);
    await queueStore.enqueue(mutation({ clientMutationId: 'h8', holeNumber: 8 }), 1000);

    const cargada = (await queueStore.load()).queue;
    const lote = nextBatch(cargada, 2000);
    assert.equal(lote.length, 2);

    // El servidor confirma la primera.
    const tras = await queueStore.mutate((queue) => markApplied(queue, 'h7'));
    assert.equal(queueStats(tras).pending, 1);

    // Y sobrevive al reinicio.
    const despues = await new QueueStore(store, 'u1', fixedNow).load();
    const aplicada = despues.queue.items.find((i) => i.mutation.clientMutationId === 'h7');
    assert.equal(aplicada?.status, 'APPLIED');
  });

  test('las mutaciones concurrentes sobre la cola tampoco se pisan', async () => {
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);
    for (let i = 1; i <= 5; i += 1) {
      await queueStore.enqueue(mutation({ clientMutationId: `h${i}`, holeNumber: i }));
    }

    await Promise.all([
      queueStore.mutate((q) => markApplied(q, 'h1')),
      queueStore.mutate((q) => markApplied(q, 'h2')),
      queueStore.mutate((q) => markApplied(q, 'h3')),
    ]);

    const final = (await queueStore.load()).queue;
    const aplicadas = final.items.filter((i) => i.status === 'APPLIED');
    assert.equal(aplicadas.length, 3, 'una marca se ha perdido');
  });

  test('guardar y cargar es reversible: nada se altera al pasar por JSON', async () => {
    const store = new MemoryStore();
    const queueStore = new QueueStore(store, 'u1', fixedNow);
    const original = mutation({
      clientMutationId: 'raya-7',
      holeNumber: 7,
      grossStrokes: null,
      isPickup: true,
      baseVersion: 4,
    });

    await queueStore.enqueue(original, 1234);
    const recuperada = (await queueStore.load()).queue.items[0].mutation;

    assert.deepEqual(recuperada, original);
    assert.equal(recuperada.grossStrokes, null, 'una raya no puede volver como 0');
    assert.equal(recuperada.isPickup, true);
  });
});

describe('guardas del constructor', () => {
  test('exige un userId', () => {
    assert.throws(() => new QueueStore(new MemoryStore(), ''));
    assert.throws(() => new QueueStore(new MemoryStore(), '   '));
  });
});

describe('almacen en memoria', () => {
  test('los update sobre la misma clave se serializan', async () => {
    const store = new MemoryStore();
    await store.set('contador', '0');
    await Promise.all(
      Array.from({ length: 50 }, () =>
        store.update('contador', (current) => String(Number(current ?? '0') + 1)),
      ),
    );
    assert.equal(await store.get('contador'), '50', 'se han perdido incrementos');
  });

  test('un update que falla no rompe el orden de los siguientes', async () => {
    const store = new MemoryStore();
    await store.set('k', 'a');
    await assert.rejects(() =>
      store.update('k', () => {
        throw new Error('fallo');
      }),
    );
    assert.equal(await store.update('k', (c) => `${c}b`), 'ab');
  });

  test('filtra claves por prefijo y las devuelve ordenadas', async () => {
    const store = new MemoryStore();
    await store.set('pgc:queue:b', '1');
    await store.set('pgc:queue:a', '1');
    await store.set('otra:cosa', '1');
    assert.deepEqual(await store.keys('pgc:queue:'), ['pgc:queue:a', 'pgc:queue:b']);
    assert.equal((await store.keys()).length, 3);
  });
});
