/**
 * Logica de la pantalla "Mi tarjeta" durante la vuelta (secciones 35, 36, 41, 44).
 *
 * Todo funcion pura. La pantalla de React se limitara a pintar lo que estas
 * funciones decidan, para que el comportamiento este probado antes de existir
 * la interfaz.
 */

import { isUnusualResult, resolveHole, type HoleScoreInput } from '../golf/stableford';
import { strokesReceivedLabel } from '../golf/strokes';
import type { HoleResult, HoleSnapshot, ScorecardStatus } from '../golf/types';

export type Role = 'PLAYER' | 'ADMIN';

/** Teclado del jugador: 1 a 9 y raya. Nada mas (seccion 36). */
export const PLAYER_KEYPAD: Array<number | 'PICKUP'> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'PICKUP'];

/**
 * Siguiente hoyo pendiente a partir del actual, dando la vuelta al final.
 * Devuelve null si no queda ninguno.
 *
 * Da la vuelta a proposito: si alguien se salta el 7 y sigue hasta el 18, al
 * confirmar el 18 tiene que volver al 7, no quedarse sin sitio donde ir.
 */
export function nextPendingHole(results: HoleResult[], currentHole: number): number | null {
  const isPending = (r: HoleResult) => r.grossStrokes === null && !r.isPickup;
  const total = results.length;
  if (total === 0) return null;

  for (let offset = 1; offset <= total; offset += 1) {
    const holeNumber = ((currentHole - 1 + offset) % total) + 1;
    const result = results.find((r) => r.holeNumber === holeNumber);
    if (result && isPending(result)) return holeNumber;
  }
  return null;
}

/** Ultimo hoyo con resultado, para la cabecera de la tarjeta. */
export function lastPlayedHole(results: HoleResult[]): number | null {
  const played = results.filter((r) => r.grossStrokes !== null || r.isPickup);
  if (played.length === 0) return null;
  return played.reduce((max, r) => Math.max(max, r.holeNumber), 0);
}

export interface EditPermission {
  canEdit: boolean;
  reason: string | null;
  /** True si al editar se invalida una revision ya hecha (seccion 39). */
  invalidatesReview: boolean;
  /** True si hay una correccion administrativa en ese hoyo (seccion 43). */
  overridesAdminCorrection: boolean;
}

/**
 * Quien puede escribir en un hoyo y con que consecuencias.
 *
 * Un jugador puede corregir mientras la tarjeta no este bloqueada, pero si el
 * administrador ya corrigio ese hoyo, no puede pisarlo sin autorizacion.
 */
export function canEditHole(params: {
  status: ScorecardStatus;
  role: Role;
  isOwner: boolean;
  isHoleOverridden: boolean;
  hasReview: boolean;
}): EditPermission {
  const base = { invalidatesReview: false, overridesAdminCorrection: false };

  if (params.role === 'ADMIN') {
    return {
      canEdit: true,
      reason: null,
      invalidatesReview: params.hasReview,
      overridesAdminCorrection: false,
    };
  }

  if (!params.isOwner) {
    return { ...base, canEdit: false, reason: 'Solo puedes editar tu propia tarjeta.' };
  }
  if (params.status === 'LOCKED') {
    return {
      ...base,
      canEdit: false,
      reason: 'La tarjeta esta bloqueada. Habla con el administrador.',
    };
  }
  if (params.isHoleOverridden) {
    return {
      canEdit: false,
      reason:
        'El administrador ha corregido este hoyo. Pide autorizacion antes de volver a cambiarlo.',
      invalidatesReview: false,
      overridesAdminCorrection: true,
    };
  }

  return {
    canEdit: true,
    reason: null,
    invalidatesReview: params.hasReview,
    overridesAdminCorrection: false,
  };
}

export interface ConfirmationSummary {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  distance: number;
  strokesReceived: number;
  strokesReceivedLabel: string;
  grossStrokes: number | null;
  isPickup: boolean;
  netStrokes: number | null;
  stablefordPoints: number;
  grossLabel: string;
  /** Resultado poco habitual: pide una confirmacion extra, no bloquea. */
  requiresExtraConfirmation: boolean;
  extraConfirmationMessage: string | null;
}

/**
 * Lo que hay que mostrar ANTES de confirmar un hoyo (seccion 36): hoyo, par,
 * golpes recibidos, golpes introducidos, bruto, neto y puntos.
 */
export function buildConfirmationSummary(
  hole: HoleSnapshot,
  strokesReceived: number,
  input: HoleScoreInput,
): ConfirmationSummary {
  const result = resolveHole(hole, strokesReceived, input);
  const unusual = isUnusualResult(result);

  let message: string | null = null;
  if (result.grossStrokes === 1) {
    message = `Hoyo en uno en el ${hole.holeNumber}. Confirma que es correcto.`;
  } else if (unusual && result.grossToPar !== null && result.grossToPar <= -2) {
    message = `${result.grossStrokes} golpes en un par ${hole.par}. Confirma que es correcto.`;
  } else if (unusual) {
    message = `${result.grossStrokes} golpes en un par ${hole.par}. Confirma que es correcto.`;
  }

  return {
    holeNumber: hole.holeNumber,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    distance: hole.distance,
    strokesReceived,
    strokesReceivedLabel: strokesReceivedLabel(strokesReceived),
    grossStrokes: result.grossStrokes,
    isPickup: result.isPickup,
    netStrokes: result.netStrokes,
    stablefordPoints: result.stablefordPoints,
    grossLabel: result.isPickup ? 'Raya' : `${result.grossStrokes} golpes`,
    requiresExtraConfirmation: unusual,
    extraConfirmationMessage: message,
  };
}

export type SaveState = 'SAVED' | 'SAVING' | 'OFFLINE' | 'PENDING' | 'SYNCED' | 'ERROR';

export interface SaveStatus {
  state: SaveState;
  label: string;
  /** Texto para aria-live: lo anuncia el lector de pantalla al cambiar. */
  ariaLabel: string;
  pendingCount: number;
}

/**
 * Estado de guardado que se muestra siempre visible en la cabecera (seccion 41).
 *
 * El orden de las comprobaciones importa: un error de sincronizacion tiene que
 * ganar a "sin conexion", porque son problemas distintos y se arreglan distinto.
 */
export function deriveSaveStatus(params: {
  pendingCount: number;
  inFlightCount: number;
  isOnline: boolean;
  hasPermanentFailure: boolean;
}): SaveStatus {
  const { pendingCount, inFlightCount, isOnline, hasPermanentFailure } = params;

  if (hasPermanentFailure) {
    return {
      state: 'ERROR',
      label: 'Error al sincronizar',
      ariaLabel:
        'Error al sincronizar. Tus resultados estan guardados en el movil. Avisa al administrador.',
      pendingCount,
    };
  }
  if (inFlightCount > 0) {
    return {
      state: 'SAVING',
      label: 'Guardando...',
      ariaLabel: 'Guardando resultados',
      pendingCount,
    };
  }
  if (!isOnline) {
    return {
      state: 'OFFLINE',
      label: pendingCount > 0 ? `Sin conexion · ${pendingCount} por enviar` : 'Sin conexion',
      ariaLabel:
        pendingCount > 0
          ? `Sin conexion. ${pendingCount} resultados guardados en el movil, se enviaran al recuperar cobertura.`
          : 'Sin conexion. Puedes seguir apuntando.',
      pendingCount,
    };
  }
  if (pendingCount > 0) {
    return {
      state: 'PENDING',
      label: `${pendingCount} por sincronizar`,
      ariaLabel: `${pendingCount} resultados pendientes de sincronizar`,
      pendingCount,
    };
  }
  return {
    state: 'SYNCED',
    label: 'Sincronizado',
    ariaLabel: 'Todos los resultados estan sincronizados',
    pendingCount: 0,
  };
}

export interface FinishCheck {
  canFinish: boolean;
  missingHoles: number[];
  message: string | null;
}

/** Aviso al intentar finalizar (seccion 44). La raya es un resultado valido. */
export function checkCanFinish(results: HoleResult[]): FinishCheck {
  const missingHoles = results
    .filter((r) => r.grossStrokes === null && !r.isPickup)
    .map((r) => r.holeNumber);

  if (missingHoles.length === 0) {
    return { canFinish: true, missingHoles: [], message: null };
  }
  return {
    canFinish: false,
    missingHoles,
    message:
      missingHoles.length === 1
        ? `Falta el hoyo ${missingHoles[0]}. Apunta un resultado o una raya.`
        : `Faltan ${missingHoles.length} hoyos: ${missingHoles.join(', ')}. Apunta resultado o raya en cada uno.`,
  };
}
