/**
 * Fecha del campeonato y horas de salida.
 *
 * Las fechas se reciben de los campos del formulario como texto
 * ("2026-06-13", "09:10") y se guardan como instantes. La hora es siempre la de
 * Ulzama, Europe/Madrid, calculando el desplazamiento real de ese dia: el
 * servidor de Vercel corre en UTC, y un +02:00 fijo seria una hora de error si
 * el campeonato cayese en horario de invierno.
 */

export const TOURNAMENT_TIME_ZONE = 'Europe/Madrid';

export class ScheduleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleInputError';
  }
}

/** Valida "AAAA-MM-DD" y devuelve sus partes. Rechaza dias imposibles. */
export function parseDateInput(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!match) throw new ScheduleInputError('Fecha no válida. Usa el selector de fecha.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new ScheduleInputError('Esa fecha no existe.');
  }
  if (year < 2024 || year > 2100) throw new ScheduleInputError('Año fuera de rango.');
  return { year, month, day };
}

/** Valida "HH:MM" en 24 horas. */
export function parseTimeInput(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) throw new ScheduleInputError('Hora no válida. Usa el formato 24 h, por ejemplo 09:10.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new ScheduleInputError('Hora no válida.');
  return { hour, minute };
}

/**
 * Fecha del campeonato para guardar.
 *
 * Se guarda a las 12:00 UTC del dia elegido y no a medianoche: a medianoche UTC,
 * mostrada en Madrid, cualquier error de zona la desplazaria al dia anterior. A
 * mediodia, en Madrid sigue siendo el mismo dia en verano y en invierno.
 */
export function competitionDateFromInput(value: string): Date {
  const { year, month, day } = parseDateInput(value);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/** Desplazamiento de Madrid respecto a UTC en un instante, en minutos. */
function madridOffsetMinutes(instant: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: TOURNAMENT_TIME_ZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;

  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name ?? '');
  if (!match) return 0; // "GMT" a secas
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/**
 * Instante de una hora de reloj de Madrid en un dia concreto.
 *
 * madridInstant("2026-06-13", "09:10") -> 07:10 UTC (verano, +02:00)
 * madridInstant("2026-01-15", "09:10") -> 08:10 UTC (invierno, +01:00)
 */
export function madridInstant(dateValue: string, timeValue: string): Date {
  const { year, month, day } = parseDateInput(dateValue);
  const { hour, minute } = parseTimeInput(timeValue);

  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let utc = naive - madridOffsetMinutes(new Date(naive)) * 60_000;
  // Segunda pasada: en los dias de cambio de hora el primer calculo puede caer
  // al otro lado del cambio.
  const corrected = naive - madridOffsetMinutes(new Date(utc)) * 60_000;
  if (corrected !== utc) utc = corrected;
  return new Date(utc);
}

/** "AAAA-MM-DD" de un instante, visto en Madrid. Para rellenar el campo de fecha. */
export function dateInputInMadrid(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TOURNAMENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** "HH:MM" de un instante, visto en Madrid. Para rellenar el campo de hora. */
export function timeInputInMadrid(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TOURNAMENT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/**
 * Lleva una hora de salida a otro dia conservando la hora de reloj.
 *
 * Se usa al cambiar la fecha del campeonato: si el partido 1 salia a las 09:10,
 * tiene que seguir saliendo a las 09:10 del nuevo dia, no quedarse colgado en la
 * fecha antigua.
 */
export function moveTeeTimeToDate(teeTime: Date, newDateValue: string): Date {
  return madridInstant(newDateValue, timeInputInMadrid(teeTime));
}
