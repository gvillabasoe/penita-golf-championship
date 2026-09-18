/**
 * Vaciado de los resultados de todas las tarjetas.
 *
 * Es la accion mas destructiva de la aplicacion: borra el trabajo de trece
 * personas y no se puede deshacer. Todo lo que se puede decidir sin base de
 * datos vive aqui, en funciones puras y con tests, para que la accion del
 * servidor no tenga que llevar ninguna regla dentro.
 *
 * ---------------------------------------------------------------------------
 * Que se vacia y que NO
 * ---------------------------------------------------------------------------
 * Se vacian los RESULTADOS y todo lo derivado de ellos. No se vacia la
 * CONFIGURACION del campeonato. La diferencia importa porque el caso real que
 * justifica este boton es "hemos estado probando la app y queremos empezar de
 * cero el dia del torneo": si el vaciado se llevase por delante hándicaps,
 * partidos y horas de salida, habria que rehacer una hora de trabajo y nadie lo
 * usaria.
 *
 * Las tarjetas NO se borran como entidades: se quedan, vacias y en
 * "Sin comenzar". Borrarlas obligaria a recrearlas y a reasignar
 * `competitionPlayerId`, y cualquier tropiezo ahi deja a un jugador sin tarjeta
 * el dia del torneo.
 */

export type Role = 'PLAYER' | 'ADMIN';

/** Texto que el administrador tiene que escribir para habilitar el boton. */
export const RESET_CONFIRMATION_WORD = 'VACIAR';

/**
 * Primer aviso. Dice las dos cosas a la vez: lo que se destruye y lo que se
 * conserva. Un aviso que solo amenaza hace que se pulse igual sin leerlo.
 */
export const RESET_FIRST_WARNING =
  'Esta accion eliminara todos los resultados registrados en las tarjetas del campeonato actual. Los jugadores, hándicaps, partidos y datos del campo se conservaran.';

export const RESET_IRREVERSIBLE_WARNING = 'Esta accion no se puede deshacer.';

export const RESET_SUCCESS_MESSAGE =
  'Los resultados de todas las tarjetas se han vaciado correctamente.';

/**
 * Comprueba el texto de la segunda confirmacion.
 *
 * Se admiten espacios alrededor y minusculas: el objetivo es que nadie vacie el
 * campeonato con un toque accidental, no montar un examen de mecanografia con
 * un teclado movil.
 */
export function isResetConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === RESET_CONFIRMATION_WORD;
}

export interface ResetScopeCard {
  competitionPlayerId: string;
  scorecardId: string | null;
  displayName: string;
  status: string;
  /** Hoyos con registro, contando los que ya estan vacios. */
  holeScoreCount: number;
  holesPlayed: number;
  points: number;
  isLocked: boolean;
  hasReview: boolean;
}

export interface ResetPreview {
  /** Tarjetas que van a quedar vacias: las que tienen algo que vaciar. */
  affectedCards: number;
  /** Tarjetas existentes en el campeonato. */
  totalCards: number;
  /** Registros de hoyo que se eliminan. */
  holeScores: number;
  /** Hoyos con resultado (numero o raya) que se pierden. */
  playedHoles: number;
  points: number;
  lockedCards: number;
  reviewedCards: number;
  classificationStatus: string;
  /** true cuando no hay absolutamente nada que vaciar. */
  isEmpty: boolean;
}

/**
 * Resumen de lo que se va a destruir, para la primera confirmacion.
 *
 * La seccion 3.3 pide numero de tarjetas y de resultados. Se anaden bloqueos y
 * revisiones porque son los dos estados que el administrador mas facilmente
 * olvida que tambien se van, y descubrirlo despues es una sorpresa desagradable.
 */
export function previewReset(
  cards: ResetScopeCard[],
  classificationStatus: string,
): ResetPreview {
  const affected = cards.filter(
    (card) => card.holeScoreCount > 0 || card.isLocked || card.hasReview,
  );

  return {
    affectedCards: affected.length,
    totalCards: cards.length,
    holeScores: cards.reduce((sum, card) => sum + card.holeScoreCount, 0),
    playedHoles: cards.reduce((sum, card) => sum + card.holesPlayed, 0),
    points: cards.reduce((sum, card) => sum + card.points, 0),
    lockedCards: cards.filter((card) => card.isLocked).length,
    reviewedCards: cards.filter((card) => card.hasReview).length,
    classificationStatus,
    isEmpty: affected.length === 0,
  };
}

/** Estado en el que queda cada tarjeta vaciada. */
export const RESET_CARD_STATE = {
  status: 'NOT_STARTED' as const,
  holesCompleted: 0,
  pointsTotal: 0,
  numericStrokesTotal: 0,
  pickupCount: 0,
  playerConfirmedFinish: false,
  reviewedById: null,
  reviewedAt: null,
  lockedAt: null,
} as const;

/** Estado en el que queda la clasificacion despues del vaciado. */
export const RESET_CLASSIFICATION_STATE = {
  classificationStatus: 'HIDDEN' as const,
  revealedCount: 0,
  currentIndex: 0,
  isPaused: false,
  snapshotId: null,
  publishedAt: null,
} as const;

export type ResetAuthorization =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Autorizacion del vaciado.
 *
 * Se comprueba aqui y se vuelve a comprobar en la accion del servidor con la
 * sesion real. Ocultar el boton al resto de usuarios NO es una medida de
 * seguridad, es maquetacion (seccion 3).
 */
export function authorizeReset(params: {
  actorRole: Role;
  confirmationText: string;
  competitionStatus: string;
}): ResetAuthorization {
  if (params.actorRole !== 'ADMIN') {
    return {
      ok: false,
      error: 'Solo un administrador puede vaciar los resultados de las tarjetas.',
    };
  }
  if (!isResetConfirmed(params.confirmationText)) {
    return {
      ok: false,
      error: `Para confirmar hay que escribir ${RESET_CONFIRMATION_WORD}.`,
    };
  }
  if (params.competitionStatus === 'CLOSED') {
    return {
      ok: false,
      error: 'El campeonato esta cerrado: sus resultados ya no pueden vaciarse.',
    };
  }
  return { ok: true };
}

export interface ResetAuditPayload {
  action: 'SCORES_RESET';
  entityType: 'Competition';
  before: {
    cards: number;
    holeScores: number;
    playedHoles: number;
    points: number;
    lockedCards: number;
    reviewedCards: number;
    classificationStatus: string;
    scoreGeneration: number;
  };
  after: {
    cards: number;
    holeScores: 0;
    playedHoles: 0;
    points: 0;
    lockedCards: 0;
    reviewedCards: 0;
    classificationStatus: 'HIDDEN';
    scoreGeneration: number;
  };
}

/**
 * Registro de auditoria del vaciado.
 *
 * Lleva la generacion anterior y la nueva porque son el dato que explica por que
 * una operacion de un movil se rechazo despues. Sin eso, el rechazo parece un
 * fallo de sincronizacion.
 *
 * No incluye nada del usuario mas alla de su identificador: ni contrasenas, ni
 * hashes, ni nombres.
 */
export function buildResetAudit(
  preview: ResetPreview,
  previousGeneration: number,
): ResetAuditPayload {
  return {
    action: 'SCORES_RESET',
    entityType: 'Competition',
    before: {
      cards: preview.affectedCards,
      holeScores: preview.holeScores,
      playedHoles: preview.playedHoles,
      points: preview.points,
      lockedCards: preview.lockedCards,
      reviewedCards: preview.reviewedCards,
      classificationStatus: preview.classificationStatus,
      scoreGeneration: previousGeneration,
    },
    after: {
      cards: preview.totalCards,
      holeScores: 0,
      playedHoles: 0,
      points: 0,
      lockedCards: 0,
      reviewedCards: 0,
      classificationStatus: 'HIDDEN',
      scoreGeneration: previousGeneration + 1,
    },
  };
}
