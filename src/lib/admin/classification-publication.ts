/**
 * Estado persistente que representa el interruptor Provisional / Oficial.
 *
 * La publicación no cambia puntos, posiciones ni tarjetas. Solo sincroniza
 * las dos fuentes de estado que ya usa la aplicación: Competition y
 * ClassificationReveal. Mantenerlas juntas evita que una pantalla diga
 * "oficial" mientras otra sigue ocultando la clasificación.
 */

export type PublicationStatus = 'HIDDEN' | 'PUBLISHED';

export interface ClassificationPublicationTransition {
  classificationStatus: PublicationStatus;
  reveal: {
    snapshotId: null;
    status: PublicationStatus;
    revealedCount: number;
    isPaused: false;
    currentIndex: number;
    nextActionAvailableAt: null;
    publishedAt: Date | null;
    updatedById: string;
  };
  auditAction: 'CLASSIFICATION_PUBLISHED' | 'CLASSIFICATION_RETURNED_TO_PROVISIONAL';
}

export function buildClassificationPublicationTransition({
  official,
  totalGroups,
  actorId,
  now = new Date(),
}: {
  official: boolean;
  totalGroups: number;
  actorId: string;
  now?: Date;
}): ClassificationPublicationTransition {
  if (!Number.isInteger(totalGroups) || totalGroups < 0) {
    throw new Error('El numero de posiciones de la clasificacion no es valido.');
  }
  if (official && totalGroups === 0) {
    throw new Error('No hay ninguna posicion que publicar.');
  }

  const classificationStatus: PublicationStatus = official ? 'PUBLISHED' : 'HIDDEN';
  const visibleGroups = official ? totalGroups : 0;

  return {
    classificationStatus,
    reveal: {
      snapshotId: null,
      status: classificationStatus,
      revealedCount: visibleGroups,
      isPaused: false,
      currentIndex: visibleGroups,
      nextActionAvailableAt: null,
      publishedAt: official ? now : null,
      updatedById: actorId,
    },
    auditAction: official
      ? 'CLASSIFICATION_PUBLISHED'
      : 'CLASSIFICATION_RETURNED_TO_PROVISIONAL',
  };
}
