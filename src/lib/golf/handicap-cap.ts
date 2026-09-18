/**
 * Limite maximo de hándicap exacto aplicable.
 *
 * ---------------------------------------------------------------------------
 * Que hace y que NO hace
 * ---------------------------------------------------------------------------
 * El limite NO modifica el hándicap exacto de nadie. Lo unico que cambia es la
 * ENTRADA del motor de hándicap: un jugador de 30,2 con el limite en 26,4
 * compite calculando su hándicap de campo y de juego a partir de 26,4, y su
 * 30,2 sigue guardado, visible y siendo el que decide el segundo criterio de
 * desempate.
 *
 * Esa separacion es la razon de que este modulo no toque `handicap.ts`:
 * `calculateHandicap` recibe unas decimas y no tiene por que saber de donde
 * salen. Aqui solo se decide cuales son esas decimas.
 *
 * ---------------------------------------------------------------------------
 * Por que decimas y no Decimal
 * ---------------------------------------------------------------------------
 * Porque el limite es una entrada del calculo del hándicap de juego, y la regla
 * de este proyecto es que nada que decida una clasificacion pasa por coma
 * flotante. 26,4 se guarda como 264.
 */

import {
  HandicapParseError,
  MAX_HANDICAP_INDEX_TENTHS,
  formatTenths,
  parseHandicapIndexToTenths,
} from './decimal';

/**
 * Limite minimo admisible, en decimas.
 *
 * Un limite por debajo de scratch convertiria a todo el mundo en jugador plus,
 * que no es limitar sino inventar una competicion distinta. El minimo razonable
 * es 0,0.
 */
export const MIN_HANDICAP_CAP_TENTHS = 0;
export const MAX_HANDICAP_CAP_TENTHS = MAX_HANDICAP_INDEX_TENTHS;

/**
 * Interpreta el limite escrito por el administrador.
 *
 * Acepta coma y punto, con o sin decimal: "24", "26,4", "26.4", " 26,4 ".
 * Reutiliza el analizador del hándicap exacto, que ya tiene sus tests, y
 * despues aplica las dos restricciones propias del limite.
 *
 * Rechaza la notacion plus ("+2,4"): un limite plus no limita a nadie de los que
 * el limite pretende afectar, y aceptarlo en silencio dejaria una configuracion
 * que no hace lo que su autor cree.
 */
export function parseHandicapCapToTenths(raw: string): number {
  const tenths = parseHandicapIndexToTenths(raw);

  if (tenths < MIN_HANDICAP_CAP_TENTHS) {
    throw new HandicapParseError(
      'El limite no puede ser un hándicap plus ni negativo. Escribe un valor entre 0,0 y 54,0.',
      raw,
    );
  }
  if (tenths > MAX_HANDICAP_CAP_TENTHS) {
    throw new HandicapParseError(
      'El limite no puede pasar de 54,0, que es el hándicap maximo del sistema.',
      raw,
    );
  }
  return tenths;
}

/**
 * Hándicap exacto que se usara para calcular.
 *
 *   sin limite       -> el hándicap exacto original
 *   con limite       -> min(exacto, limite)
 *
 * Un jugador plus (decimas negativas) nunca se ve afectado: su hándicap ya es
 * menor que cualquier limite admisible.
 */
export function applicableHandicapTenths(
  handicapIndexTenths: number,
  maxHandicapIndexTenths: number | null,
): number {
  if (maxHandicapIndexTenths === null) return handicapIndexTenths;
  return Math.min(handicapIndexTenths, maxHandicapIndexTenths);
}

/** Version anulable, para los jugadores que todavia no tienen hándicap. */
export function applicableHandicapTenthsOrNull(
  handicapIndexTenths: number | null,
  maxHandicapIndexTenths: number | null,
): number | null {
  if (handicapIndexTenths === null) return null;
  return applicableHandicapTenths(handicapIndexTenths, maxHandicapIndexTenths);
}

export interface HandicapCapView {
  /** Hándicap exacto del jugador, sin tocar. */
  exactTenths: number | null;
  /** Hándicap que entra en el calculo. */
  appliedTenths: number | null;
  isCapped: boolean;
  /** "30,2" */
  exactLabel: string | null;
  /** "26,4" */
  appliedLabel: string | null;
  /** "HCP limitado a 26,4", o null cuando no aplica. */
  badge: string | null;
}

/**
 * Todo lo que una pantalla necesita saber del limite para un jugador.
 *
 * Existe para que ninguna pantalla vuelva a decidir por su cuenta si un
 * hándicap esta limitado: la condicion es una sola comparacion, pero repetida en
 * seis sitios acabaria discrepando en alguno.
 */
export function describeHandicapCap(
  handicapIndexTenths: number | null,
  maxHandicapIndexTenths: number | null,
): HandicapCapView {
  const appliedTenths = applicableHandicapTenthsOrNull(
    handicapIndexTenths,
    maxHandicapIndexTenths,
  );
  const isCapped =
    handicapIndexTenths !== null &&
    appliedTenths !== null &&
    appliedTenths !== handicapIndexTenths;

  return {
    exactTenths: handicapIndexTenths,
    appliedTenths,
    isCapped,
    exactLabel: handicapIndexTenths === null ? null : formatTenths(handicapIndexTenths),
    appliedLabel: appliedTenths === null ? null : formatTenths(appliedTenths),
    badge: isCapped ? `HCP limitado a ${formatTenths(appliedTenths as number)}` : null,
  };
}

export interface CapChangeImpact {
  competitionPlayerId: string;
  displayName: string;
  exactTenths: number;
  beforeAppliedTenths: number;
  afterAppliedTenths: number;
}

/**
 * A quien afecta cambiar el limite, ANTES de aplicarlo.
 *
 * La seccion 5.4 exige avisar de que los puntos y la clasificacion pueden
 * cambiar. Un aviso generico no sirve de nada: esto devuelve los jugadores
 * concretos y con que valor pasan a competir.
 */
export function capChangeImpact(
  players: Array<{
    competitionPlayerId: string;
    displayName: string;
    handicapIndexTenths: number | null;
  }>,
  currentCapTenths: number | null,
  nextCapTenths: number | null,
): CapChangeImpact[] {
  const impact: CapChangeImpact[] = [];

  for (const player of players) {
    if (player.handicapIndexTenths === null) continue;

    const before = applicableHandicapTenths(player.handicapIndexTenths, currentCapTenths);
    const after = applicableHandicapTenths(player.handicapIndexTenths, nextCapTenths);
    if (before === after) continue;

    impact.push({
      competitionPlayerId: player.competitionPlayerId,
      displayName: player.displayName,
      exactTenths: player.handicapIndexTenths,
      beforeAppliedTenths: before,
      afterAppliedTenths: after,
    });
  }

  return impact;
}

/** Aviso que se muestra antes de guardar cuando ya hay resultados escritos. */
export const CAP_RECALCULATION_WARNING =
  'Cambiar el limite de hándicap recalculara el hándicap de juego, los golpes recibidos, los puntos y la clasificacion de todos los jugadores afectados.';

export const CAP_EXPLANATION =
  'Los jugadores que tengan un hándicap exacto superior al limite competiran utilizando este valor maximo para calcular su hándicap de campo y su hándicap de juego. Su hándicap exacto original se conservara.';
