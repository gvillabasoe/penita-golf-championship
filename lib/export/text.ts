/**
 * Saneado de texto para las exportaciones (seccion 63).
 *
 * Las fuentes estandar de PDF usan codificacion WinAnsi, que NO cubre todo
 * Unicode. Comprobado contra pdf-lib: acentos, enye, comillas tipograficas,
 * rayas largas y el espacio duro pasan sin problema, pero un emoji, un
 * "check", una flecha o una letra griega **lanzan una excepcion y tumban la
 * exportacion entera**.
 *
 * Eso no es teorico: los motivos de correccion y las observaciones de una
 * revision los escribe una persona desde el movil, con su teclado y sus
 * emojis. Un pulgar arriba en una observacion dejaria sin PDF a toda la
 * clasificacion.
 *
 * Solucion: sanear antes de dibujar. Los caracteres frecuentes se transliteran
 * a algo legible y el resto se sustituye. Nunca se lanza.
 */

/** Sustituciones legibles para lo que aparece de verdad al escribir en movil. */
const TRANSLITERATIONS: Record<string, string> = {
  '\u2192': '->',
  '\u2190': '<-',
  '\u2713': 'OK',
  '\u2714': 'OK',
  '\u2717': 'X',
  '\u2718': 'X',
  '\u2022': '-',
  '\u2026': '...',
  '\u20bd': 'RUB',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u2260': '!=',
  '\u00b1': '+/-',
  '\u2716': 'X',
};

/** Rango que WinAnsi cubre: Latin-1 mas el bloque de puntuacion de Windows. */
function isWinAnsiEncodable(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true; // ASCII imprimible
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true; // Latin-1 suplemento
  // Bloque 0x80-0x9f de WinAnsi: comillas, rayas, euro, etc.
  const winAnsiExtras = [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
    0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ];
  return winAnsiExtras.includes(codePoint);
}

export const REPLACEMENT_CHARACTER = '?';

/**
 * Deja una cadena lista para dibujar con una fuente estandar de PDF.
 *
 * - Normaliza a NFC para que "á" compuesta y descompuesta se traten igual.
 * - Translitera lo conocido.
 * - Sustituye lo que no se puede codificar.
 * - Colapsa espacios raros y recorta.
 *
 * Nunca lanza, para cualquier entrada.
 */
export function sanitizeForPdf(input: string): string {
  if (typeof input !== 'string') return '';

  const normalized = input.normalize('NFC');
  let out = '';

  for (const char of normalized) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x09) {
      out += ' ';
      continue;
    }
    if (TRANSLITERATIONS[char] !== undefined) {
      out += TRANSLITERATIONS[char];
      continue;
    }
    if (isWinAnsiEncodable(codePoint)) {
      out += char;
      continue;
    }
    out += REPLACEMENT_CHARACTER;
  }

  return out.replace(/[ \u00a0]{2,}/g, ' ').trim();
}

/** True si la cadena se pudo representar sin perder nada. */
export function isLossless(input: string): boolean {
  return sanitizeForPdf(input) === input.normalize('NFC').trim();
}

/**
 * Recorta a un ancho maximo, en caracteres, con puntos suspensivos.
 * Se usa en las columnas de la tabla para que un apellido largo no se solape
 * con la columna siguiente.
 */
export function truncate(input: string, maxChars: number): string {
  if (maxChars < 2) throw new Error('maxChars debe ser al menos 2.');
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars - 1).trimEnd()}.`;
}

/** Escapado para SVG y XML. Orden importante: el ampersand primero. */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formatea decimas con la convencion espanola: 207 -> "20,7"; -24 -> "+2,4". */
export function formatHandicap(tenths: number): string {
  const isPlus = tenths < 0;
  const abs = Math.abs(tenths);
  const body = `${Math.trunc(abs / 10)},${abs % 10}`;
  return isPlus ? `+${body}` : body;
}

/** Fecha legible en espanol a partir de un ISO, sin depender de la zona del servidor. */
export function formatDate(iso: string | null, timeZone = 'Europe/Madrid'): string {
  if (iso === null) return 'Fecha sin definir';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Fecha no valida';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}
