/**
 * Aplicacion de operaciones en el servidor: idempotencia y conflictos
 * (secciones 42, 43 y 65).
 *
 * Funcion pura sobre el estado leido de la base de datos. La ruta de la API se
 * limitara a cargar, llamar aqui y escribir dentro de una transaccion.
 *
 * ---------------------------------------------------------------------------
 * Concurrencia optimista POR HOYO, no por tarjeta
 * ---------------------------------------------------------------------------
 * La version optimista ingenua es por tarjeta: si la version del servidor ha
 * cambiado, conflicto. Eso aqui no sirve. Un jugador que apunta 9 hoyos sin
 * cobertura vuelve con 9 operaciones basadas en la version que vio al empezar.
 * Si mientras tanto el administrador ha tocado cualquier cosa de su tarjeta,
 * las 9 darian conflicto de golpe y habria que resolverlas a mano.
 *
 * Por eso el conflicto se decide hoyo a hoyo, y solo cuando lo escribio OTRO
 * dispositivo:
 *
 *   conflicto  <=>  el hoyo se escribio despues de la version base del cliente
 *                   Y lo escribio un dispositivo distinto
 *
 * Asi, los 9 hoyos del jugador entran sin ruido, y si el administrador habia
 * corregido justo el hoyo 7, solo el 7 se marca como conflicto.
 */

import type { ScorecardStatus } from '../golf/types';
import { generationOf, operationOf, type HoleMutation } from './queue';

export type Role = 'PLAYER' | 'ADMIN';

export interface ServerHoleState {
  grossStrokes: number | null;
  isPickup: boolean;
  /** Correccion administrativa: un jugador no puede pisarla (seccion 43). */
  isOverridden: boolean;
  /** Version de la tarjeta cuando se escribio este hoyo. */
  serverVersion: number;
  /** Dispositivo que lo escribio. null si viene del panel de administracion. */
  lastWriterClientId: string | null;
}

export interface ServerScorecardState {
  id: string;
  /** Usuario propietario de la tarjeta. */
  ownerUserId: string;
  version: number;
  status: ScorecardStatus;
  holes: Record<number, ServerHoleState>;
  /** Version del reparto de golpes vigente, para avisar al cliente si cambio. */
  allocationVersion: number;
}

export type RejectionCode =
  | 'CARD_LOCKED'
  | 'NOT_OWNER'
  | 'INVALID_HOLE'
  | 'INVALID_STROKES'
  | 'COMPETITION_CLOSED'
  /**
   * La operacion se creo antes de un vaciado de tarjetas. Se rechaza en vez de
   * aplicarse: aplicarla devolveria a la vida un resultado ya borrado, que es
   * exactamente lo que prohibe la seccion 3.5.
   */
  | 'STALE_GENERATION';

export interface ConflictRecord {
  scorecardId: string;
  holeNumber: number;
  localValue: { grossStrokes: number | null; isPickup: boolean };
  serverValue: { grossStrokes: number | null; isPickup: boolean };
  baseVersion: number;
  serverVersion: number;
  reason: 'OTHER_DEVICE' | 'ADMIN_OVERRIDE';
  clientMutationId: string;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  beforeData: unknown;
  afterData: unknown;
  reason: string | null;
  createdAt: string;
}

export type ApplyOutcome =
  | { type: 'DUPLICATE'; clientMutationId: string; version: number }
  | {
      type: 'APPLIED';
      clientMutationId: string;
      state: ServerScorecardState;
      version: number;
      /** El cliente debe recargar el reparto de golpes: cambio el hándicap. */
      staleAllocation: boolean;
      audit: AuditEntry;
    }
  | { type: 'CONFLICT'; clientMutationId: string; conflict: ConflictRecord }
  | { type: 'REJECTED'; clientMutationId: string; code: RejectionCode; message: string };

export interface ApplyContext {
  actorUserId: string;
  actorRole: Role;
  /** Version del reparto que el cliente tenia. Si difiere, se avisa. */
  clientAllocationVersion?: number;
  competitionClosed?: boolean;
  /**
   * Generacion de resultados vigente en el campeonato. Cuando se indica, una
   * operacion de una generacion anterior se rechaza.
   *
   * Es opcional para que las llamadas que no tengan el dato a mano se comporten
   * como antes, no porque la comprobacion sea prescindible: la ruta de
   * sincronizacion y la accion del teclado la pasan siempre, y hay un test que
   * lo exige.
   */
  competitionScoreGeneration?: number;
  now?: Date;
  /** Motivo, obligatorio para correcciones administrativas. */
  reason?: string;
}

const MAX_PLAYER_STROKES = 9; // teclado del jugador: 1-9 y raya
const MAX_ADMIN_STROKES = 20; // margen para correcciones administrativas

function validate(
  mutation: HoleMutation,
  context: ApplyContext,
): { code: RejectionCode; message: string } | null {
  if (!Number.isInteger(mutation.holeNumber) || mutation.holeNumber < 1 || mutation.holeNumber > 18) {
    return { code: 'INVALID_HOLE', message: `Hoyo fuera de rango: ${mutation.holeNumber}.` };
  }

  /**
   * Borrar un resultado deja el hoyo VACIO, no en raya.
   *
   * Por eso una operacion CLEAR con golpes o con raya dentro es un estado
   * imposible y se rechaza: si se aceptase, la diferencia entre "todavia no lo
   * he jugado" y "levante la bola" dependeria de cual de los dos campos mirase
   * cada pantalla.
   */
  if (operationOf(mutation) === 'CLEAR') {
    if (mutation.grossStrokes !== null || mutation.isPickup) {
      return {
        code: 'INVALID_STROKES',
        message: 'Borrar un resultado no puede llevar golpes ni raya. Estado imposible.',
      };
    }
    return null;
  }

  if (mutation.isPickup) {
    if (mutation.grossStrokes !== null) {
      return {
        code: 'INVALID_STROKES',
        message: 'Una raya no puede llevar golpes. Estado imposible.',
      };
    }
    return null;
  }

  if (mutation.grossStrokes === null) {
    return {
      code: 'INVALID_STROKES',
      message: 'Hay que indicar golpes o marcar raya.',
    };
  }

  const max = context.actorRole === 'ADMIN' ? MAX_ADMIN_STROKES : MAX_PLAYER_STROKES;
  if (!Number.isInteger(mutation.grossStrokes) || mutation.grossStrokes < 1 || mutation.grossStrokes > max) {
    return {
      code: 'INVALID_STROKES',
      message: `Golpes fuera de rango (1-${max}): ${mutation.grossStrokes}.`,
    };
  }

  return null;
}

/**
 * Aplica una operacion. Idempotente: si el `clientMutationId` ya consta como
 * aplicado, no vuelve a hacer nada y devuelve DUPLICATE.
 */
export function applyMutation(
  state: ServerScorecardState,
  mutation: HoleMutation,
  appliedMutationIds: ReadonlySet<string>,
  context: ApplyContext,
): ApplyOutcome {
  const { clientMutationId } = mutation;
  const now = context.now ?? new Date();

  // 1. Idempotencia primero: un reenvio nunca puede duplicar ni volver a fallar.
  if (appliedMutationIds.has(clientMutationId)) {
    return { type: 'DUPLICATE', clientMutationId, version: state.version };
  }

  /**
   * 2. Generacion de resultados.
   *
   * Va ANTES de la autorizacion y de la validacion a proposito: una operacion de
   * una generacion anterior no debe llegar a evaluarse. El caso real es un movil
   * que apunto nueve hoyos sin cobertura, el administrador vacio las tarjetas, y
   * el movil recupera la conexion. Esas nueve operaciones son legitimas, de su
   * dueno y con golpes validos; lo unico que las invalida es que el resultado al
   * que se referian ya no existe.
   */
  const competitionGeneration = context.competitionScoreGeneration;
  if (competitionGeneration !== undefined && generationOf(mutation) < competitionGeneration) {
    return {
      type: 'REJECTED',
      clientMutationId,
      code: 'STALE_GENERATION',
      message:
        'El administrador ha vaciado las tarjetas despues de apuntar este resultado. No se ha guardado.',
    };
  }

  // 3. Autorizacion.
  //
  // La decision se toma con `context.actorUserId`, que viene de la sesion del
  // servidor, NUNCA con `mutation.userId`, que lo escribe el cliente y por tanto
  // no es de fiar (seccion 66: "No confiar en IDs del cliente"). El userId de la
  // operacion solo se usa para detectar un payload incoherente.
  const actorIsOwner = context.actorUserId === state.ownerUserId;

  if (context.actorRole !== 'ADMIN') {
    if (!actorIsOwner || mutation.userId !== context.actorUserId) {
      return {
        type: 'REJECTED',
        clientMutationId,
        code: 'NOT_OWNER',
        message: 'Solo puedes escribir en tu propia tarjeta.',
      };
    }
    if (state.status === 'LOCKED') {
      return {
        type: 'REJECTED',
        clientMutationId,
        code: 'CARD_LOCKED',
        message: 'La tarjeta esta bloqueada.',
      };
    }
  }

  if (context.competitionClosed === true) {
    return {
      type: 'REJECTED',
      clientMutationId,
      code: 'COMPETITION_CLOSED',
      message: 'La competicion esta cerrada.',
    };
  }

  // 4. Validacion de contenido.
  const invalid = validate(mutation, context);
  if (invalid) {
    return { type: 'REJECTED', clientMutationId, ...invalid };
  }

  const existing = state.holes[mutation.holeNumber];

  // 5. Conflictos.
  if (existing) {
    if (existing.isOverridden && context.actorRole !== 'ADMIN') {
      return {
        type: 'CONFLICT',
        clientMutationId,
        conflict: {
          scorecardId: state.id,
          holeNumber: mutation.holeNumber,
          localValue: { grossStrokes: mutation.grossStrokes, isPickup: mutation.isPickup },
          serverValue: { grossStrokes: existing.grossStrokes, isPickup: existing.isPickup },
          baseVersion: mutation.baseVersion,
          serverVersion: existing.serverVersion,
          reason: 'ADMIN_OVERRIDE',
          clientMutationId,
        },
      };
    }

    const writtenAfterClientSaw = existing.serverVersion > mutation.baseVersion;
    const writtenByAnotherDevice = existing.lastWriterClientId !== mutation.clientId;

    if (writtenAfterClientSaw && writtenByAnotherDevice) {
      return {
        type: 'CONFLICT',
        clientMutationId,
        conflict: {
          scorecardId: state.id,
          holeNumber: mutation.holeNumber,
          localValue: { grossStrokes: mutation.grossStrokes, isPickup: mutation.isPickup },
          serverValue: { grossStrokes: existing.grossStrokes, isPickup: existing.isPickup },
          baseVersion: mutation.baseVersion,
          serverVersion: existing.serverVersion,
          reason: 'OTHER_DEVICE',
          clientMutationId,
        },
      };
    }
  }

  // 6. Aplicacion.
  const nextVersion = state.version + 1;

  /**
   * Una escritura solo cuenta como correccion administrativa si la hace un
   * administrador sobre la tarjeta de OTRO.
   *
   * Importa en esta edicion concreta: Gonzalo Villabaso es jugador y
   * administrador a la vez. Cuando apunta sus propios hoyos es un jugador
   * normal, y marcar esos hoyos como "corregidos por el administrador" le
   * impediria a el mismo corregirse un hoyo mas tarde, ademas de ensuciar la
   * auditoria de la prueba entera.
   */
  const isAdminWrite = context.actorRole === 'ADMIN' && !actorIsOwner;
  const isClear = operationOf(mutation) === 'CLEAR';

  /**
   * El hoyo borrado se queda en el estado con los dos campos vacios, NO se
   * elimina del mapa.
   *
   * Eliminarlo daria un hoyo indistinguible de uno nunca jugado para el
   * resolutor —que es correcto— pero perderia quien lo toco por ultima vez y
   * con que version, y con eso se perderia la deteccion de conflictos: otro
   * dispositivo con una version antigua podria escribir encima sin que nadie lo
   * marcase. Un registro vacio conserva las dos cosas.
   */
  const nextState: ServerScorecardState = {
    ...state,
    version: nextVersion,
    holes: {
      ...state.holes,
      [mutation.holeNumber]: {
        grossStrokes: isClear ? null : mutation.grossStrokes,
        isPickup: isClear ? false : mutation.isPickup,
        // Una escritura administrativa marca el hoyo como corregido; la del
        // propio jugador lo devuelve a estado normal.
        isOverridden: isAdminWrite,
        serverVersion: nextVersion,
        lastWriterClientId: isAdminWrite ? null : mutation.clientId,
      },
    },
  };

  /**
   * El reparto de golpes cambio mientras el jugador estaba sin cobertura.
   *
   * DESVIACION DOCUMENTADA de la seccion 43, que lista "cambio el hándicap" y
   * "cambio la distribucion" como motivos de conflicto. Aqui NO bloquean la
   * escritura, solo avisan.
   *
   * Motivo: la operacion del jugador solo contiene golpes brutos. Los golpes
   * recibidos, el neto y los puntos los recalcula el servidor con el reparto
   * vigente. Bloquear un resultado bruto porque el administrador arreglo un
   * hándicap perderia el resultado del jugador sin ninguna necesidad, que es
   * justo lo que prohibe la seccion 41. Lo que si hace falta es que el movil
   * recargue su reparto, y para eso esta este aviso.
   */
  const staleAllocation =
    context.clientAllocationVersion !== undefined &&
    context.clientAllocationVersion !== state.allocationVersion;

  return {
    type: 'APPLIED',
    clientMutationId,
    state: nextState,
    version: nextVersion,
    staleAllocation,
    audit: {
      action: isClear
        ? 'HOLE_SCORE_CLEARED'
        : isAdminWrite
          ? 'HOLE_SCORE_OVERRIDDEN'
          : 'HOLE_SCORE_WRITTEN',
      entityType: 'HoleScore',
      entityId: `${state.id}:${mutation.holeNumber}`,
      actorId: context.actorUserId,
      beforeData: existing
        ? { grossStrokes: existing.grossStrokes, isPickup: existing.isPickup }
        : null,
      afterData: isClear
        ? { grossStrokes: null, isPickup: false, cleared: true }
        : { grossStrokes: mutation.grossStrokes, isPickup: mutation.isPickup },
      reason: context.reason?.trim() || null,
      createdAt: now.toISOString(),
    },
  };
}

export interface BatchResult {
  state: ServerScorecardState;
  outcomes: ApplyOutcome[];
  conflicts: ConflictRecord[];
  audits: AuditEntry[];
  appliedIds: string[];
  /** Ids que el cliente puede retirar de su cola: aplicados y duplicados. */
  settledIds: string[];
}

/**
 * Aplica un lote en orden. No se detiene en el primer problema: cada operacion
 * recibe su veredicto, para que el movil sepa exactamente que retirar de la cola
 * y que dejar para resolver.
 */
export function applyBatch(
  initialState: ServerScorecardState,
  mutations: HoleMutation[],
  appliedMutationIds: ReadonlySet<string>,
  context: ApplyContext,
): BatchResult {
  let state = initialState;
  const applied = new Set(appliedMutationIds);
  const outcomes: ApplyOutcome[] = [];
  const conflicts: ConflictRecord[] = [];
  const audits: AuditEntry[] = [];
  const appliedIds: string[] = [];
  const settledIds: string[] = [];

  for (const mutation of mutations) {
    const outcome = applyMutation(state, mutation, applied, context);
    outcomes.push(outcome);

    switch (outcome.type) {
      case 'APPLIED':
        state = outcome.state;
        applied.add(outcome.clientMutationId);
        appliedIds.push(outcome.clientMutationId);
        settledIds.push(outcome.clientMutationId);
        audits.push(outcome.audit);
        break;
      case 'DUPLICATE':
        settledIds.push(outcome.clientMutationId);
        break;
      case 'CONFLICT':
        conflicts.push(outcome.conflict);
        break;
      case 'REJECTED':
        break;
    }
  }

  return { state, outcomes, conflicts, audits, appliedIds, settledIds };
}

export type ConflictResolution = 'KEEP_SERVER' | 'KEEP_LOCAL';

export interface ResolutionResult {
  ok: boolean;
  errors: string[];
  state: ServerScorecardState;
  audit: AuditEntry | null;
}

/**
 * Resolucion de un conflicto desde el panel (seccion 43).
 *
 * Quedarse con el valor local sobre una correccion administrativa exige ser
 * administrador y dar un motivo: es exactamente el caso que la seccion 43
 * prohibe hacer en silencio.
 */
export function resolveConflict(params: {
  state: ServerScorecardState;
  conflict: ConflictRecord;
  resolution: ConflictResolution;
  actorUserId: string;
  actorRole: Role;
  reason?: string;
  now?: Date;
}): ResolutionResult {
  const { state, conflict, resolution, actorUserId, actorRole } = params;
  const now = params.now ?? new Date();
  const errors: string[] = [];

  if (actorRole !== 'ADMIN') {
    errors.push('Solo un administrador puede resolver un conflicto.');
  }
  if (conflict.reason === 'ADMIN_OVERRIDE' && resolution === 'KEEP_LOCAL' && !params.reason?.trim()) {
    errors.push(
      'Sustituir una correccion administrativa por el valor del jugador exige un motivo por escrito.',
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, state, audit: null };
  }

  if (resolution === 'KEEP_SERVER') {
    return {
      ok: true,
      errors: [],
      state,
      audit: {
        action: 'SYNC_CONFLICT_RESOLVED_SERVER',
        entityType: 'SyncConflict',
        entityId: `${conflict.scorecardId}:${conflict.holeNumber}`,
        actorId: actorUserId,
        beforeData: conflict.localValue,
        afterData: conflict.serverValue,
        reason: params.reason?.trim() || null,
        createdAt: now.toISOString(),
      },
    };
  }

  const nextVersion = state.version + 1;
  return {
    ok: true,
    errors: [],
    state: {
      ...state,
      version: nextVersion,
      holes: {
        ...state.holes,
        [conflict.holeNumber]: {
          grossStrokes: conflict.localValue.grossStrokes,
          isPickup: conflict.localValue.isPickup,
          isOverridden: true, // resuelto por el administrador: queda marcado
          serverVersion: nextVersion,
          lastWriterClientId: null,
        },
      },
    },
    audit: {
      action: 'SYNC_CONFLICT_RESOLVED_LOCAL',
      entityType: 'SyncConflict',
      entityId: `${conflict.scorecardId}:${conflict.holeNumber}`,
      actorId: actorUserId,
      beforeData: conflict.serverValue,
      afterData: conflict.localValue,
      reason: params.reason?.trim() || null,
      createdAt: now.toISOString(),
    },
  };
}
