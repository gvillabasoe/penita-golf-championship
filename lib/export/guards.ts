/**
 * Permisos de exportacion (secciones 61, 63 y 66).
 *
 * La regla de la seccion 63 es tajante: "La clasificacion completa solo se
 * exporta cuando esta publicada". Se aplica **tambien al administrador**. Un PDF
 * de la clasificacion definitiva circulando por WhatsApp media hora antes de la
 * entrega de premios arruina la revelacion, y eso no se puede deshacer.
 *
 * Lo que el administrador si necesita antes de publicar es poder revisar el
 * provisional. Eso existe como tipo de exportacion distinto y el documento sale
 * marcado como provisional en su propia cabecera, no como un detalle opcional.
 */

export type Role = 'PLAYER' | 'ADMIN';
export type ClassificationStatus = 'HIDDEN' | 'REVEALING' | 'PUBLISHED';

export type ExportKind =
  | 'LEADERBOARD_FINAL'
  | 'LEADERBOARD_PROVISIONAL'
  | 'SCORECARD'
  | 'FLIGHTS'
  | 'TEE_TIMES'
  | 'AUDIT_LOG'
  | 'COURSE_CONFIG';

export interface ExportRequest {
  kind: ExportKind;
  role: Role;
  classificationStatus: ClassificationStatus;
  /** Para SCORECARD: quien pide y de quien es la tarjeta. */
  requesterPlayerId?: string;
  targetPlayerId?: string;
  requesterFlightId?: string | null;
  targetFlightId?: string | null;
}

export type ExportDecision =
  | { allowed: true; requiresProvisionalMark: boolean }
  | { allowed: false; reason: string };

export function canExport(request: ExportRequest): ExportDecision {
  switch (request.kind) {
    case 'LEADERBOARD_FINAL': {
      if (request.classificationStatus !== 'PUBLISHED') {
        return {
          allowed: false,
          reason:
            'La clasificacion completa solo se puede exportar una vez publicada. Usa la exportacion provisional si necesitas revisarla antes.',
        };
      }
      return { allowed: true, requiresProvisionalMark: false };
    }

    case 'LEADERBOARD_PROVISIONAL': {
      if (request.role !== 'ADMIN') {
        return {
          allowed: false,
          reason: 'Solo el administrador puede exportar la clasificacion provisional.',
        };
      }
      if (request.classificationStatus === 'PUBLISHED') {
        return {
          allowed: false,
          reason: 'La clasificacion ya esta publicada: exporta la version definitiva.',
        };
      }
      return { allowed: true, requiresProvisionalMark: true };
    }

    case 'SCORECARD': {
      if (request.role === 'ADMIN') return { allowed: true, requiresProvisionalMark: false };

      const isOwn = request.requesterPlayerId === request.targetPlayerId;
      if (isOwn) return { allowed: true, requiresProvisionalMark: false };

      if (request.classificationStatus === 'PUBLISHED') {
        return { allowed: true, requiresProvisionalMark: false };
      }

      const sameFlight =
        request.requesterFlightId != null &&
        request.targetFlightId != null &&
        request.requesterFlightId === request.targetFlightId;

      if (sameFlight) return { allowed: true, requiresProvisionalMark: true };

      return {
        allowed: false,
        reason:
          'Las tarjetas de otros partidos no se pueden exportar hasta publicar la clasificacion.',
      };
    }

    case 'FLIGHTS':
    case 'TEE_TIMES':
      // Los partidos y las horas son publicos: todo el mundo necesita saber
      // cuando sale y con quien.
      return { allowed: true, requiresProvisionalMark: false };

    case 'AUDIT_LOG':
    case 'COURSE_CONFIG': {
      if (request.role !== 'ADMIN') {
        return { allowed: false, reason: 'Solo el administrador puede exportar este documento.' };
      }
      return { allowed: true, requiresProvisionalMark: false };
    }

    default: {
      const exhaustive: never = request.kind;
      return { allowed: false, reason: `Tipo de exportacion desconocido: ${String(exhaustive)}` };
    }
  }
}

export class ExportNotAllowedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ExportNotAllowedError';
  }
}

/** Version que lanza, para usar directamente en una ruta de la API. */
export function assertCanExport(request: ExportRequest): { requiresProvisionalMark: boolean } {
  const decision = canExport(request);
  if (!decision.allowed) throw new ExportNotAllowedError(decision.reason);
  return { requiresProvisionalMark: decision.requiresProvisionalMark };
}
