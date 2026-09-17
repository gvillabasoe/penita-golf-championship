/**
 * Control de la revelacion progresiva (secciones 47 a 53).
 *
 * Maquina de estados pura. La regla que gobierna todo el modulo es la de la
 * seccion 53: pausar, reanudar, retroceder y reiniciar **solo** afectan a lo
 * visual. Ninguna accion de este archivo toca un resultado, un hándicap, unos
 * puntos ni una posicion. La clasificacion ya esta decidida y congelada en un
 * snapshot antes de que empiece la presentacion.
 */

export type RevealStatus = 'HIDDEN' | 'REVEALING' | 'PUBLISHED';
export type Role = 'PLAYER' | 'ADMIN';

export interface RevealState {
  status: RevealStatus;
  /** Id del snapshot congelado. null mientras no ha empezado. */
  snapshotId: string | null;
  /** Huella de los datos deportivos con los que se creo el snapshot. */
  snapshotFingerprint: string | null;
  /** Numero de grupos de posicion ya revelados. */
  revealedCount: number;
  /** Total de grupos a revelar (las posiciones compartidas cuentan como uno). */
  totalGroups: number;
  isPaused: boolean;
  /** No se admite otra accion antes de este instante, en milisegundos. */
  nextActionAvailableAt: number;
  publishedAt: string | null;
  updatedById: string | null;
}

/** Pausa minima entre revelaciones. Evita que se pasen tres posiciones sin querer. */
export const MIN_STEP_INTERVAL_MS = 1_500;

export type RevealAction =
  | 'START'
  | 'REVEAL_NEXT'
  | 'PAUSE'
  | 'RESUME'
  | 'BACK'
  | 'RESTART'
  | 'PUBLISH';

export interface ActionContext {
  actorId: string;
  actorRole: Role;
  /** Huella actual de los datos deportivos, para detectar cambios. */
  currentFingerprint: string;
  now?: number;
  /** Numero de grupos de la clasificacion actual, al iniciar o reiniciar. */
  totalGroups?: number;
  /** Id del snapshot nuevo, al iniciar o reiniciar. */
  snapshotId?: string;
}

export interface ActionResult {
  ok: boolean;
  errors: string[];
  state: RevealState;
  audit: {
    action: string;
    entityType: string;
    entityId: string;
    actorId: string;
    beforeData: unknown;
    afterData: unknown;
    reason: string | null;
    createdAt: string;
  } | null;
}

export function initialRevealState(): RevealState {
  return {
    status: 'HIDDEN',
    snapshotId: null,
    snapshotFingerprint: null,
    revealedCount: 0,
    totalGroups: 0,
    isPaused: false,
    nextActionAvailableAt: 0,
    publishedAt: null,
    updatedById: null,
  };
}

/**
 * El snapshot esta desactualizado: se corrigio una tarjeta durante la
 * presentacion (seccion 48).
 */
export function isSnapshotOutdated(state: RevealState, currentFingerprint: string): boolean {
  if (state.snapshotFingerprint === null) return false;
  return state.snapshotFingerprint !== currentFingerprint;
}

/** Que ve un jugador segun el estado. Nunca mas de lo revelado. */
export function visibleGroupCount(state: RevealState, role: Role): number {
  if (state.status === 'PUBLISHED') return state.totalGroups;
  if (role === 'ADMIN') return state.totalGroups; // provisional, solo para el admin
  if (state.status === 'HIDDEN') return 0;
  return state.revealedCount;
}

export function playerFacingMessage(state: RevealState): string | null {
  if (state.status === 'HIDDEN') return 'Clasificacion pendiente de publicacion';
  if (state.status === 'REVEALING' && state.revealedCount === 0) {
    return 'La revelacion esta a punto de empezar';
  }
  return null;
}

function reject(state: RevealState, ...errors: string[]): ActionResult {
  return { ok: false, errors, state, audit: null };
}

function accept(
  previous: RevealState,
  next: RevealState,
  action: RevealAction,
  context: ActionContext,
  now: number,
): ActionResult {
  return {
    ok: true,
    errors: [],
    state: next,
    audit: {
      action: `REVEAL_${action}`,
      entityType: 'ClassificationReveal',
      entityId: next.snapshotId ?? 'none',
      actorId: context.actorId,
      beforeData: {
        status: previous.status,
        revealedCount: previous.revealedCount,
        isPaused: previous.isPaused,
      },
      afterData: {
        status: next.status,
        revealedCount: next.revealedCount,
        isPaused: next.isPaused,
      },
      reason: null,
      createdAt: new Date(now).toISOString(),
    },
  };
}

/**
 * Aplica una accion de la presentacion.
 *
 * Todas exigen rol de administrador. Ninguna modifica datos deportivos.
 */
export function applyRevealAction(
  state: RevealState,
  action: RevealAction,
  context: ActionContext,
): ActionResult {
  const now = context.now ?? Date.now();

  if (context.actorRole !== 'ADMIN') {
    return reject(state, 'Solo un administrador puede controlar la revelacion.');
  }

  const stamp = (next: RevealState): RevealState => ({ ...next, updatedById: context.actorId });

  switch (action) {
    case 'START': {
      if (state.status === 'REVEALING') {
        return reject(state, 'La revelacion ya esta en marcha. Usa reiniciar si quieres empezar de nuevo.');
      }
      if (state.status === 'PUBLISHED') {
        return reject(state, 'La clasificacion ya esta publicada.');
      }
      if (context.snapshotId === undefined || context.totalGroups === undefined) {
        return reject(state, 'Hace falta congelar la clasificacion antes de empezar.');
      }
      if (context.totalGroups === 0) {
        return reject(state, 'No hay clasificacion que revelar.');
      }

      return accept(
        state,
        stamp({
          status: 'REVEALING',
          snapshotId: context.snapshotId,
          snapshotFingerprint: context.currentFingerprint,
          revealedCount: 0,
          totalGroups: context.totalGroups,
          isPaused: false,
          nextActionAvailableAt: now,
          publishedAt: null,
          updatedById: null,
        }),
        action,
        context,
        now,
      );
    }

    case 'REVEAL_NEXT': {
      if (state.status !== 'REVEALING') {
        return reject(state, 'La revelacion no esta en marcha.');
      }
      if (isSnapshotOutdated(state, context.currentFingerprint)) {
        // Seccion 48: se corrigio una tarjeta durante la presentacion.
        return reject(
          state,
          'Se han modificado resultados durante la presentacion. Reinicia la revelacion con una clasificacion actualizada.',
        );
      }
      if (state.isPaused) {
        return reject(state, 'La presentacion esta en pausa.');
      }
      if (state.revealedCount >= state.totalGroups) {
        return reject(state, 'Ya estan reveladas todas las posiciones. Solo queda publicar.');
      }
      if (now < state.nextActionAvailableAt) {
        return reject(state, 'Espera un momento antes de revelar la siguiente posicion.');
      }

      return accept(
        state,
        stamp({
          ...state,
          revealedCount: state.revealedCount + 1,
          nextActionAvailableAt: now + MIN_STEP_INTERVAL_MS,
        }),
        action,
        context,
        now,
      );
    }

    case 'PAUSE': {
      if (state.status !== 'REVEALING') return reject(state, 'La revelacion no esta en marcha.');
      if (state.isPaused) return reject(state, 'Ya esta en pausa.');
      return accept(state, stamp({ ...state, isPaused: true }), action, context, now);
    }

    case 'RESUME': {
      if (state.status !== 'REVEALING') return reject(state, 'La revelacion no esta en marcha.');
      if (!state.isPaused) return reject(state, 'No esta en pausa.');
      return accept(
        state,
        stamp({ ...state, isPaused: false, nextActionAvailableAt: now }),
        action,
        context,
        now,
      );
    }

    case 'BACK': {
      if (state.status !== 'REVEALING') return reject(state, 'La revelacion no esta en marcha.');
      if (state.revealedCount === 0) return reject(state, 'No hay ninguna posicion revelada.');
      // Solo visual: oculta la ultima tarjeta mostrada. No cambia nada deportivo.
      return accept(
        state,
        stamp({
          ...state,
          revealedCount: state.revealedCount - 1,
          nextActionAvailableAt: now,
        }),
        action,
        context,
        now,
      );
    }

    case 'RESTART': {
      if (state.status === 'PUBLISHED') {
        return reject(state, 'La clasificacion ya esta publicada: no se puede reiniciar.');
      }
      if (context.snapshotId === undefined || context.totalGroups === undefined) {
        return reject(state, 'Hace falta una clasificacion actualizada para reiniciar.');
      }
      // Reiniciar toma un snapshot NUEVO: es lo que desbloquea la presentacion
      // cuando se corrigio una tarjeta a mitad.
      return accept(
        state,
        stamp({
          status: 'REVEALING',
          snapshotId: context.snapshotId,
          snapshotFingerprint: context.currentFingerprint,
          revealedCount: 0,
          totalGroups: context.totalGroups,
          isPaused: false,
          nextActionAvailableAt: now,
          publishedAt: null,
          updatedById: null,
        }),
        action,
        context,
        now,
      );
    }

    case 'PUBLISH': {
      if (state.status === 'PUBLISHED') return reject(state, 'Ya esta publicada.');
      if (state.status !== 'REVEALING') {
        return reject(state, 'Hay que revelar la clasificacion antes de publicarla.');
      }
      if (isSnapshotOutdated(state, context.currentFingerprint)) {
        return reject(
          state,
          'Se han modificado resultados. Reinicia la revelacion antes de publicar.',
        );
      }
      if (state.revealedCount < state.totalGroups) {
        return reject(
          state,
          `Faltan ${state.totalGroups - state.revealedCount} posiciones por revelar.`,
        );
      }

      return accept(
        state,
        stamp({
          ...state,
          status: 'PUBLISHED',
          isPaused: false,
          publishedAt: new Date(now).toISOString(),
        }),
        action,
        context,
        now,
      );
    }

    default: {
      const exhaustive: never = action;
      return reject(state, `Accion desconocida: ${String(exhaustive)}`);
    }
  }
}

export interface AvailableActions {
  action: RevealAction;
  enabled: boolean;
  reason: string | null;
}

/**
 * Que botones habilitar en el panel. Se calcula con la misma funcion que aplica
 * las acciones, asi que la interfaz no puede desviarse de las reglas: si el
 * boton esta activo, la accion funciona.
 */
export function availableActions(
  state: RevealState,
  context: ActionContext,
): AvailableActions[] {
  const actions: RevealAction[] = [
    'START',
    'REVEAL_NEXT',
    'PAUSE',
    'RESUME',
    'BACK',
    'RESTART',
    'PUBLISH',
  ];

  return actions.map((action) => {
    const result = applyRevealAction(state, action, context);
    return {
      action,
      enabled: result.ok,
      reason: result.ok ? null : (result.errors[0] ?? null),
    };
  });
}
