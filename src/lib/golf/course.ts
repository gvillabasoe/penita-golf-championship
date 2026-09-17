/**
 * Datos del campo y su validacion (secciones 17, 18 y 24).
 *
 * Fuente activa: microsite oficial RFEG del Club de Golf Ulzama (codigo 4401),
 * recorrido ULZAMA, barras AMARILLAS, categoria CABALLEROS.
 * Consultado el 17/09/2026. Ver data/ulzama.snapshot.json y
 * docs/course-data-sources.md para la trazabilidad completa.
 *
 * Par, stroke index y distancias coinciden en tres fuentes independientes
 * (ficha PDF 2005/2014, tarjeta del campo e microsite RFEG vigente).
 * La VALORACION si difiere entre fuentes y por eso requiere confirmacion
 * administrativa antes de activarse.
 */

import type { CourseSnapshot, HoleSnapshot } from './types';

export const ULZAMA_HOLES: HoleSnapshot[] = [
  { holeNumber: 1, par: 4, strokeIndex: 5, distance: 348 },
  { holeNumber: 2, par: 3, strokeIndex: 17, distance: 117 },
  { holeNumber: 3, par: 4, strokeIndex: 7, distance: 337 },
  { holeNumber: 4, par: 4, strokeIndex: 13, distance: 297 },
  { holeNumber: 5, par: 5, strokeIndex: 1, distance: 523 },
  { holeNumber: 6, par: 3, strokeIndex: 15, distance: 167 },
  { holeNumber: 7, par: 4, strokeIndex: 3, distance: 400 },
  { holeNumber: 8, par: 4, strokeIndex: 9, distance: 332 },
  { holeNumber: 9, par: 5, strokeIndex: 11, distance: 478 },
  { holeNumber: 10, par: 5, strokeIndex: 16, distance: 486 },
  { holeNumber: 11, par: 4, strokeIndex: 8, distance: 344 },
  { holeNumber: 12, par: 3, strokeIndex: 14, distance: 203 },
  { holeNumber: 13, par: 4, strokeIndex: 4, distance: 338 },
  { holeNumber: 14, par: 4, strokeIndex: 2, distance: 359 },
  { holeNumber: 15, par: 3, strokeIndex: 12, distance: 169 },
  { holeNumber: 16, par: 4, strokeIndex: 10, distance: 356 },
  { holeNumber: 17, par: 4, strokeIndex: 6, distance: 350 },
  { holeNumber: 18, par: 5, strokeIndex: 18, distance: 447 },
];

/** Valoracion vigente segun RFEG (pendiente de confirmacion administrativa). */
export const ULZAMA_AMARILLAS_CABALLEROS: CourseSnapshot = {
  teeName: 'AMARILLAS',
  category: 'CABALLEROS',
  slopeRating: 139,
  courseRatingTenths: 726,
  parTotal: 72,
  distanceTotal: 6051,
  holes: ULZAMA_HOLES,
};

/** Valoracion historica de la ficha adjunta. Se conserva para comparar, no para jugar. */
export const ULZAMA_AMARILLAS_CABALLEROS_2014: CourseSnapshot = {
  ...ULZAMA_AMARILLAS_CABALLEROS,
  slopeRating: 132,
  courseRatingTenths: 722,
};

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
}

/**
 * Validacion completa. Devuelve todos los problemas, no solo el primero: el
 * administrador necesita ver la lista entera antes de activar una configuracion.
 */
export function validateCourseSnapshot(snapshot: CourseSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { holes } = snapshot;

  if (holes.length !== 18) {
    issues.push({
      severity: 'ERROR',
      code: 'HOLE_COUNT',
      message: `Deben existir 18 hoyos, hay ${holes.length}.`,
    });
  }

  const numbers = holes.map((h) => h.holeNumber).sort((a, b) => a - b);
  const expectedNumbers = Array.from({ length: holes.length }, (_, i) => i + 1);
  if (numbers.join(',') !== expectedNumbers.join(',')) {
    issues.push({
      severity: 'ERROR',
      code: 'HOLE_NUMBERING',
      message: 'La numeracion de hoyos no es 1..18 sin repeticiones.',
    });
  }

  const strokeIndexes = holes.map((h) => h.strokeIndex).sort((a, b) => a - b);
  const missing = expectedNumbers.filter((n) => !strokeIndexes.includes(n));
  const duplicated = strokeIndexes.filter((si, i) => strokeIndexes.indexOf(si) !== i);
  if (missing.length > 0) {
    issues.push({
      severity: 'ERROR',
      code: 'STROKE_INDEX_MISSING',
      message: `Faltan stroke index: ${missing.join(', ')}.`,
    });
  }
  if (duplicated.length > 0) {
    issues.push({
      severity: 'ERROR',
      code: 'STROKE_INDEX_DUPLICATED',
      message: `Stroke index duplicados: ${[...new Set(duplicated)].join(', ')}.`,
    });
  }

  for (const hole of holes) {
    if (!Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6) {
      issues.push({
        severity: 'ERROR',
        code: 'HOLE_PAR',
        message: `Par no valido en el hoyo ${hole.holeNumber}: ${hole.par}.`,
      });
    }
    if (!Number.isInteger(hole.distance) || hole.distance <= 0) {
      issues.push({
        severity: 'ERROR',
        code: 'HOLE_DISTANCE',
        message: `Distancia no valida en el hoyo ${hole.holeNumber}: ${hole.distance}.`,
      });
    }
  }

  const out = holes.filter((h) => h.holeNumber <= 9);
  const inn = holes.filter((h) => h.holeNumber >= 10);
  const parOut = out.reduce((s, h) => s + h.par, 0);
  const parIn = inn.reduce((s, h) => s + h.par, 0);
  const parTotal = parOut + parIn;
  const distanceOut = out.reduce((s, h) => s + h.distance, 0);
  const distanceIn = inn.reduce((s, h) => s + h.distance, 0);
  const distanceTotal = distanceOut + distanceIn;

  if (parTotal !== snapshot.parTotal) {
    issues.push({
      severity: 'ERROR',
      code: 'PAR_TOTAL',
      message: `La suma de pares (${parTotal}) no coincide con el par declarado (${snapshot.parTotal}).`,
    });
  }
  if (distanceTotal !== snapshot.distanceTotal) {
    issues.push({
      severity: 'ERROR',
      code: 'DISTANCE_TOTAL',
      message: `La suma de distancias (${distanceTotal}) no coincide con la declarada (${snapshot.distanceTotal}).`,
    });
  }
  if (snapshot.slopeRating < 55 || snapshot.slopeRating > 155) {
    issues.push({
      severity: 'ERROR',
      code: 'SLOPE_RANGE',
      message: `Slope fuera del rango WHS 55-155: ${snapshot.slopeRating}.`,
    });
  }
  const crDelta = Math.abs(snapshot.courseRatingTenths - snapshot.parTotal * 10);
  if (crDelta > 80) {
    issues.push({
      severity: 'WARNING',
      code: 'RATING_VS_PAR',
      message: `El Valor de Campo se aleja mas de 8 golpes del par. Revisar que la valoracion corresponde a estas barras y categoria.`,
    });
  }

  return issues;
}

export interface SnapshotDiff {
  field: string;
  current: string;
  incoming: string;
}

/**
 * Compara dos configuraciones para el flujo de confirmacion (seccion 19-20).
 * Nunca sustituye: solo describe las diferencias.
 */
export function diffSnapshots(current: CourseSnapshot, incoming: CourseSnapshot): SnapshotDiff[] {
  const diffs: SnapshotDiff[] = [];
  const scalar: Array<[string, string, string]> = [
    ['Slope Rating', String(current.slopeRating), String(incoming.slopeRating)],
    [
      'Valor de Campo',
      (current.courseRatingTenths / 10).toFixed(1).replace('.', ','),
      (incoming.courseRatingTenths / 10).toFixed(1).replace('.', ','),
    ],
    ['Par total', String(current.parTotal), String(incoming.parTotal)],
    ['Distancia total', String(current.distanceTotal), String(incoming.distanceTotal)],
    ['Barras', current.teeName, incoming.teeName],
    ['Categoria', current.category, incoming.category],
  ];
  for (const [field, a, b] of scalar) {
    if (a !== b) diffs.push({ field, current: a, incoming: b });
  }

  for (const hole of incoming.holes) {
    const previous = current.holes.find((h) => h.holeNumber === hole.holeNumber);
    if (!previous) {
      diffs.push({ field: `Hoyo ${hole.holeNumber}`, current: '(no existia)', incoming: 'nuevo' });
      continue;
    }
    if (previous.par !== hole.par) {
      diffs.push({
        field: `Hoyo ${hole.holeNumber} - par`,
        current: String(previous.par),
        incoming: String(hole.par),
      });
    }
    if (previous.strokeIndex !== hole.strokeIndex) {
      diffs.push({
        field: `Hoyo ${hole.holeNumber} - stroke index`,
        current: String(previous.strokeIndex),
        incoming: String(hole.strokeIndex),
      });
    }
    if (previous.distance !== hole.distance) {
      diffs.push({
        field: `Hoyo ${hole.holeNumber} - distancia`,
        current: String(previous.distance),
        incoming: String(hole.distance),
      });
    }
  }

  return diffs;
}
