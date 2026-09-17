/**
 * Tipos del dominio deportivo.
 *
 * Convencion de unidades (critica):
 *  - `handicapIndexTenths`  : hándicap exacto en DECIMAS de golpe. 20,7 -> 207. Plus: +2,4 -> -24.
 *  - `courseRatingTenths`   : Valor de Campo en DECIMAS. 72,6 -> 726.
 *  - `slopeRating`          : entero (55..155 segun WHS).
 *  - Todo lo demas son golpes enteros.
 *
 * Nunca se almacena un hándicap como `number` decimal: la coma flotante no es
 * admisible en un motor que decide posiciones de clasificacion.
 */

export type TeeName = 'AMARILLAS' | 'BLANCAS' | 'AZULES' | 'ROJAS';
export type PlayerCategory = 'CABALLEROS' | 'DAMAS';

export interface HoleSnapshot {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  distance: number;
}

export interface CourseSnapshot {
  teeName: TeeName;
  category: PlayerCategory;
  slopeRating: number;
  courseRatingTenths: number;
  parTotal: number;
  distanceTotal: number;
  holes: HoleSnapshot[];
}

/**
 * Politica de redondeo del hándicap de juego.
 *
 * ROUND_ONCE  : redondea UNA sola vez, al final (hándicap de campo sin redondear
 *               x porcentaje -> redondeo). Es lo que pedia la seccion 28 del
 *               pliego original.
 * ROUND_TWICE : redondea el hándicap de campo, aplica el porcentaje y vuelve a
 *               redondear. Es la lectura literal del WHS (Course Handicap es un
 *               entero antes de aplicar la asignacion). ES LA POLITICA ACTIVA
 *               en esta edicion, autorizada por el organizador el 17/09/2026.
 *
 * Difieren en 125 de los 541 hándicaps exactos posibles, siempre por un golpe.
 * Ver docs/rounding-divergence-table.md para la lista completa.
 */
export type HandicapRoundingPolicy = 'ROUND_ONCE' | 'ROUND_TWICE';

export interface HandicapRuleSet {
  /** Porcentaje de asignacion. Individual Stableford: 95. */
  allowancePercent: number;
  roundingPolicy: HandicapRoundingPolicy;
  /** Identificador de version de regla, para auditoria. */
  ruleVersion: string;
}

export interface HandicapCalculation {
  handicapIndexTenths: number;
  slopeRating: number;
  courseRatingTenths: number;
  parTotal: number;
  allowancePercent: number;
  roundingPolicy: HandicapRoundingPolicy;
  ruleVersion: string;
  /** Hándicap de campo sin redondear, en centesimas (para mostrar y auditar). */
  courseHandicapRawHundredths: number;
  courseHandicap: number;
  /** Hándicap de juego sin redondear, en centesimas. */
  playingHandicapRawHundredths: number;
  playingHandicap: number;
  formula: string;
  calculatedAt: string;
}

/** Golpes recibidos por hoyo. Negativo = golpes que el jugador devuelve (plus). */
export interface StrokeAllocation {
  holeNumber: number;
  strokeIndex: number;
  strokesReceived: number;
}

export type GrossCategory =
  | 'HOLE_IN_ONE'
  | 'ALBATROS'
  | 'EAGLE'
  | 'BIRDIE'
  | 'PAR'
  | 'BOGEY'
  | 'DOUBLE_BOGEY'
  | 'TRIPLE_BOGEY_OR_WORSE'
  | 'PICKUP';

export interface HoleResult {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  strokesReceived: number;
  /** null si hay raya. */
  grossStrokes: number | null;
  isPickup: boolean;
  netStrokes: number | null;
  grossToPar: number | null;
  netToPar: number | null;
  stablefordPoints: number;
  grossCategory: GrossCategory;
}

export interface ScorecardTotals {
  out: { numericStrokes: number; points: number; holesPlayed: number; pickups: number };
  in: { numericStrokes: number; points: number; holesPlayed: number; pickups: number };
  total: {
    /** Suma de los golpes realmente escritos. Es lo que el jugador reconoce. */
    numericStrokes: number;
    /**
     * Suma AJUSTADA: los hoyos sin resultado numerico se imputan.
     *
     * Es el valor que usa el tercer criterio de desempate. Comparar sumas
     * numericas a secas favorecia a quien levantaba la bola, porque un hoyo con
     * raya no sumaba nada. Ver docs/stableford-rules.md.
     */
    adjustedStrokes: number;
    /** Cuantos hoyos se han imputado para llegar a `adjustedStrokes`. */
    imputedHoles: number;
    points: number;
    holesPlayed: number;
    pickups: number;
    /** null cuando hay rayas o hoyos sin jugar: el bruto no es comparable. */
    grossToPar: number | null;
    isGrossComplete: boolean;
  };
}

export type ScorecardStatus =
  | 'NOT_STARTED'
  | 'IN_PLAY'
  | 'FINISHED'
  | 'REVIEWED'
  | 'LOCKED';

export interface RankingInput {
  competitionPlayerId: string;
  displayName: string;
  color: string;
  handicapIndexTenths: number;
  playingHandicap: number;
  points: number;
  /** Golpes escritos. Solo para mostrar: no decide nada. */
  numericStrokes: number;
  /** Golpes con los hoyos sin resultado imputados. Es el tercer criterio. */
  adjustedStrokes: number;
  pickups: number;
  holesCompleted: number;
  scorecardStatus: ScorecardStatus;
}

export interface RankingRow extends RankingInput {
  position: number;
  isSharedPosition: boolean;
  /** Criterio que resolvio el orden frente al jugador anterior. */
  resolvedBy: 'POINTS' | 'HANDICAP_INDEX' | 'ADJUSTED_STROKES' | 'TIE' | 'LEADER';
  /**
   * Nota informativa cuando el desempate se resolvio con golpes imputados, para
   * que el administrador y el jugador sepan sobre que base se decidio.
   */
  tieBreakNote: string | null;
  /** 0..100, solo presentacion. */
  progressPercent: number;
}
