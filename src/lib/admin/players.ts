/**
 * Alta de jugadores desde el panel de administracion.
 *
 * Funciones puras: validacion de la ficha y eleccion del color. La accion de
 * servidor solo las llama y escribe; asi todo lo que decide algo se puede
 * probar sin base de datos.
 */

import { buildDisplayName, normalizeName } from '../auth/normalize';
import { HandicapParseError, parseHandicapIndexToTenths } from '../golf/decimal';
import { ACCENT_RAMP } from '../seed/roster';

/**
 * Longitud minima de la contrasena de un jugador nuevo.
 *
 * Seis y no ocho: las contrasenas de la edicion siguen el patron inicial,
 * apellido e indice, y la mas corta tiene siete caracteres. Exigir ocho
 * impediria dar de alta a un jugador nuevo con una contrasena del mismo estilo.
 */
export const MIN_NEW_PLAYER_PASSWORD_LENGTH = 6;
export const MAX_NAME_LENGTH = 60;
export const MAX_PASSWORD_LENGTH = 128;

export interface NewPlayerInput {
  firstName: string;
  lastName: string;
  password: string;
  /** Vacio = sin hándicap todavia; se puede fijar despues en su ficha. */
  handicap: string;
}

export type NewPlayerField = 'firstName' | 'lastName' | 'password' | 'handicap';

export type NewPlayerValidation =
  | {
      ok: true;
      firstName: string;
      lastName: string;
      displayName: string;
      normalizedName: string;
      password: string;
      handicapIndexTenths: number | null;
    }
  | { ok: false; fieldErrors: Partial<Record<NewPlayerField, string>> };

function cleanName(value: string): string {
  return (typeof value === 'string' ? value : '').trim().replace(/\s+/g, ' ');
}

function nameError(value: string, label: string): string | null {
  if (value === '') return `Falta el ${label}.`;
  if (value.length > MAX_NAME_LENGTH) return `El ${label} es demasiado largo.`;
  if (!/\p{L}/u.test(value)) return `El ${label} tiene que contener letras.`;
  return null;
}

/**
 * Valida la ficha completa y devuelve TODOS los errores a la vez, cada uno
 * asociado a su campo: el formulario los muestra junto al campo que toca.
 *
 * La contrasena no se recorta: un espacio al final es parte de ella.
 */
export function validateNewPlayer(input: NewPlayerInput): NewPlayerValidation {
  const fieldErrors: Partial<Record<NewPlayerField, string>> = {};

  const firstName = cleanName(input.firstName);
  const lastName = cleanName(input.lastName);

  const firstError = nameError(firstName, 'nombre');
  if (firstError) fieldErrors.firstName = firstError;
  const lastError = nameError(lastName, 'apellido');
  if (lastError) fieldErrors.lastName = lastError;

  const password = typeof input.password === 'string' ? input.password : '';
  if (password.trim() === '') {
    fieldErrors.password = 'Falta la contraseña.';
  } else if (password.length < MIN_NEW_PLAYER_PASSWORD_LENGTH) {
    fieldErrors.password = `La contraseña debe tener al menos ${MIN_NEW_PLAYER_PASSWORD_LENGTH} caracteres.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password = 'La contraseña es demasiado larga.';
  }

  let handicapIndexTenths: number | null = null;
  const rawHandicap = (typeof input.handicap === 'string' ? input.handicap : '').trim();
  if (rawHandicap !== '') {
    try {
      handicapIndexTenths = parseHandicapIndexToTenths(rawHandicap);
    } catch (error) {
      fieldErrors.handicap =
        error instanceof HandicapParseError ? error.message : 'Hándicap no válido.';
    }
  }

  const normalizedName = normalizeName(`${firstName} ${lastName}`);
  if (!fieldErrors.firstName && !fieldErrors.lastName && normalizedName === '') {
    fieldErrors.firstName = 'El nombre no es válido.';
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    firstName,
    lastName,
    displayName: buildDisplayName(firstName, lastName),
    normalizedName,
    password,
    handicapIndexTenths,
  };
}

// ---------------------------------------------------------------------------
// Color del jugador
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contraste WCAG entre dos colores. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Contraste minimo frente al blanco, el fondo de tarjetas y filas. */
export const MIN_COLOR_CONTRAST = 4.5;

/** Candidatos que se generan para quedarse con el mas distinto. */
const GENERATED_CANDIDATES = 300;

/** Distancia del color mas cercano entre los usados. */
export function nearestDistance(color: string, usedColors: string[]): number {
  if (usedColors.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...usedColors.map((used) => colorDistance(color, used)));
}

/**
 * Color representativo para un jugador nuevo, elegido al azar.
 *
 * Primero se intenta con los colores de la paleta que no use nadie, elegidos al
 * azar entre ellos. La paleta tiene trece y la edicion trece jugadores, asi que
 * a partir del decimocuarto ya no quedan.
 *
 * Entonces se generan trescientos candidatos con tono aleatorio, oscuros y
 * moderadamente saturados como los de la paleta, se descartan los que no
 * contrastan con el blanco, y **se elige el que mas se aleja del color usado mas
 * parecido**. No se exige una distancia fija: los colores oscuros ocupan una
 * region pequena del espacio de color y, con muchos jugadores, un umbral fijo
 * acabaria sin cumplirse. La propia paleta original tiene parejas a distancia
 * 22; el elegido supera eso con holgura (medido: 67-76 para el jugador 14, y
 * por encima de 37 incluso para el 20).
 *
 * `random` se inyecta para poder probarlo; en produccion es Math.random.
 */
export function pickPlayerColor(usedColors: string[], random: () => number = Math.random): string {
  const used = usedColors.map((color) => color.toLowerCase());
  const free = ACCENT_RAMP.filter((color) => !used.includes(color.toLowerCase()));
  if (free.length > 0) {
    return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
  }

  let best: string | null = null;
  let bestDistance = -1;

  for (let attempt = 0; attempt < GENERATED_CANDIDATES; attempt += 1) {
    const hue = Math.floor(random() * 360);
    const saturation = 40 + Math.floor(random() * 23); // 40-62 %
    const lightness = 24 + Math.floor(random() * 12); // 24-35 %
    const candidate = hslToHex(hue, saturation, lightness);
    if (contrastRatio(candidate, '#ffffff') < MIN_COLOR_CONTRAST) continue;
    if (used.includes(candidate)) continue;

    const distance = nearestDistance(candidate, used);
    if (distance > bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  // Con luminosidad maxima del 35 % todos los candidatos contrastan; esto solo
  // protege frente a un generador aleatorio degenerado.
  return best ?? '#1f3a2e';
}
