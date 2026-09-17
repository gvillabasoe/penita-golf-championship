/**
 * Aritmetica exacta para el motor deportivo.
 *
 * Regla de oro: ningun valor que influya en la clasificacion pasa por `number`
 * decimal. Todo se representa como enteros (decimas / centesimas) y las
 * divisiones se resuelven con redondeo explicito sobre enteros.
 */

export class HandicapParseError extends Error {
  constructor(message: string, readonly input: string) {
    super(message);
    this.name = 'HandicapParseError';
  }
}

/** Limites EGA/WHS del Handicap Index. */
export const MIN_HANDICAP_INDEX_TENTHS = -100; // +10,0
export const MAX_HANDICAP_INDEX_TENTHS = 540; // 54,0

/**
 * Convierte un hándicap exacto escrito por una persona a decimas de golpe.
 *
 * Acepta: "20,7" | "20.7" | "20" | " 20,7 " | "+2,4" | "+2.4" | "-2,4" | "0"
 * Devuelve: decimas. "+2,4" -> -24 (convencion de golf: plus = mejor que scratch).
 *
 * Rechaza: cadena vacia, mas de un decimal, texto, valores fuera de [+10,0 .. 54,0].
 */
export function parseHandicapIndexToTenths(raw: string): number {
  if (typeof raw !== 'string') {
    throw new HandicapParseError('El hándicap debe introducirse como texto.', String(raw));
  }
  const input = raw.trim().replace(/\s+/g, '');
  if (input === '') {
    throw new HandicapParseError('El hándicap no puede estar vacio.', raw);
  }

  const match = /^([+-]?)(\d{1,2})(?:[.,](\d))?$/.exec(input);
  if (!match) {
    throw new HandicapParseError(
      'Formato no valido. Usa por ejemplo 20,7 o 20.7 (plus: +2,4).',
      raw,
    );
  }

  const [, sign, wholePart, decimalPart] = match;
  const tenths = Number(wholePart) * 10 + (decimalPart ? Number(decimalPart) : 0);
  // En golf, "+2,4" significa 2,4 MEJOR que scratch -> negativo internamente.
  const signed = sign === '+' || sign === '-' ? -tenths : tenths;

  if (signed < MIN_HANDICAP_INDEX_TENTHS || signed > MAX_HANDICAP_INDEX_TENTHS) {
    throw new HandicapParseError(
      `Fuera de rango. El hándicap exacto debe estar entre +10,0 y 54,0.`,
      raw,
    );
  }
  return signed;
}

/** Formatea decimas con la convencion de golf espanola: 207 -> "20,7"; -24 -> "+2,4". */
export function formatTenths(tenths: number): string {
  const isPlus = tenths < 0;
  const abs = Math.abs(tenths);
  const body = `${Math.trunc(abs / 10)},${abs % 10}`;
  return isPlus ? `+${body}` : body;
}

/** Formatea centesimas: 2461 -> "24,61". Mantiene el signo aritmetico real. */
export function formatHundredths(hundredths: number): string {
  const sign = hundredths < 0 ? '-' : '';
  const abs = Math.abs(hundredths);
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Redondeo de n/d al entero mas proximo, con el 0,5 alejandose de cero.
 * Solo enteros: sin coma flotante en ningun punto.
 *
 * roundDiv(3538, 1000)  ->  4
 * roundDiv(-3538, 1000) -> -4
 * roundDiv(1500, 1000)  ->  2
 * roundDiv(-1500, 1000) -> -2
 */
export function roundDiv(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error('roundDiv solo opera con enteros.');
  }
  if (denominator === 0) throw new Error('Division por cero.');
  const negative = numerator < 0 !== denominator < 0;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const magnitude = Math.floor((2 * n + d) / (2 * d));
  // `magnitude === 0` con signo negativo produciria -0, que sobrevive a JSON,
  // a Prisma y a Object.is() rompiendo comparaciones de igualdad mas arriba.
  if (magnitude === 0) return 0;
  return negative ? -magnitude : magnitude;
}

/** Trunca n/d hacia cero. Util para diagnosticos, no para reglas deportivas. */
export function truncDiv(numerator: number, denominator: number): number {
  return Math.trunc(numerator / denominator);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
