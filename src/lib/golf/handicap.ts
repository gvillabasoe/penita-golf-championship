/**
 * Motor de hándicap.
 *
 * Formula (WHS / RFEG, verificada contra la Tabla de Equivalencias EGA oficial
 * de Ulzama incluida en la ficha adjunta - ver __tests__/handicap.test.ts):
 *
 *   courseHandicapRaw = HandicapIndex x (Slope / 113) + (CourseRating - Par)
 *   playingHandicap    = round(courseHandicapRaw x allowance% / 100)
 *
 * Implementacion exacta sin coma flotante:
 *
 *   Sea HI_t  = hándicap exacto en decimas
 *       CR_t  = Valor de Campo en decimas
 *       S     = Slope
 *       P     = par
 *
 *   courseHandicapRaw x 1130 = HI_t x S + 113 x (CR_t - 10P)       <- entero exacto
 *
 * A partir de ese entero se derivan todos los redondeos.
 */

import { roundDiv } from './decimal';
import type { CourseSnapshot, HandicapCalculation, HandicapRuleSet } from './types';

/**
 * Juego de reglas por defecto de esta edicion.
 *
 * `ROUND_TWICE` desde el 17/09/2026, autorizado por el organizador (Gonzalo
 * Villabaso) despues de ver la medicion del impacto. El pliego original pedia
 * `ROUND_ONCE` en su seccion 28.
 *
 * Motivo del cambio: `ROUND_TWICE` es la lectura literal del WHS, donde el
 * hándicap de campo es un entero antes de aplicar la asignacion. Es lo que
 * calcula cualquier calculadora WHS y lo que figura en el tablon del club. Si un
 * jugador comprueba su hándicap de juego por fuera y no le cuadra con la app, el
 * problema aparece el dia del torneo.
 *
 * Las dos politicas difieren en 125 de los 541 hándicaps exactos posibles, y
 * siempre por un solo golpe. Ver docs/rounding-divergence-table.md.
 *
 * Para volver atras: cambiar `roundingPolicy` aqui y en el valor por defecto de
 * `Competition.handicapRoundingPolicy` en prisma/schema.prisma. La competicion
 * guarda su propia politica, asi que una edicion ya jugada no se ve afectada.
 */
export const DEFAULT_RULE_SET: HandicapRuleSet = {
  allowancePercent: 95,
  roundingPolicy: 'ROUND_TWICE',
  ruleVersion: 'WHS-2026/ES;allowance=95;rounding=ROUND_TWICE',
};

const SCALE = 1130; // = 113 x 10

/**
 * Hándicap de campo sin redondear, expresado x1130 (entero exacto).
 * Es el unico valor del que derivan todos los demas.
 */
export function courseHandicapRawX1130(
  handicapIndexTenths: number,
  slopeRating: number,
  courseRatingTenths: number,
  parTotal: number,
): number {
  if (!Number.isInteger(handicapIndexTenths)) {
    throw new Error('handicapIndexTenths debe ser un entero (decimas).');
  }
  if (!Number.isInteger(courseRatingTenths)) {
    throw new Error('courseRatingTenths debe ser un entero (decimas).');
  }
  if (!Number.isInteger(slopeRating) || slopeRating < 55 || slopeRating > 155) {
    throw new Error(`Slope fuera de rango WHS (55-155): ${slopeRating}`);
  }
  if (!Number.isInteger(parTotal) || parTotal < 27 || parTotal > 80) {
    throw new Error(`Par total implausible: ${parTotal}`);
  }
  return handicapIndexTenths * slopeRating + 113 * (courseRatingTenths - 10 * parTotal);
}

/** Hándicap de campo redondeado al entero mas proximo. */
export function courseHandicap(
  handicapIndexTenths: number,
  slopeRating: number,
  courseRatingTenths: number,
  parTotal: number,
): number {
  return roundDiv(
    courseHandicapRawX1130(handicapIndexTenths, slopeRating, courseRatingTenths, parTotal),
    SCALE,
  );
}

/**
 * Calculo completo y auditable. Devuelve todos los intermedios que exige la
 * seccion 28 del pliego para poder reconstruir el resultado meses despues.
 */
export function calculateHandicap(
  handicapIndexTenths: number,
  snapshot: Pick<CourseSnapshot, 'slopeRating' | 'courseRatingTenths' | 'parTotal'>,
  ruleSet: HandicapRuleSet = DEFAULT_RULE_SET,
  now: Date = new Date(),
): HandicapCalculation {
  const { slopeRating, courseRatingTenths, parTotal } = snapshot;
  const { allowancePercent, roundingPolicy, ruleVersion } = ruleSet;

  if (!Number.isInteger(allowancePercent) || allowancePercent < 1 || allowancePercent > 100) {
    throw new Error(`Porcentaje de hándicap no valido: ${allowancePercent}`);
  }

  const rawX1130 = courseHandicapRawX1130(
    handicapIndexTenths,
    slopeRating,
    courseRatingTenths,
    parTotal,
  );
  const courseHcp = roundDiv(rawX1130, SCALE);

  let playingRawX1130Times100: number;
  let playingHcp: number;

  if (roundingPolicy === 'ROUND_ONCE') {
    // Un unico redondeo: (raw sin redondear) x % -> redondeo.
    playingRawX1130Times100 = rawX1130 * allowancePercent;
    playingHcp = roundDiv(playingRawX1130Times100, SCALE * 100);
  } else {
    // Lectura literal WHS: redondea el hándicap de campo y luego aplica el %.
    playingRawX1130Times100 = courseHcp * SCALE * allowancePercent;
    playingHcp = roundDiv(courseHcp * allowancePercent, 100);
  }

  return {
    handicapIndexTenths,
    slopeRating,
    courseRatingTenths,
    parTotal,
    allowancePercent,
    roundingPolicy,
    ruleVersion,
    courseHandicapRawHundredths: roundDiv(rawX1130 * 100, SCALE),
    courseHandicap: courseHcp,
    playingHandicapRawHundredths: roundDiv(playingRawX1130Times100 * 100, SCALE * 100),
    playingHandicap: playingHcp,
    formula: `HJ = round( (${handicapIndexTenths / 10} x ${slopeRating} / 113 + (${courseRatingTenths / 10} - ${parTotal})) x ${allowancePercent}% )  [${roundingPolicy}]`,
    calculatedAt: now.toISOString(),
  };
}

/**
 * Lista los hándicaps exactos (en decimas) en los que ROUND_ONCE y ROUND_TWICE
 * dan un hándicap de juego distinto para un campo dado. Se usa en el panel de
 * administracion para que la decision de politica sea informada, no implicita.
 */
export function roundingPolicyDivergences(
  snapshot: Pick<CourseSnapshot, 'slopeRating' | 'courseRatingTenths' | 'parTotal'>,
  allowancePercent: number,
  fromTenths = 0,
  toTenths = 540,
): Array<{ handicapIndexTenths: number; roundOnce: number; roundTwice: number }> {
  const out: Array<{ handicapIndexTenths: number; roundOnce: number; roundTwice: number }> = [];
  for (let t = fromTenths; t <= toTenths; t += 1) {
    const once = calculateHandicap(t, snapshot, {
      allowancePercent,
      roundingPolicy: 'ROUND_ONCE',
      ruleVersion: 'cmp',
    }).playingHandicap;
    const twice = calculateHandicap(t, snapshot, {
      allowancePercent,
      roundingPolicy: 'ROUND_TWICE',
      ruleVersion: 'cmp',
    }).playingHandicap;
    if (once !== twice) {
      out.push({ handicapIndexTenths: t, roundOnce: once, roundTwice: twice });
    }
  }
  return out;
}
