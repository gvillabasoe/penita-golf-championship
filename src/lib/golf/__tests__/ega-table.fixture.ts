/**
 * TABLA DE EQUIVALENCIAS - HANDICAP DE JUEGO EGA
 * ULZAMA - 09/10/2014 - BARRAS AMARILLAS - CABALLEROS - Vc 72,2 / Slope 132 / Par 72
 *
 * Transcrito de la ficha adjunta `SLOPE GOLF CLUB ULZAMA.pdf` (paginas 3 y 4).
 *
 * Esta tabla es un documento OFICIAL de la RFEG y se usa aqui como oraculo para
 * verificar la formula del hándicap de campo. Cada fila es un intervalo cerrado
 * de hándicap exacto que debe producir un hándicap de juego concreto.
 *
 * Atencion: la tabla es EGA 2014 y corresponde al 100% del hándicap (lo que el
 * WHS llama Course Handicap). NO incluye la asignacion del 95%.
 *
 * Se han omitido deliberadamente 3 filas del tramo 45,7-46,4 y aledanos porque
 * la extraccion del PDF no permitia leerlas con total seguridad. Verificar a
 * mano contra el PDF antes de anadirlas.
 */

export interface EgaTableRow {
  /** Extremo inferior del intervalo, en decimas. Plus en negativo. */
  fromTenths: number;
  /** Extremo superior del intervalo, en decimas. */
  toTenths: number;
  /** Hándicap de juego EGA esperado (= Course Handicap WHS). */
  expected: number;
}

export const ULZAMA_AMARILLAS_2014 = {
  courseRatingTenths: 722,
  slopeRating: 132,
  parTotal: 72,
} as const;

export const EGA_TABLE_AMARILLAS_CABALLEROS: EgaTableRow[] = [
  { fromTenths: -40, toTenths: -32, expected: -4 },
  { fromTenths: -31, toTenths: -24, expected: -3 },
  { fromTenths: -23, toTenths: -15, expected: -2 },
  { fromTenths: -14, toTenths: -6, expected: -1 },
  { fromTenths: -5, toTenths: 2, expected: 0 },
  { fromTenths: 3, toTenths: 11, expected: 1 },
  { fromTenths: 12, toTenths: 19, expected: 2 },
  { fromTenths: 20, toTenths: 28, expected: 3 },
  { fromTenths: 29, toTenths: 36, expected: 4 },
  { fromTenths: 37, toTenths: 45, expected: 5 },
  { fromTenths: 46, toTenths: 53, expected: 6 },
  { fromTenths: 54, toTenths: 62, expected: 7 },
  { fromTenths: 63, toTenths: 71, expected: 8 },
  { fromTenths: 72, toTenths: 79, expected: 9 },
  { fromTenths: 80, toTenths: 88, expected: 10 },
  { fromTenths: 89, toTenths: 96, expected: 11 },
  { fromTenths: 97, toTenths: 105, expected: 12 },
  { fromTenths: 106, toTenths: 113, expected: 13 },
  { fromTenths: 114, toTenths: 122, expected: 14 },
  { fromTenths: 123, toTenths: 130, expected: 15 },
  { fromTenths: 131, toTenths: 139, expected: 16 },
  { fromTenths: 140, toTenths: 148, expected: 17 },
  { fromTenths: 149, toTenths: 156, expected: 18 },
  { fromTenths: 157, toTenths: 165, expected: 19 },
  { fromTenths: 166, toTenths: 173, expected: 20 },
  { fromTenths: 174, toTenths: 182, expected: 21 },
  { fromTenths: 183, toTenths: 190, expected: 22 },
  { fromTenths: 191, toTenths: 199, expected: 23 },
  { fromTenths: 200, toTenths: 208, expected: 24 },
  { fromTenths: 209, toTenths: 216, expected: 25 },
  { fromTenths: 217, toTenths: 225, expected: 26 },
  { fromTenths: 226, toTenths: 233, expected: 27 },
  { fromTenths: 234, toTenths: 242, expected: 28 },
  { fromTenths: 243, toTenths: 250, expected: 29 },
  { fromTenths: 251, toTenths: 259, expected: 30 },
  { fromTenths: 260, toTenths: 267, expected: 31 },
  { fromTenths: 268, toTenths: 276, expected: 32 },
  { fromTenths: 277, toTenths: 285, expected: 33 },
  { fromTenths: 286, toTenths: 293, expected: 34 },
  { fromTenths: 294, toTenths: 302, expected: 35 },
  { fromTenths: 303, toTenths: 310, expected: 36 },
  { fromTenths: 311, toTenths: 319, expected: 37 },
  { fromTenths: 320, toTenths: 327, expected: 38 },
  { fromTenths: 328, toTenths: 336, expected: 39 },
  { fromTenths: 337, toTenths: 344, expected: 40 },
  { fromTenths: 345, toTenths: 353, expected: 41 },
  { fromTenths: 354, toTenths: 362, expected: 42 },
  { fromTenths: 363, toTenths: 370, expected: 43 },
  { fromTenths: 371, toTenths: 379, expected: 44 },
  { fromTenths: 380, toTenths: 387, expected: 45 },
  { fromTenths: 388, toTenths: 396, expected: 46 },
  { fromTenths: 397, toTenths: 404, expected: 47 },
  { fromTenths: 405, toTenths: 413, expected: 48 },
  { fromTenths: 414, toTenths: 422, expected: 49 },
  { fromTenths: 423, toTenths: 430, expected: 50 },
  { fromTenths: 431, toTenths: 439, expected: 51 },
  { fromTenths: 440, toTenths: 447, expected: 52 },
  { fromTenths: 448, toTenths: 456, expected: 53 },
  { fromTenths: 500, toTenths: 507, expected: 59 },
  { fromTenths: 508, toTenths: 516, expected: 60 },
  { fromTenths: 517, toTenths: 524, expected: 61 },
  { fromTenths: 525, toTenths: 533, expected: 62 },
  { fromTenths: 534, toTenths: 540, expected: 63 },
];
