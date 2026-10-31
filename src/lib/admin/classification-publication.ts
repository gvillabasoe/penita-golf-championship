/**
 * Transicion del unico control de publicacion de la clasificacion.
 *
 * No existe ningun estado intermedio ni una clasificacion paralela. La fuente
 * de verdad es exclusivamente
 * `Competition.classificationStatus`:
 *
 * - HIDDEN: clasificacion provisional, visible completa solo para el admin.
 * - PUBLISHED: clasificacion oficial, visible para todos los jugadores.
 */

export type PublicationStatus = 'HIDDEN' | 'PUBLISHED';

export interface ClassificationPublicationTransition {
  classificationStatus: PublicationStatus;
  auditAction: 'CLASSIFICATION_PUBLISHED' | 'CLASSIFICATION_RETURNED_TO_PROVISIONAL';
}

export function buildClassificationPublicationTransition(
  official: boolean,
): ClassificationPublicationTransition {
  return official
    ? {
        classificationStatus: 'PUBLISHED',
        auditAction: 'CLASSIFICATION_PUBLISHED',
      }
    : {
        classificationStatus: 'HIDDEN',
        auditAction: 'CLASSIFICATION_RETURNED_TO_PROVISIONAL',
      };
}
