/**
 * Contrato comun de las semillas de sorteos.
 *
 * Se aceptan semillas legibles elegidas por el administrador, pero deben caber
 * sin ambiguedad en los formularios, la auditoria y los documentos PDF.
 */
export const DRAW_SEED_MAX_LENGTH = 128;

export function normalizeDrawSeed(rawSeed: string | undefined): string {
  const seed = rawSeed?.trim() ?? '';
  if (seed.length > DRAW_SEED_MAX_LENGTH) {
    throw new Error(`La semilla no puede superar ${DRAW_SEED_MAX_LENGTH} caracteres.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(seed)) {
    throw new Error('La semilla debe escribirse en una sola linea y sin caracteres de control.');
  }
  return seed;
}
