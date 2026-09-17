/**
 * Configuracion del campeonato: puerta de confirmacion y congelado de reglas.
 *
 * Este modulo existe para que tres cosas sean IMPOSIBLES por construccion:
 *
 *  1. Jugar con una valoracion de campo que nadie ha confirmado.
 *  2. Confirmar una valoracion sin haber visto las diferencias frente a la anterior.
 *  3. Cambiar una regla de calculo con la vuelta empezada sin motivo y sin auditoria.
 *
 * Secciones 19, 20, 24, 26, 27, 30 y 57 del pliego.
 */

import { calculateHandicap } from './handicap';
import { diffSnapshots, validateCourseSnapshot, type SnapshotDiff } from './course';
import type {
  CourseSnapshot,
  HandicapRoundingPolicy,
  HandicapRuleSet,
} from './types';

export type Role = 'PLAYER' | 'ADMIN';
export type CompetitionStatus = 'DRAFT' | 'CONFIGURED' | 'IN_PLAY' | 'CLOSED';

export interface CompetitionConfig {
  status: CompetitionStatus;
  allowancePercent: number;
  roundingPolicy: HandicapRoundingPolicy;
  ruleVersion: string;
  /** null mientras no haya una valoracion confirmada. */
  confirmedSnapshotId: string | null;
}

/**
 * Version de regla deterministica. Se guarda con cada calculo para poder
 * reconstruir meses despues con que reglas se jugo.
 */
export function buildRuleVersion(ruleSet: Omit<HandicapRuleSet, 'ruleVersion'>): string {
  return `WHS-ES;allowance=${ruleSet.allowancePercent};rounding=${ruleSet.roundingPolicy}`;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  reason: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
}

export type ConfirmationResult =
  | { ok: true; confirmedAt: string; audit: AuditEntry }
  | { ok: false; errors: string[] };

export interface ConfirmSnapshotInput {
  snapshotId: string;
  /** Configuracion que se quiere activar. */
  incoming: CourseSnapshot;
  /** Configuracion activa ahora, o null si es la primera. */
  current: CourseSnapshot | null;
  actorId: string;
  actorRole: Role;
  /**
   * Campos de la comparacion que el administrador declara haber revisado.
   * Debe cubrir TODAS las diferencias: es la traduccion tecnica de "exige
   * confirmacion" de la seccion 19.
   */
  acknowledgedFields: string[];
  competitionStatus: CompetitionStatus;
  /** Obligatorio si la competicion ya esta en juego. */
  reason?: string;
  now?: Date;
}

/**
 * Confirma una valoracion. No sustituye nada en silencio: si falta por revisar
 * una sola diferencia, falla y dice cual.
 */
export function confirmCourseSnapshot(input: ConfirmSnapshotInput): ConfirmationResult {
  const errors: string[] = [];
  const now = input.now ?? new Date();

  if (input.actorRole !== 'ADMIN') {
    errors.push('Solo un administrador puede confirmar la valoracion del campo.');
  }

  const validation = validateCourseSnapshot(input.incoming);
  for (const issue of validation.filter((i) => i.severity === 'ERROR')) {
    errors.push(`Datos del campo invalidos (${issue.code}): ${issue.message}`);
  }

  const diffs: SnapshotDiff[] = input.current
    ? diffSnapshots(input.current, input.incoming)
    : [];

  const acknowledged = new Set(input.acknowledgedFields);
  const unreviewed = diffs.filter((d) => !acknowledged.has(d.field));
  if (unreviewed.length > 0) {
    errors.push(
      `Quedan ${unreviewed.length} diferencias sin revisar: ${unreviewed
        .map((d) => `${d.field} (${d.current} -> ${d.incoming})`)
        .join('; ')}`,
    );
  }

  if (input.competitionStatus === 'IN_PLAY' && !input.reason?.trim()) {
    errors.push(
      'La competicion esta en juego: cambiar la valoracion exige un motivo por escrito.',
    );
  }
  if (input.competitionStatus === 'CLOSED') {
    errors.push('La competicion esta cerrada: la valoracion no puede modificarse.');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    confirmedAt: now.toISOString(),
    audit: {
      action: 'COURSE_SNAPSHOT_CONFIRMED',
      entityType: 'CompetitionCourseSnapshot',
      entityId: input.snapshotId,
      actorId: input.actorId,
      reason: input.reason?.trim() || null,
      beforeData: input.current
        ? {
            slopeRating: input.current.slopeRating,
            courseRatingTenths: input.current.courseRatingTenths,
          }
        : null,
      afterData: {
        slopeRating: input.incoming.slopeRating,
        courseRatingTenths: input.incoming.courseRatingTenths,
        diffs,
      },
      createdAt: now.toISOString(),
    },
  };
}

export interface ReadinessSummary {
  config: CompetitionConfig;
  activePlayers: number;
  playersWithoutHandicap: number;
  playersWithoutFlight: number;
  flightsWithoutTeeTime: number;
  duplicatedPlayers: number;
}

export interface ReadinessIssue {
  code: string;
  message: string;
  /** Area del panel a la que debe enlazar la incidencia (seccion 55). */
  area: 'CAMPO' | 'JUGADORES' | 'PARTIDOS' | 'REGLAS';
}

/**
 * Comprueba si el campeonato puede empezar. Devuelve TODAS las incidencias, cada
 * una con el area del panel donde se resuelve.
 */
export function assertReadyToPlay(summary: ReadinessSummary): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const { config } = summary;

  if (config.confirmedSnapshotId === null) {
    issues.push({
      code: 'COURSE_NOT_CONFIRMED',
      area: 'CAMPO',
      message:
        'La valoracion del campo no esta confirmada. Reviselas diferencias y confirmela antes de empezar.',
    });
  }
  if (!config.ruleVersion) {
    issues.push({
      code: 'RULES_NOT_SET',
      area: 'REGLAS',
      message: 'Falta fijar el porcentaje de hándicap y la politica de redondeo.',
    });
  }
  if (summary.activePlayers === 0) {
    issues.push({ code: 'NO_PLAYERS', area: 'JUGADORES', message: 'No hay jugadores activos.' });
  }
  if (summary.playersWithoutHandicap > 0) {
    issues.push({
      code: 'MISSING_HANDICAP',
      area: 'JUGADORES',
      message: `${summary.playersWithoutHandicap} jugador(es) sin hándicap exacto.`,
    });
  }
  if (summary.playersWithoutFlight > 0) {
    issues.push({
      code: 'MISSING_FLIGHT',
      area: 'PARTIDOS',
      message: `${summary.playersWithoutFlight} jugador(es) activos sin partido asignado.`,
    });
  }
  if (summary.flightsWithoutTeeTime > 0) {
    issues.push({
      code: 'MISSING_TEE_TIME',
      area: 'PARTIDOS',
      message: `${summary.flightsWithoutTeeTime} partido(s) sin hora de salida.`,
    });
  }
  if (summary.duplicatedPlayers > 0) {
    issues.push({
      code: 'DUPLICATED_PLAYER',
      area: 'PARTIDOS',
      message: `${summary.duplicatedPlayers} jugador(es) aparecen en mas de un partido.`,
    });
  }

  return issues;
}

export interface RuleChangeImpact {
  playerId: string;
  handicapIndexTenths: number;
  before: number;
  after: number;
}

export interface RuleChangeResult {
  ok: boolean;
  errors: string[];
  impact: RuleChangeImpact[];
  ruleVersion: string;
  audit: AuditEntry | null;
}

/**
 * Cambia el juego de reglas. Devuelve SIEMPRE el impacto calculado sobre los
 * jugadores reales antes de aplicar nada: quien gana o pierde golpes y cuantos.
 *
 * Con la competicion en juego exige motivo. Con la competicion cerrada no deja.
 */
export function changeRuleSet(params: {
  config: CompetitionConfig;
  snapshot: Pick<CourseSnapshot, 'slopeRating' | 'courseRatingTenths' | 'parTotal'>;
  next: { allowancePercent: number; roundingPolicy: HandicapRoundingPolicy };
  players: Array<{ playerId: string; handicapIndexTenths: number }>;
  actorId: string;
  actorRole: Role;
  reason?: string;
  now?: Date;
}): RuleChangeResult {
  const { config, snapshot, next, players, actorId, actorRole } = params;
  const now = params.now ?? new Date();
  const errors: string[] = [];

  if (actorRole !== 'ADMIN') {
    errors.push('Solo un administrador puede cambiar las reglas de calculo.');
  }
  if (!Number.isInteger(next.allowancePercent) || next.allowancePercent < 1 || next.allowancePercent > 100) {
    errors.push(`Porcentaje de hándicap no valido: ${next.allowancePercent}.`);
  }
  if (config.status === 'CLOSED') {
    errors.push('La competicion esta cerrada: las reglas no pueden modificarse.');
  }
  if (config.status === 'IN_PLAY' && !params.reason?.trim()) {
    errors.push('La competicion esta en juego: cambiar las reglas exige un motivo por escrito.');
  }

  const ruleVersion = buildRuleVersion(next);
  const impact: RuleChangeImpact[] = [];

  if (errors.length === 0) {
    for (const player of players) {
      const before = calculateHandicap(player.handicapIndexTenths, snapshot, {
        allowancePercent: config.allowancePercent,
        roundingPolicy: config.roundingPolicy,
        ruleVersion: config.ruleVersion,
      }).playingHandicap;
      const after = calculateHandicap(player.handicapIndexTenths, snapshot, {
        allowancePercent: next.allowancePercent,
        roundingPolicy: next.roundingPolicy,
        ruleVersion,
      }).playingHandicap;
      if (before !== after) {
        impact.push({
          playerId: player.playerId,
          handicapIndexTenths: player.handicapIndexTenths,
          before,
          after,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, impact: [], ruleVersion, audit: null };
  }

  return {
    ok: true,
    errors: [],
    impact,
    ruleVersion,
    audit: {
      action: 'RULE_SET_CHANGED',
      entityType: 'Competition',
      entityId: 'self',
      actorId,
      reason: params.reason?.trim() || null,
      beforeData: {
        allowancePercent: config.allowancePercent,
        roundingPolicy: config.roundingPolicy,
        ruleVersion: config.ruleVersion,
      },
      afterData: {
        allowancePercent: next.allowancePercent,
        roundingPolicy: next.roundingPolicy,
        ruleVersion,
        affectedPlayers: impact.length,
      },
      createdAt: now.toISOString(),
    },
  };
}
