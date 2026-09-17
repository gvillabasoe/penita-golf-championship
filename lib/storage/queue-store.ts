/**
 * Persistencia de la cola offline.
 *
 * Tres reglas que gobiernan este archivo, todas del pliego:
 *
 *  1. Ningun hoyo confirmado se pierde (seccion 41). De ahi que se escriba
 *     ANTES de intentar la red, que las escrituras sean atomicas y que un dato
 *     ilegible se ponga en cuarentena en vez de tirarse.
 *  2. Los datos de un usuario no se mezclan con los de otro en el mismo
 *     dispositivo (seccion 12). De ahi el espacio de nombres por usuario.
 *  3. Al cerrar sesion se limpia lo del usuario que sale, y solo lo suyo.
 */

import { createQueue, type HoleMutation, type Queue, type QueueItem } from '../sync/queue';

/**
 * Version del formato almacenado.
 *
 * Subirla NO borra nada. Si un movil tiene operaciones pendientes en un formato
 * que esta version no entiende, se ponen en cuarentena y se avisa, porque dentro
 * puede haber hoyos que solo existen ahi. Borrarlas seria perder resultados.
 */
export const QUEUE_SCHEMA_VERSION = 1;

const KEY_PREFIX = 'pgc:queue:';
const QUARANTINE_PREFIX = 'pgc:quarantine:';

export interface StoredQueue {
  schemaVersion: number;
  savedAt: string;
  queue: Queue;
}

export type LoadOutcome =
  | { status: 'EMPTY'; queue: Queue }
  | { status: 'LOADED'; queue: Queue }
  | {
      status: 'RECOVERED';
      queue: Queue;
      /** Clave de cuarentena donde quedo el dato original. */
      quarantineKey: string;
      reason: 'CORRUPT' | 'UNKNOWN_VERSION';
      message: string;
    };

function queueKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function isQueueShape(value: unknown): value is Queue {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { items?: unknown; nextSequence?: unknown };
  if (!Array.isArray(candidate.items)) return false;
  if (typeof candidate.nextSequence !== 'number') return false;
  return candidate.items.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const entry = item as QueueItem;
    return (
      typeof entry.sequence === 'number' &&
      typeof entry.attempts === 'number' &&
      typeof entry.status === 'string' &&
      typeof entry.mutation === 'object' &&
      entry.mutation !== null &&
      typeof entry.mutation.clientMutationId === 'string' &&
      typeof entry.mutation.holeNumber === 'number'
    );
  });
}

type ReadResult =
  | { ok: true; queue: Queue }
  | { ok: false; reason: 'CORRUPT' | 'UNKNOWN_VERSION'; detail: string };

/**
 * Interpreta el dato guardado. Un solo sitio para todas las comprobaciones.
 *
 * Antes esto estaba repetido en `load`, `enqueue` y `mutate`, y el valor
 * `"null"` hacia que `JSON.parse` devolviese `null` y el acceso a
 * `.schemaVersion` lanzase. La asercion `as Partial<StoredQueue>` ocultaba el
 * fallo al compilador: TypeScript se creia que era un objeto.
 */
function readStored(raw: string): ReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'CORRUPT', detail: 'no es JSON valido' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'CORRUPT', detail: 'no es un objeto' };
  }

  const candidate = parsed as Partial<StoredQueue>;

  if (typeof candidate.schemaVersion !== 'number') {
    return { ok: false, reason: 'CORRUPT', detail: 'sin version de formato' };
  }
  if (candidate.schemaVersion !== QUEUE_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'UNKNOWN_VERSION',
      detail: String(candidate.schemaVersion),
    };
  }
  if (!isQueueShape(candidate.queue)) {
    return { ok: false, reason: 'CORRUPT', detail: 'la cola no tiene la forma esperada' };
  }

  return { ok: true, queue: candidate.queue };
}

export class QueueStore {
  constructor(
    private readonly store: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<void>;
      delete(key: string): Promise<void>;
      keys(prefix?: string): Promise<string[]>;
      update(key: string, updater: (current: string | null) => string): Promise<string>;
    },
    private readonly userId: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (userId.trim() === '') throw new Error('QueueStore necesita un userId.');
  }

  get key(): string {
    return queueKey(this.userId);
  }

  private serialize(queue: Queue): string {
    const payload: StoredQueue = {
      schemaVersion: QUEUE_SCHEMA_VERSION,
      savedAt: this.now().toISOString(),
      queue,
    };
    return JSON.stringify(payload);
  }

  /**
   * Carga la cola. Nunca lanza y nunca devuelve `null`: si el dato guardado no
   * se puede interpretar, lo aparta y arranca limpio informando de donde quedo.
   */
  async load(): Promise<LoadOutcome> {
    const raw = await this.store.get(this.key);
    if (raw === null) return { status: 'EMPTY', queue: createQueue() };

    const quarantine = async (
      reason: 'CORRUPT' | 'UNKNOWN_VERSION',
      message: string,
    ): Promise<LoadOutcome> => {
      const quarantineKey = `${QUARANTINE_PREFIX}${this.userId}:${this.now().toISOString()}`;
      await this.store.set(quarantineKey, raw);
      await this.store.delete(this.key);
      return { status: 'RECOVERED', queue: createQueue(), quarantineKey, reason, message };
    };

    const result = readStored(raw);

    if (!result.ok) {
      if (result.reason === 'UNKNOWN_VERSION') {
        return quarantine(
          'UNKNOWN_VERSION',
          `Hay resultados guardados en un formato de version ${result.detail} y esta app usa la ${QUEUE_SCHEMA_VERSION}. Se han apartado sin borrarlos: pueden contener hoyos que solo existan en este movil.`,
        );
      }
      return quarantine(
        'CORRUPT',
        `Los datos guardados en el movil no se pueden leer (${result.detail}). Se han apartado sin borrarlos: avisa al administrador antes de seguir apuntando.`,
      );
    }

    return { status: 'LOADED', queue: result.queue };
  }

  /** Guarda la cola completa. Se usa tras una sincronizacion. */
  async save(queue: Queue): Promise<void> {
    await this.store.set(this.key, this.serialize(queue));
  }

  /**
   * Anade una operacion de forma atomica.
   *
   * Es el camino critico: se llama al confirmar un hoyo, ANTES de intentar la
   * red. Cuando esta funcion vuelve, el resultado ya no se puede perder aunque
   * el movil se apague.
   */
  async enqueue(mutation: HoleMutation, nowMs = Date.now()): Promise<Queue> {
    if (mutation.userId !== this.userId) {
      throw new Error(
        'La operacion pertenece a otro usuario: los datos no se mezclan en el mismo dispositivo.',
      );
    }

    const serialized = await this.store.update(this.key, (current) => {
      // Dato ilegible: se arranca limpio. `load` lo habra puesto en cuarentena
      // antes, y en el peor caso se pierde el contenido ilegible, nunca el hoyo
      // que se esta confirmando ahora.
      const existing = current === null ? null : readStored(current);
      let queue = existing !== null && existing.ok ? existing.queue : createQueue();

      const yaEsta = queue.items.some(
        (item) => item.mutation.clientMutationId === mutation.clientMutationId,
      );
      if (!yaEsta) {
        queue = {
          items: [
            ...queue.items,
            {
              mutation,
              status: 'PENDING' as const,
              sequence: queue.nextSequence,
              attempts: 0,
              nextAttemptAt: nowMs,
              lastError: null,
            },
          ],
          nextSequence: queue.nextSequence + 1,
        };
      }

      return this.serialize(queue);
    });

    return (JSON.parse(serialized) as StoredQueue).queue;
  }

  /** Modificacion atomica arbitraria: marcar enviada, fallida, en conflicto. */
  async mutate(updater: (queue: Queue) => Queue): Promise<Queue> {
    const serialized = await this.store.update(this.key, (current) => {
      const existing = current === null ? null : readStored(current);
      const queue = existing !== null && existing.ok ? existing.queue : createQueue();
      return this.serialize(updater(queue));
    });

    return (JSON.parse(serialized) as StoredQueue).queue;
  }

  /**
   * Limpieza al cerrar sesion. Borra la cola de ESTE usuario y nada mas.
   *
   * La cuarentena NO se borra: si hay resultados apartados, siguen ahi para que
   * el administrador pueda recuperarlos.
   */
  async clearForLogout(): Promise<void> {
    await this.store.delete(this.key);
  }

  /** Claves de cuarentena de este usuario, para el aviso al administrador. */
  async quarantinedKeys(): Promise<string[]> {
    return this.store.keys(`${QUARANTINE_PREFIX}${this.userId}:`);
  }
}

/** Usuarios con cola guardada en este dispositivo. Diagnostico para el panel. */
export async function usersWithStoredQueue(store: {
  keys(prefix?: string): Promise<string[]>;
}): Promise<string[]> {
  const keys = await store.keys(KEY_PREFIX);
  return keys.map((key) => key.slice(KEY_PREFIX.length));
}
