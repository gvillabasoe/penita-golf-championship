/**
 * Quien ve que tarjeta y quien puede revisarla (secciones 39 y 40).
 *
 * Regla central: antes de publicar, un jugador ve su tarjeta y las de su propio
 * partido. Nada mas. Los puntos provisionales de otros partidos son solo para el
 * administrador (seccion 61). Despues de publicar, todas las tarjetas son
 * visibles para todos, en solo lectura.
 */

import type { ScorecardStatus } from '../golf/types';

export type Role = 'PLAYER' | 'ADMIN';
export type ClassificationStatus = 'HIDDEN' | 'REVEALING' | 'PUBLISHED';
export type Access = 'NONE' | 'READ' | 'READ_WRITE';

export interface Viewer {
  competitionPlayerId: string;
  role: Role;
  flightId: string | null;
}

export interface TargetCard {
  competitionPlayerId: string;
  flightId: string | null;
  status: ScorecardStatus;
}

export interface VisibilityDecision {
  access: Access;
  reason: string;
}

export function cardAccess(
  viewer: Viewer,
  target: TargetCard,
  classificationStatus: ClassificationStatus,
): VisibilityDecision {
  if (viewer.role === 'ADMIN') {
    return { access: 'READ_WRITE', reason: 'Administrador: acceso completo.' };
  }

  const isOwn = viewer.competitionPlayerId === target.competitionPlayerId;

  if (isOwn) {
    if (target.status === 'LOCKED') {
      return { access: 'READ', reason: 'Tu tarjeta esta bloqueada: solo lectura.' };
    }
    return { access: 'READ_WRITE', reason: 'Tu tarjeta.' };
  }

  if (classificationStatus === 'PUBLISHED') {
    return { access: 'READ', reason: 'Clasificacion publicada: todas las tarjetas visibles.' };
  }

  const sameFlight =
    viewer.flightId !== null && target.flightId !== null && viewer.flightId === target.flightId;

  if (sameFlight) {
    return { access: 'READ', reason: 'Jugador de tu mismo partido: solo lectura.' };
  }

  return {
    access: 'NONE',
    reason: 'Las tarjetas de otros partidos no son visibles hasta publicar la clasificacion.',
  };
}

export interface ReviewEligibility {
  canReview: boolean;
  reason: string | null;
}

/**
 * Quien puede revisar una tarjeta.
 *
 * Nadie revisa la suya. Solo un integrante del mismo partido, y solo cuando el
 * jugador ya la ha dado por finalizada: revisar una tarjeta a medias no significa
 * nada.
 */
export function canReviewCard(viewer: Viewer, target: TargetCard): ReviewEligibility {
  if (viewer.competitionPlayerId === target.competitionPlayerId) {
    return { canReview: false, reason: 'No puedes validar tu propia tarjeta.' };
  }

  if (viewer.role === 'ADMIN') {
    if (target.status === 'NOT_STARTED' || target.status === 'IN_PLAY') {
      return { canReview: false, reason: 'La tarjeta todavia no esta finalizada.' };
    }
    return { canReview: true, reason: null };
  }

  const sameFlight =
    viewer.flightId !== null && target.flightId !== null && viewer.flightId === target.flightId;
  if (!sameFlight) {
    return { canReview: false, reason: 'Solo puede revisar un jugador del mismo partido.' };
  }

  if (target.status === 'NOT_STARTED' || target.status === 'IN_PLAY') {
    return {
      canReview: false,
      reason: 'El jugador todavia no ha finalizado su tarjeta.',
    };
  }
  if (target.status === 'LOCKED') {
    return { canReview: false, reason: 'La tarjeta ya esta bloqueada.' };
  }

  return { canReview: true, reason: null };
}

export interface ReviewRecord {
  reviewerId: string;
  scorecardVersion: number;
  status: 'OK' | 'OBJECTED' | 'OUTDATED';
  createdAt: Date;
}

export interface ReviewState {
  hasValidReview: boolean;
  isOutdated: boolean;
  /** True si hace falta una revision nueva antes de poder bloquear. */
  blocksLocking: boolean;
  message: string | null;
}

/**
 * Estado de la revision frente a la version actual de la tarjeta (seccion 39).
 *
 * Si la tarjeta cambia despues de revisarse, la revision queda desactualizada y
 * hace falta otra antes del bloqueo definitivo. No se invalida en silencio: se
 * marca y se avisa.
 */
export function evaluateReview(
  reviews: ReviewRecord[],
  currentScorecardVersion: number,
): ReviewState {
  if (reviews.length === 0) {
    return {
      hasValidReview: false,
      isOutdated: false,
      blocksLocking: true,
      message: 'Falta que otro jugador de tu partido revise la tarjeta.',
    };
  }

  const latest = reviews.reduce((newest, review) =>
    review.createdAt > newest.createdAt ? review : newest,
  );

  if (latest.status === 'OBJECTED') {
    return {
      hasValidReview: false,
      isOutdated: false,
      blocksLocking: true,
      message: 'Un jugador del partido ha puesto una objecion. Revisa el resultado.',
    };
  }

  if (latest.scorecardVersion < currentScorecardVersion) {
    return {
      hasValidReview: false,
      isOutdated: true,
      blocksLocking: true,
      message:
        'La tarjeta ha cambiado despues de revisarse. Hace falta una revision nueva antes de bloquearla.',
    };
  }

  return { hasValidReview: true, isOutdated: false, blocksLocking: false, message: null };
}

/**
 * Puntos provisionales: visibles solo para el administrador mientras la
 * clasificacion no este publicada (seccion 61).
 */
export function canSeeProvisionalPoints(
  viewer: Viewer,
  target: TargetCard,
  classificationStatus: ClassificationStatus,
): boolean {
  if (viewer.role === 'ADMIN') return true;
  if (classificationStatus === 'PUBLISHED') return true;
  return viewer.competitionPlayerId === target.competitionPlayerId;
}
