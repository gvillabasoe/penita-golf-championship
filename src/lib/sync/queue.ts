/**
 * Cola de operaciones sin conexion (seccion 42).
 *
 * Vive en IndexedDB en el movil del jugador. Este modulo contiene solo la
 * logica, sin tocar IndexedDB, para poder probarla entera.
 *
 * El requisito duro de la seccion 41 es: "Ningun hoyo confirmado puede perderse
 * por falta de cobertura". De ahi salen tres decisiones:
 *
 *  1. Cada operacion lleva un `clientMutationId` generado en el movil. El
 *     servidor es idempotente sobre ese id, asi que reenviar es siempre seguro.
 *     Un reintento nunca puede duplicar un resultado.
 *  2. La cola es FIFO y NO se deduplica por hoyo. Si el jugador apunta 5 en el
 *     hoyo 7 y luego lo corrige a 6, se envian las dos operaciones en orden. Es
 *     mas trafico, pero el historial queda completo y la ultima gana sin
 *     depender del reloj del movil, que puede estar mal.
 *  3. Una operacion solo sale de la cola cuando el servidor confirma. Ni al
 *     enviarla, ni al perder la conexion, ni al cerrar la app.
 */

export type MutationStatus = 'PENDING' | 'IN_FLIGHT' | 'APPLIED' | 'CONFLICT' | 'FAILED';

export interface HoleMutation {
  /** Identificador unico generado en el cliente. Base de la idempotencia. */
  clientMutationId: string;
  /**
   * Identificador estable del dispositivo. Es lo que permite distinguir "yo
   * mismo corrigiendo mi hoyo" de "otro dispositivo ha tocado este hoyo", y por
   * tanto evitar conflictos falsos dentro de la propia cola de un movil.
   */
  clientId: string;
  userId: string;
  scorecardId: string;
  holeNumber: number;
  /** null cuando es raya. */
  grossStrokes: number | null;
  isPickup: boolean;
  /** Version de la tarjeta que el cliente tenia al escribir. */
  baseVersion: number;
  /** Reloj local. Solo informativo: no se usa para ordenar ni para resolver. */
  createdAtLocal: string;
}

export interface QueueItem {
  mutation: HoleMutation;
  status: MutationStatus;
  /** Orden de insercion. Es lo que determina el orden de envio. */
  sequence: number;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
}

export interface Queue {
  items: QueueItem[];
  nextSequence: number;
}

export const QUEUE_CONFIG = {
  maxAttempts: 8,
  baseBackoffMs: 1_000,
  maxBackoffMs: 60_000,
  maxBatchSize: 20,
} as const;

export function createQueue(): Queue {
  return { items: [], nextSequence: 1 };
}

/**
 * Anade una operacion. Si el `clientMutationId` ya esta en la cola, no la
 * duplica: el mismo id es la misma operacion, venga de un reintento de la
 * interfaz o de un doble toque en el boton de confirmar.
 */
export function enqueue(queue: Queue, mutation: HoleMutation, now = Date.now()): Queue {
  if (queue.items.some((item) => item.mutation.clientMutationId === mutation.clientMutationId)) {
    return queue;
  }

  const item: QueueItem = {
    mutation,
    status: 'PENDING',
    sequence: queue.nextSequence,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  };

  return { items: [...queue.items, item], nextSequence: queue.nextSequence + 1 };
}

/** Retroceso exponencial con techo. Determinista: la misma entrada da el mismo valor. */
export function backoffFor(attempts: number): number {
  const exponential = QUEUE_CONFIG.baseBackoffMs * 2 ** Math.max(0, attempts - 1);
  return Math.min(exponential, QUEUE_CONFIG.maxBackoffMs);
}

/**
 * Siguiente lote a enviar: operaciones pendientes cuyo momento de reintento ya
 * ha llegado, en orden de insercion.
 *
 * El orden FIFO es estricto y no se salta una operacion bloqueada por backoff:
 * si el hoyo 7 espera para reintentar, el hoyo 8 espera tambien. Enviarlos
 * desordenados podria aplicar una correccion antes que el valor que corrige.
 */
export function nextBatch(queue: Queue, now = Date.now()): QueueItem[] {
  const ordered = [...queue.items].sort((a, b) => a.sequence - b.sequence);
  const batch: QueueItem[] = [];

  for (const item of ordered) {
    if (item.status === 'APPLIED' || item.status === 'CONFLICT') continue;
    if (item.status === 'FAILED') break; // una operacion muerta detiene la cola
    if (item.status === 'IN_FLIGHT') break;
    if (item.nextAttemptAt > now) break; // respeta el backoff y no adelanta nada
    batch.push(item);
    if (batch.length >= QUEUE_CONFIG.maxBatchSize) break;
  }

  return batch;
}

function updateItem(
  queue: Queue,
  clientMutationId: string,
  updater: (item: QueueItem) => QueueItem,
): Queue {
  return {
    ...queue,
    items: queue.items.map((item) =>
      item.mutation.clientMutationId === clientMutationId ? updater(item) : item,
    ),
  };
}

export function markInFlight(queue: Queue, clientMutationId: string): Queue {
  return updateItem(queue, clientMutationId, (item) => ({
    ...item,
    status: 'IN_FLIGHT',
    attempts: item.attempts + 1,
  }));
}

/** El servidor confirmo: la operacion se puede retirar. */
export function markApplied(queue: Queue, clientMutationId: string): Queue {
  return updateItem(queue, clientMutationId, (item) => ({
    ...item,
    status: 'APPLIED',
    lastError: null,
  }));
}

/** Conflicto: no se reintenta. Lo resuelve una persona, no la cola. */
export function markConflict(queue: Queue, clientMutationId: string, detail: string): Queue {
  return updateItem(queue, clientMutationId, (item) => ({
    ...item,
    status: 'CONFLICT',
    lastError: detail,
  }));
}

/** Fallo transitorio: vuelve a PENDING con backoff, o muere tras agotar intentos. */
export function markFailed(
  queue: Queue,
  clientMutationId: string,
  error: string,
  now = Date.now(),
): Queue {
  return updateItem(queue, clientMutationId, (item) => {
    const exhausted = item.attempts >= QUEUE_CONFIG.maxAttempts;
    return {
      ...item,
      status: exhausted ? 'FAILED' : 'PENDING',
      nextAttemptAt: now + backoffFor(item.attempts),
      lastError: error,
    };
  });
}

/** Retira las operaciones ya aplicadas. Se llama tras una sincronizacion limpia. */
export function pruneApplied(queue: Queue): Queue {
  return { ...queue, items: queue.items.filter((item) => item.status !== 'APPLIED') };
}

export interface QueueStats {
  pending: number;
  inFlight: number;
  conflicts: number;
  failed: number;
  hasPermanentFailure: boolean;
  /** Hoyos con escritura pendiente, para marcarlos en la tarjeta. */
  pendingHoles: number[];
}

export function queueStats(queue: Queue): QueueStats {
  const byStatus = (status: MutationStatus) => queue.items.filter((i) => i.status === status);
  const pending = byStatus('PENDING');
  const inFlight = byStatus('IN_FLIGHT');
  const failed = byStatus('FAILED');

  return {
    pending: pending.length,
    inFlight: inFlight.length,
    conflicts: byStatus('CONFLICT').length,
    failed: failed.length,
    hasPermanentFailure: failed.length > 0,
    pendingHoles: [
      ...new Set([...pending, ...inFlight].map((i) => i.mutation.holeNumber)),
    ].sort((a, b) => a - b),
  };
}

/**
 * Limpieza al cerrar sesion (seccion 12).
 *
 * Los datos de un usuario nunca se mezclan con los de otro en el mismo
 * dispositivo, cosa nada teorica: el movil del organizador puede pasar de mano
 * en mano. Si quedan operaciones sin enviar, NO se borran sin avisar: se
 * devuelve la cuenta para que la interfaz pregunte antes.
 */
export function prepareLogout(
  queue: Queue,
  userId: string,
): { safeToClear: boolean; unsentCount: number; queue: Queue } {
  const unsent = queue.items.filter(
    (item) =>
      item.mutation.userId === userId &&
      (item.status === 'PENDING' || item.status === 'IN_FLIGHT' || item.status === 'FAILED'),
  );

  return {
    safeToClear: unsent.length === 0,
    unsentCount: unsent.length,
    queue: {
      ...queue,
      items: queue.items.filter((item) => item.mutation.userId !== userId),
    },
  };
}
