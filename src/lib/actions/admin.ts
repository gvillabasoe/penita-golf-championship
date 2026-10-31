'use server';

/**
 * Acciones de administracion.
 *
 * Todas empiezan por `requireAdmin()`, que consulta la sesion de verdad. El
 * middleware no puede hacerlo: corre en edge y no tiene base de datos. Esta es
 * la capa que protege.
 */

import { revalidatePath } from 'next/cache';

import { Prisma } from '@prisma/client';

import { prisma, toJson } from '../db';
import { requireAdmin } from '../auth/server';
import { getCompetition, getRanking } from '../data/queries';
import { calculateHandicap } from '../golf/handicap';
import { parseHandicapIndexToTenths, HandicapParseError, formatTenths } from '../golf/decimal';
import {
  applicableHandicapTenths,
  capChangeImpact,
  parseHandicapCapToTenths,
} from '../golf/handicap-cap';
import { changeRuleSet, buildRuleVersion } from '../golf/competition-config';
import {
  authorizeReset,
  buildResetAudit,
  previewReset,
  RESET_SUCCESS_MESSAGE,
  type ResetScopeCard,
} from '../admin/reset';
import {
  assignTeeTimes,
  confirmDraw,
  drawFlights,
  validateFlights,
  worstHandicapPlayerIds,
  type DrawPlayer,
  type ProposedFlight,
} from '../admin/draw';
import {
  MAX_PASSWORD_LENGTH,
  MIN_NEW_PLAYER_PASSWORD_LENGTH,
  pickPlayerColor,
  validateNewPlayer,
  type NewPlayerField,
} from '../admin/players';
import {
  competitionDateFromInput,
  dateInputInMadrid,
  madridInstant,
  moveTeeTimeToDate,
  parseTimeInput,
  ScheduleInputError,
} from '../admin/schedule';
import { hashPassword } from '../auth/password';
import { normalizeDrawSeed } from '../admin/draw-seed';
import { buildClassificationPublicationTransition } from '../admin/classification-publication';
import {
  drawPairs as buildPairDraw,
  type PairDrawPlayer,
} from '../admin/pair-draw';
import { isPairScoringMode, type PairScoringMode } from '../golf/pairs';
import { createHash, randomBytes } from 'node:crypto';

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };
export type PairDrawResult =
  | { ok: true; message?: string; seed: string }
  | { ok: false; error: string };

export interface ManualFlightInput {
  name: string;
  memberIds: string[];
  /** Instante ISO que se conserva al editar partidos existentes. */
  teeTime: string | null;
}

interface LockedDrawState {
  pairModeEnabled: boolean;
  flightsConfirmedAt: Date | null;
  flightDrawSeed: string | null;
  pairDrawSeed: string | null;
}

/**
 * Serializa cualquier operacion que cambie partidos o parejas.
 *
 * El bloqueo de fila evita esta carrera: un administrador empieza a sortear
 * parejas sobre partidos confirmados mientras otro vuelve a sortear partidos.
 * Todas las operaciones del flujo toman primero este mismo bloqueo y solo
 * despues leen o escriben participantes, partidos y parejas.
 */
async function lockCompetitionDrawState(
  tx: Prisma.TransactionClient,
  competitionId: string,
): Promise<LockedDrawState> {
  const rows = await tx.$queryRaw<LockedDrawState[]>(Prisma.sql`
    SELECT "pairModeEnabled", "flightsConfirmedAt", "flightDrawSeed", "pairDrawSeed"
    FROM "Competition"
    WHERE "id" = ${competitionId}
    FOR UPDATE
  `);
  const state = rows[0];
  if (!state) throw new Error('No hay competicion configurada.');
  return state;
}

/** Huella del conjunto exacto de participantes que interviene en el sorteo. */
function drawRosterFingerprint(players: DrawPlayer[]): string {
  const payload = players
    .filter((player) => player.isActive)
    .sort((left, right) => left.competitionPlayerId.localeCompare(right.competitionPlayerId))
    .map((player) =>
      [
        player.competitionPlayerId,
        player.displayName,
        player.handicapIndexTenths ?? 'SIN_HCP',
        player.knowsCourse ? 'CONOCE' : 'NO_CONOCE',
      ].join('|'),
    )
    .join('\n');
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Invalida la segunda fase cuando cambia o se reinicia la primera.
 *
 * Se conservan tarjetas y resultados; solo se retiran las asignaciones de
 * pareja, se marca el reparto de partidos como pendiente y se obliga a seguir
 * de nuevo el orden sorteo -> revision -> confirmacion -> parejas.
 */
async function invalidateDrawSequence(
  tx: Prisma.TransactionClient,
  competitionId: string,
): Promise<{ clearedPairPlayers: number; flightsMarkedDraft: number }> {
  await lockCompetitionDrawState(tx, competitionId);
  await tx.competition.update({
    where: { id: competitionId },
    data: {
      flightsConfirmedAt: null,
      flightDrawSeed: null,
      pairDrawSeed: null,
    },
  });
  const cleared = await tx.competitionPlayer.updateMany({
    where: {
      competitionId,
      OR: [{ pairNumber: { not: null } }, { pairSoloMultiplier: true }],
    },
    data: { pairNumber: null, pairSoloMultiplier: false },
  });
  const flights = await tx.flight.updateMany({
    where: { competitionId, status: { not: 'DRAFT' } },
    data: { status: 'DRAFT' },
  });
  return { clearedPairPlayers: cleared.count, flightsMarkedDraft: flights.count };
}

/**
 * Campos de hándicap derivados de un exacto y un limite.
 *
 * Un solo sitio que decide como se traduce "hándicap exacto + limite" a los
 * cinco valores que se guardan. Lo llaman `setHandicap`, `updateRules`,
 * `setHandicapCap` y `removeHandicapCap`, y por eso no puede vivir dentro de
 * ninguna de las cuatro: si cada una lo calculase a su manera, guardar un
 * hándicap y cambiar el limite acabarian dejando numeros distintos para el mismo
 * jugador.
 *
 * No se exporta: en un archivo `'use server'` una funcion exportada es una
 * Server Action y esta no tiene por que ser accesible desde el navegador.
 */
function handicapFieldsFor(
  handicapIndexTenths: number,
  maxHandicapIndexTenths: number | null,
  context: { snapshot: Parameters<typeof calculateHandicap>[1]; allowancePercent: number; ruleVersion: string },
) {
  const appliedTenths = applicableHandicapTenths(handicapIndexTenths, maxHandicapIndexTenths);

  const calculation = calculateHandicap(appliedTenths, context.snapshot, {
    allowancePercent: context.allowancePercent,
    roundingPolicy: 'ROUND_TWICE',
    ruleVersion: context.ruleVersion,
  });

  return {
    appliedTenths,
    calculation,
    data: {
      appliedHandicapIndexTenths: appliedTenths,
      courseHandicapRawHundredths: calculation.courseHandicapRawHundredths,
      courseHandicap: calculation.courseHandicap,
      playingHandicapRawHundredths: calculation.playingHandicapRawHundredths,
      playingHandicap: calculation.playingHandicap,
      calculationVersion: calculation.ruleVersion,
    },
  };
}

/** Fija el hándicap exacto de un jugador y recalcula todo lo que dependa de el. */
export async function setHandicap(
  competitionPlayerId: string,
  rawHandicap: string,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  let tenths: number;
  try {
    tenths = parseHandicapIndexToTenths(rawHandicap);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof HandicapParseError ? error.message : 'Hándicap no valido.',
    };
  }

  const player = await prisma.competitionPlayer.findUnique({ where: { id: competitionPlayerId } });
  if (!player) return { ok: false, error: 'Jugador no encontrado.' };

  /**
   * El exacto se guarda tal cual y el limite se aplica solo al calculo. Si aqui
   * se guardase el valor limitado, el hándicap real del jugador se perderia para
   * siempre en cuanto el administrador quitase el limite.
   */
  const { appliedTenths, calculation, data } = handicapFieldsFor(
    tenths,
    context.maxHandicapIndexTenths,
    context,
  );

  const drawRelevantChange = player.isActive && player.handicapIndexTenths !== tenths;
  await prisma.$transaction(async (tx) => {
    const invalidation = drawRelevantChange
      ? await invalidateDrawSequence(tx, context.competitionId)
      : null;
    await tx.competitionPlayer.update({
      where: { id: competitionPlayerId },
      data: { handicapIndexTenths: tenths, ...data },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'HANDICAP_SET',
        entityType: 'CompetitionPlayer',
        entityId: competitionPlayerId,
        beforeData: toJson({
          handicapIndexTenths: player.handicapIndexTenths,
          appliedHandicapIndexTenths: player.appliedHandicapIndexTenths,
          playingHandicap: player.playingHandicap,
        }),
        afterData: toJson({
          handicapIndexTenths: tenths,
          appliedHandicapIndexTenths: appliedTenths,
          playingHandicap: calculation.playingHandicap,
          drawSequenceInvalidated: drawRelevantChange,
          pairPlayersCleared: invalidation?.clearedPairPlayers ?? 0,
        }),
      },
    });
  });

  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/parejas');
  revalidatePath('/admin/partidos');
  revalidatePath('/clasificacion');
  revalidatePath('/partido');
  revalidatePath('/tarjeta');

  const capped = appliedTenths !== tenths;
  const handicapMessage = capped
    ? `Hándicap exacto ${formatTenths(tenths)}, limitado a ${formatTenths(appliedTenths)}. Hándicap de juego: ${calculation.playingHandicap}.`
    : `Hándicap de juego: ${calculation.playingHandicap}.`;
  return {
    ok: true,
    message: drawRelevantChange
      ? `${handicapMessage} El cambio invalida los partidos y parejas anteriores: vuelve a sortear y confirmar los partidos.`
      : handicapMessage,
  };
}

/** Cambia el porcentaje de asignacion o la politica de redondeo. */
export async function updateRules(
  allowancePercent: number,
  roundingPolicy: 'ROUND_ONCE' | 'ROUND_TWICE',
  reason?: string,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId, handicapIndexTenths: { not: null } },
    select: { id: true, handicapIndexTenths: true },
  });

  const result = changeRuleSet({
    config: {
      status: context.status,
      allowancePercent: context.allowancePercent,
      roundingPolicy: 'ROUND_TWICE',
      ruleVersion: context.ruleVersion,
      confirmedSnapshotId: context.snapshot.snapshotId,
    },
    snapshot: context.snapshot,
    next: { allowancePercent, roundingPolicy },
    // El impacto se mide sobre el hándicap APLICABLE, que es el que entra en el
    // calculo. Con el exacto, el recuento de afectados no coincidiria con lo que
    // despues cambia de verdad en la tarjeta de los jugadores limitados.
    players: players.map((p) => ({
      playerId: p.id,
      handicapIndexTenths: applicableHandicapTenths(
        p.handicapIndexTenths as number,
        context.maxHandicapIndexTenths,
      ),
    })),
    actorId: admin.userId,
    actorRole: 'ADMIN',
    reason,
  });

  if (!result.ok) return { ok: false, error: result.errors.join(' ') };

  await prisma.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: context.competitionId },
      data: {
        handicapAllowancePercent: allowancePercent,
        handicapRoundingPolicy: roundingPolicy,
        handicapRuleVersion: buildRuleVersion({ allowancePercent, roundingPolicy }),
      },
    });

    /**
     * Recalculo de todos los afectados, a partir del hándicap APLICABLE.
     *
     * El exacto no entra en el calculo cuando hay limite. Usarlo aqui daria
     * hándicaps de juego distintos de los que calculo `setHandicap`, y la
     * divergencia solo se notaria al comparar dos pantallas el dia del torneo.
     */
    for (const player of players) {
      const applied = applicableHandicapTenths(
        player.handicapIndexTenths as number,
        context.maxHandicapIndexTenths,
      );
      const calculation = calculateHandicap(applied, context.snapshot, {
        allowancePercent,
        roundingPolicy,
        ruleVersion: result.ruleVersion,
      });
      await tx.competitionPlayer.update({
        where: { id: player.id },
        data: {
          appliedHandicapIndexTenths: applied,
          courseHandicapRawHundredths: calculation.courseHandicapRawHundredths,
          courseHandicap: calculation.courseHandicap,
          playingHandicapRawHundredths: calculation.playingHandicapRawHundredths,
          playingHandicap: calculation.playingHandicap,
          calculationVersion: calculation.ruleVersion,
        },
      });
    }

    if (result.audit) {
      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: result.audit.action,
          entityType: result.audit.entityType,
          entityId: context.competitionId,
          beforeData: toJson(result.audit.beforeData),
          afterData: toJson(result.audit.afterData),
          reason: result.audit.reason,
        },
      });
    }
  });

  revalidatePath('/admin');
  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/parejas');
  revalidatePath('/admin/clasificacion');
  revalidatePath('/clasificacion');
  revalidatePath('/tarjeta');
  revalidatePath('/partido');
  return { ok: true, message: `${result.impact.length} jugador(es) cambian de hándicap de juego.` };
}

/**
 * Sortea los partidos y devuelve una propuesta para revisar.
 *
 * Generar una nueva propuesta invalida cualquier pareja anterior y deja
 * cualquier composicion guardada de partidos en estado borrador. No se habilita
 * de nuevo el sorteo de parejas hasta confirmar la propuesta revisada.
 */
export async function previewDraw(seed?: string): Promise<
  | {
      ok: true;
      seed: string;
      flights: Array<{
        order: number;
        name: string;
        memberIds: string[];
        averageHandicapTenths: number | null;
        knowsCourseCount: number;
        members: Array<{
          competitionPlayerId: string;
          displayName: string;
          color: string;
          handicapIndexTenths: number | null;
          knowsCourse: boolean;
          isWorstHandicap: boolean;
        }>;
      }>;
      missingHandicapCount: number;
      invalidatedPairPlayers: number;
      rosterFingerprint: string;
    }
  | { ok: false; error: string }
> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  let usedSeed: string;
  try {
    usedSeed = normalizeDrawSeed(seed) || randomBytes(8).toString('hex');
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'La semilla no es valida.',
    };
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const lockedState = await lockCompetitionDrawState(tx, context.competitionId);
      const players = await tx.competitionPlayer.findMany({
        where: { competitionId: context.competitionId },
        include: { user: { select: { displayName: true } } },
      });
      const drawPlayers: DrawPlayer[] = players.map((player) => ({
        competitionPlayerId: player.id,
        displayName: player.user.displayName,
        isActive: player.isActive,
        handicapIndexTenths: player.handicapIndexTenths,
        knowsCourse: player.knowsCourse,
        color: player.color,
      }));
      const proposal = drawFlights({ players: drawPlayers, seed: usedSeed });
      const rosterFingerprint = drawRosterFingerprint(drawPlayers);
      const invalidation = await invalidateDrawSequence(tx, context.competitionId);
      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: 'FLIGHT_DRAW_PREVIEWED',
          entityType: 'Flight',
          entityId: context.competitionId,
          beforeData: toJson({
            flightsConfirmedAt: lockedState.flightsConfirmedAt?.toISOString() ?? null,
            flightDrawSeed: lockedState.flightDrawSeed,
            pairDrawSeed: lockedState.pairDrawSeed,
          }),
          afterData: toJson({
            seed: proposal.seed,
            rosterFingerprint,
            distribution: proposal.distribution,
            pairPlayersCleared: invalidation.clearedPairPlayers,
            confirmationRequired: true,
          }),
        },
      });
      return { proposal, drawPlayers, rosterFingerprint, invalidation };
    });

    const { proposal, drawPlayers, rosterFingerprint, invalidation } = outcome;
    const active = drawPlayers.filter((player) => player.isActive);
    const byId = new Map(active.map((player) => [player.competitionPlayerId, player]));
    const worstIds = worstHandicapPlayerIds(active);

    for (const path of ['/admin', '/admin/partidos', '/admin/parejas', '/admin/clasificacion', '/admin/exportacion', '/clasificacion']) {
      revalidatePath(path);
    }

    return {
      ok: true,
      seed: proposal.seed,
      missingHandicapCount: proposal.metrics.missingHandicapCount,
      invalidatedPairPlayers: invalidation.clearedPairPlayers,
      rosterFingerprint,
      flights: proposal.flights.map((flight) => {
        const members = flight.memberIds
          .map((id) => byId.get(id))
          .filter((player): player is DrawPlayer => player !== undefined);
        const knownHandicaps = members
          .map((member) => member.handicapIndexTenths)
          .filter((value): value is number => value !== null);
        return {
          order: flight.order,
          name: flight.name,
          memberIds: flight.memberIds,
          averageHandicapTenths:
            knownHandicaps.length === 0
              ? null
              : Math.round(
                  knownHandicaps.reduce((sum, value) => sum + value, 0) /
                    knownHandicaps.length,
                ),
          knowsCourseCount: members.filter((member) => member.knowsCourse).length,
          members: members.map((member) => ({
            competitionPlayerId: member.competitionPlayerId,
            displayName: member.displayName,
            color: member.color ?? '#5c6673',
            handicapIndexTenths: member.handicapIndexTenths,
            knowsCourse: member.knowsCourse,
            isWorstHandicap: worstIds.has(member.competitionPlayerId),
          })),
        };
      }),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sorteo fallido.' };
  }
}

/** Confirma la propuesta de partidos y habilita la fase de parejas. */
export async function saveDraw(
  seed: string,
  expectedRosterFingerprint: string,
  firstTeeTime: string,
  intervalMinutes = 10,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  let normalizedSeed: string;
  try {
    normalizedSeed = normalizeDrawSeed(seed);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'La semilla no es valida.',
    };
  }
  if (normalizedSeed === '') {
    return { ok: false, error: 'Primero genera y revisa una propuesta de partidos.' };
  }
  if (expectedRosterFingerprint.trim() === '') {
    return { ok: false, error: 'La propuesta no es valida. Vuelve a sortear los partidos.' };
  }
  const withTeeTimes = firstTeeTime.trim() !== '';
  let confirmedFlightCount = 0;

  try {
    confirmedFlightCount = await prisma.$transaction(async (tx) => {
      await lockCompetitionDrawState(tx, context.competitionId);

      const players = await tx.competitionPlayer.findMany({
        where: { competitionId: context.competitionId },
        include: { user: { select: { displayName: true } } },
      });
      const drawPlayers: DrawPlayer[] = players.map((player) => ({
        competitionPlayerId: player.id,
        displayName: player.user.displayName,
        isActive: player.isActive,
        handicapIndexTenths: player.handicapIndexTenths,
        knowsCourse: player.knowsCourse,
        color: player.color,
      }));
      const currentRosterFingerprint = drawRosterFingerprint(drawPlayers);
      if (currentRosterFingerprint !== expectedRosterFingerprint) {
        throw new Error(
          'La configuracion de participantes ha cambiado desde la propuesta. Vuelve a sortear y revisar los partidos.',
        );
      }

      const proposal = drawFlights({ players: drawPlayers, seed: normalizedSeed });
      if (withTeeTimes) {
        proposal.flights = assignTeeTimes(proposal.flights, firstTeeTime, intervalMinutes);
      }

      const issues = validateFlights({
        flights: proposal.flights,
        players: drawPlayers,
        requireTeeTimes: withTeeTimes,
      });
      const errors = issues.filter((issue) => issue.severity === 'ERROR');
      if (errors.length > 0) throw new Error(errors.map((issue) => issue.message).join(' '));

      const confirmation = confirmDraw({
        proposal,
        players: drawPlayers,
        actorId: admin.userId,
        actorRole: 'ADMIN',
        requireTeeTimes: withTeeTimes,
      });
      if (!confirmation.ok) throw new Error(confirmation.errors.join(' '));

      const confirmedAt = confirmation.audit
        ? new Date(confirmation.audit.createdAt)
        : new Date();

      // La composicion de parejas siempre pertenece a unos partidos concretos.
      // Sustituir los partidos elimina cualquier asignacion anterior.
      await tx.competitionPlayer.updateMany({
        where: { competitionId: context.competitionId },
        data: { pairNumber: null, pairSoloMultiplier: false },
      });
      await tx.flight.deleteMany({ where: { competitionId: context.competitionId } });
      for (const flight of proposal.flights) {
        await tx.flight.create({
          data: {
            competitionId: context.competitionId,
            name: flight.name,
            order: flight.order,
            teeTime: flight.teeTime ? new Date(flight.teeTime) : null,
            status: 'CONFIRMED',
            members: {
              create: flight.memberIds.map((id, index) => ({
                competitionPlayerId: id,
                position: index + 1,
              })),
            },
          },
        });
      }
      await tx.competition.update({
        where: { id: context.competitionId },
        data: {
          flightsConfirmedAt: confirmedAt,
          flightDrawSeed: normalizedSeed,
          pairDrawSeed: null,
        },
      });
      if (confirmation.audit) {
        await tx.auditLog.create({
          data: {
            competitionId: context.competitionId,
            actorId: admin.userId,
            action: confirmation.audit.action,
            entityType: confirmation.audit.entityType,
            entityId: context.competitionId,
            afterData: toJson({
              ...(confirmation.audit.afterData as Record<string, unknown>),
              rosterFingerprint: currentRosterFingerprint,
              flightsConfirmedAt: confirmedAt.toISOString(),
              flightDrawSeed: normalizedSeed,
              pairDrawSeed: null,
              pairDrawEnabled: true,
            }),
          },
        });
      }
      return proposal.flights.length;
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se han podido confirmar los partidos.',
    };
  }

  for (const path of [
    '/admin',
    '/admin/partidos',
    '/admin/parejas',
    '/admin/jugadores',
    '/admin/clasificacion',
    '/admin/exportacion',
    '/clasificacion',
    '/partido',
    '/tarjeta',
  ]) {
    revalidatePath(path);
  }
  return {
    ok: true,
    message: withTeeTimes
      ? `${confirmedFlightCount} partidos confirmados. Ya puedes sortear las parejas. Semilla: ${normalizedSeed}`
      : `${confirmedFlightCount} partidos confirmados sin hora. Ya puedes sortear las parejas y fijar despues las horas. Semilla: ${normalizedSeed}`,
  };
}

function normalizeManualFlights(rawFlights: ManualFlightInput[]): ProposedFlight[] {
  if (!Array.isArray(rawFlights) || rawFlights.length === 0) {
    throw new Error('Crea al menos un partido antes de confirmar.');
  }
  if (rawFlights.length > 30) {
    throw new Error('La configuración contiene demasiados partidos.');
  }

  return rawFlights.map((rawFlight, index) => {
    if (!rawFlight || typeof rawFlight !== 'object') {
      throw new Error(`El partido ${index + 1} no es válido.`);
    }

    const name = typeof rawFlight.name === 'string' ? rawFlight.name.trim() : '';
    if (name.length > 80) {
      throw new Error(`El nombre del partido ${index + 1} es demasiado largo.`);
    }
    if (!Array.isArray(rawFlight.memberIds)) {
      throw new Error(`La lista de jugadores del partido ${index + 1} no es válida.`);
    }

    const memberIds = rawFlight.memberIds.map((memberId) => {
      if (typeof memberId !== 'string' || memberId.trim() === '') {
        throw new Error(`El partido ${index + 1} contiene un jugador no válido.`);
      }
      return memberId.trim();
    });

    let teeTime: string | null = null;
    if (rawFlight.teeTime !== null && rawFlight.teeTime !== '') {
      if (typeof rawFlight.teeTime !== 'string') {
        throw new Error(`La hora del partido ${index + 1} no es válida.`);
      }
      const parsed = new Date(rawFlight.teeTime);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`La hora del partido ${index + 1} no es válida.`);
      }
      teeTime = parsed.toISOString();
    }

    return {
      order: index + 1,
      name: name || `Partido ${index + 1}`,
      memberIds,
      teeTime,
    };
  });
}

/**
 * Confirma una composición decidida por el administrador.
 *
 * El modo manual comparte las garantías estructurales del sorteo: cada jugador
 * activo aparece exactamente una vez y ningún partido supera cuatro integrantes.
 * No aplica criterios de equilibrio y no guarda seed, porque no hay azar que
 * reproducir. Al cambiar la primera fase se invalidan siempre las parejas.
 */
export async function saveManualFlights(rawFlights: ManualFlightInput[]): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  let manualFlights: ProposedFlight[];
  try {
    manualFlights = normalizeManualFlights(rawFlights);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'La configuración manual no es válida.',
    };
  }

  let outcome: {
    flightCount: number;
    clearedPairPlayers: number;
    warnings: string[];
  };

  try {
    outcome = await prisma.$transaction(async (tx) => {
      const lockedState = await lockCompetitionDrawState(tx, context.competitionId);
      const players = await tx.competitionPlayer.findMany({
        where: { competitionId: context.competitionId },
        include: { user: { select: { displayName: true } } },
      });
      const drawPlayers: DrawPlayer[] = players.map((player) => ({
        competitionPlayerId: player.id,
        displayName: player.user.displayName,
        isActive: player.isActive,
        handicapIndexTenths: player.handicapIndexTenths,
        knowsCourse: player.knowsCourse,
        color: player.color,
      }));
      if (drawPlayers.every((player) => !player.isActive)) {
        throw new Error('No hay participantes activos para crear los partidos.');
      }

      const issues = validateFlights({
        flights: manualFlights,
        players: drawPlayers,
        requireTeeTimes: false,
      });
      const errors = issues.filter((issue) => issue.severity === 'ERROR');
      if (errors.length > 0) {
        throw new Error(errors.map((issue) => issue.message).join(' '));
      }

      const invalidation = await invalidateDrawSequence(tx, context.competitionId);
      await tx.flight.deleteMany({ where: { competitionId: context.competitionId } });

      for (const flight of manualFlights) {
        await tx.flight.create({
          data: {
            competitionId: context.competitionId,
            name: flight.name,
            order: flight.order,
            teeTime: flight.teeTime ? new Date(flight.teeTime) : null,
            status: 'CONFIRMED',
            members: {
              create: flight.memberIds.map((competitionPlayerId, index) => ({
                competitionPlayerId,
                position: index + 1,
              })),
            },
          },
        });
      }

      const confirmedAt = new Date();
      await tx.competition.update({
        where: { id: context.competitionId },
        data: {
          flightsConfirmedAt: confirmedAt,
          flightDrawSeed: null,
          pairDrawSeed: null,
        },
      });

      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: 'FLIGHTS_MANUALLY_CONFIRMED',
          entityType: 'Flight',
          entityId: context.competitionId,
          beforeData: toJson({
            flightsConfirmedAt: lockedState.flightsConfirmedAt?.toISOString() ?? null,
            flightDrawSeed: lockedState.flightDrawSeed,
            pairDrawSeed: lockedState.pairDrawSeed,
          }),
          afterData: toJson({
            source: 'MANUAL',
            flightsConfirmedAt: confirmedAt.toISOString(),
            distribution: manualFlights.map((flight) => flight.memberIds.length),
            pairPlayersCleared: invalidation.clearedPairPlayers,
            warnings: issues
              .filter((issue) => issue.severity === 'WARNING')
              .map((issue) => issue.message),
            flights: manualFlights.map((flight) => ({
              order: flight.order,
              name: flight.name,
              teeTime: flight.teeTime,
              memberIds: flight.memberIds,
            })),
          }),
        },
      });

      return {
        flightCount: manualFlights.length,
        clearedPairPlayers: invalidation.clearedPairPlayers,
        warnings: issues
          .filter((issue) => issue.severity === 'WARNING')
          .map((issue) => issue.message),
      };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se han podido confirmar los partidos manuales.',
    };
  }

  for (const path of [
    '/admin',
    '/admin/partidos',
    '/admin/parejas',
    '/admin/jugadores',
    '/admin/clasificacion',
    '/admin/exportacion',
    '/clasificacion',
    '/partido',
    '/tarjeta',
  ]) {
    revalidatePath(path);
  }

  const details = [
    `${outcome.flightCount} partido${outcome.flightCount === 1 ? '' : 's'} confirmado${outcome.flightCount === 1 ? '' : 's'} manualmente.`,
    outcome.clearedPairPlayers > 0
      ? `Se han retirado las parejas de ${outcome.clearedPairPlayers} participante(s).`
      : '',
    ...outcome.warnings,
    'Ya puedes crear o sortear las parejas.',
  ].filter(Boolean);

  return { ok: true, message: details.join(' ') };
}

/** Corrige un hoyo. Exige motivo y queda marcado como correccion. */
export async function overrideHole(
  scorecardId: string,
  holeNumber: number,
  grossStrokes: number | null,
  isPickup: boolean,
  reason: string,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (reason.trim() === '') return { ok: false, error: 'Una correccion exige un motivo por escrito.' };

  const before = await prisma.holeScore.findUnique({
    where: { scorecardId_holeNumber: { scorecardId, holeNumber } },
  });

  await prisma.$transaction(async (tx) => {
    const card = await tx.scorecard.update({
      where: { id: scorecardId },
      data: { version: { increment: 1 } },
    });

    await tx.holeScore.upsert({
      where: { scorecardId_holeNumber: { scorecardId, holeNumber } },
      create: {
        scorecardId,
        holeNumber,
        grossStrokes,
        isPickup,
        strokesReceived: before?.strokesReceived ?? 0,
        stablefordPoints: 0,
        isOverridden: true,
        isConfirmed: true,
        serverVersion: card.version,
      },
      update: {
        grossStrokes,
        isPickup,
        isOverridden: true,
        serverVersion: card.version,
      },
    });

    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'HOLE_SCORE_OVERRIDDEN',
        entityType: 'HoleScore',
        entityId: `${scorecardId}:${holeNumber}`,
        beforeData: toJson(before ? { grossStrokes: before.grossStrokes, isPickup: before.isPickup } : null),
        afterData: toJson({ grossStrokes, isPickup }),
        reason: reason.trim(),
      },
    });
  });

  revalidatePath('/admin/tarjetas');
  return { ok: true, message: 'Correccion registrada. Hay que recalcular la tarjeta.' };
}

/** Bloquea o desbloquea una tarjeta. */
export async function setScorecardLock(scorecardId: string, locked: boolean, reason?: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  await prisma.$transaction(async (tx) => {
    await tx.scorecard.update({
      where: { id: scorecardId },
      data: { lockedAt: locked ? new Date() : null, status: locked ? 'LOCKED' : 'FINISHED' },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: locked ? 'SCORECARD_LOCKED' : 'SCORECARD_UNLOCKED',
        entityType: 'Scorecard',
        entityId: scorecardId,
        reason: reason?.trim() || null,
      },
    });
  });

  revalidatePath('/admin/tarjetas');
  return { ok: true };
}

/**
 * Publica o retira la clasificacion oficial mediante un unico interruptor.
 *
 * La unica fuente de verdad es `Competition.classificationStatus`. La operacion
 * se limita a actualizar ese campo y registrar la auditoria, de forma atomica e
 * idempotente.
 */
export async function setClassificationOfficial(official: boolean): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (typeof official !== 'boolean') {
    return { ok: false, error: 'El estado de publicacion no es valido.' };
  }

  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  if (official) {
    const { rows } = await getRanking(context);
    if (rows.length === 0) {
      return { ok: false, error: 'No hay ninguna clasificacion que publicar.' };
    }
  }

  const transition = buildClassificationPublicationTransition(official);

  try {
    await prisma.$transaction(async (tx) => {
      const competition = await tx.competition.findUnique({
        where: { id: context.competitionId },
        select: { classificationStatus: true },
      });
      if (!competition) throw new Error('No hay competicion configurada.');

      // Repetir la misma peticion no crea registros ni escrituras innecesarias.
      if (competition.classificationStatus === transition.classificationStatus) return;

      await tx.competition.update({
        where: { id: context.competitionId },
        data: { classificationStatus: transition.classificationStatus },
      });

      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: transition.auditAction,
          entityType: 'Competition',
          entityId: context.competitionId,
          beforeData: toJson({ classificationStatus: competition.classificationStatus }),
          afterData: toJson({ classificationStatus: transition.classificationStatus }),
        },
      });
    });
  } catch (error) {
    console.error('No se pudo cambiar la publicacion de la clasificacion.', error);
    return {
      ok: false,
      error:
        'No se ha podido guardar el estado de la clasificacion. Recarga la pagina y vuelve a intentarlo.',
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/clasificacion');
  revalidatePath('/admin/exportacion');
  revalidatePath('/clasificacion');
  revalidatePath('/partido');

  return {
    ok: true,
    message: official
      ? 'Clasificacion publicada como oficial.'
      : 'Clasificacion devuelta a provisional.',
  };
}

/**
 * Recalculo de hándicaps de todos los jugadores con un limite dado.
 *
 * Se llama dentro de la transaccion que cambia el limite, nunca por separado: si
 * el limite se guardase y el recalculo fuese aparte, un fallo entre las dos
 * operaciones dejaria la competicion con un limite escrito y unos hándicaps de
 * juego que no lo respetan. Eso es peor que no tener limite.
 */
async function recalculateWithCap(
  /**
   * Cliente transaccional de Prisma.
   *
   * Se declara como `Prisma.TransactionClient` y no derivandolo de
   * `$transaction`: esa funcion esta sobrecargada —acepta un callback y tambien
   * un array de promesas— y sacar el tipo del primer parametro de la primera
   * sobrecarga es exactamente la clase de inferencia que se rompe al subir de
   * version de Prisma. El nombre publico es estable.
   */
  tx: Prisma.TransactionClient,
  context: NonNullable<Awaited<ReturnType<typeof getCompetition>>>,
  capTenths: number | null,
  players: Array<{ id: string; handicapIndexTenths: number | null }>,
): Promise<number> {
  let updated = 0;

  for (const player of players) {
    if (player.handicapIndexTenths === null) continue;
    const { data } = handicapFieldsFor(player.handicapIndexTenths, capTenths, context);
    await tx.competitionPlayer.update({ where: { id: player.id }, data });
    updated += 1;
  }

  return updated;
}

/**
 * Fija el limite maximo de hándicap exacto aplicable (seccion 5).
 *
 * NO sobreescribe el hándicap exacto de nadie: lo unico que cambia es la entrada
 * del calculo. El exacto sigue guardado, sigue mostrandose y sigue decidiendo el
 * segundo criterio de desempate de la clasificacion.
 */
export async function setHandicapCap(rawCap: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (context.status === 'CLOSED') {
    return { ok: false, error: 'El campeonato esta cerrado: el limite no puede cambiarse.' };
  }

  let capTenths: number;
  try {
    capTenths = parseHandicapCapToTenths(rawCap);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof HandicapParseError ? error.message : 'Limite no valido.',
    };
  }

  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId },
    include: { user: { select: { displayName: true } } },
  });

  const impact = capChangeImpact(
    players.map((p) => ({
      competitionPlayerId: p.id,
      displayName: p.user.displayName,
      handicapIndexTenths: p.handicapIndexTenths,
    })),
    context.maxHandicapIndexTenths,
    capTenths,
  );

  await prisma.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: context.competitionId },
      data: { maxHandicapIndexTenths: capTenths },
    });

    await recalculateWithCap(tx, context, capTenths, players);

    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'HANDICAP_CAP_SET',
        entityType: 'Competition',
        entityId: context.competitionId,
        beforeData: toJson({ maxHandicapIndexTenths: context.maxHandicapIndexTenths }),
        afterData: toJson({
          maxHandicapIndexTenths: capTenths,
          affectedPlayers: impact.length,
          affected: impact.map((row) => ({
            competitionPlayerId: row.competitionPlayerId,
            exactTenths: row.exactTenths,
            beforeAppliedTenths: row.beforeAppliedTenths,
            afterAppliedTenths: row.afterAppliedTenths,
          })),
        }),
      },
    });
  });

  revalidatePath('/admin');
  revalidatePath('/admin/campo');
  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/parejas');
  revalidatePath('/admin/partidos');
  revalidatePath('/clasificacion');
  revalidatePath('/partido');
  revalidatePath('/tarjeta');

  return {
    ok: true,
    message:
      impact.length === 0
        ? `Limite fijado en ${formatTenths(capTenths)}. Ningun jugador lo supera.`
        : `Limite fijado en ${formatTenths(capTenths)}. ${impact.length} jugador(es) competiran con el valor limitado.`,
  };
}

/**
 * Retira el limite de hándicap.
 *
 * Accion explicita y separada, no un campo vacio en el formulario de guardar:
 * dejar en blanco un numero y pulsar "Guardar" es demasiado facil de hacer sin
 * querer para algo que devuelve golpes a media docena de jugadores.
 */
export async function removeHandicapCap(): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (context.status === 'CLOSED') {
    return { ok: false, error: 'El campeonato esta cerrado: el limite no puede cambiarse.' };
  }
  if (context.maxHandicapIndexTenths === null) {
    return { ok: false, error: 'No hay ningun limite de hándicap configurado.' };
  }

  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId },
    include: { user: { select: { displayName: true } } },
  });

  const impact = capChangeImpact(
    players.map((p) => ({
      competitionPlayerId: p.id,
      displayName: p.user.displayName,
      handicapIndexTenths: p.handicapIndexTenths,
    })),
    context.maxHandicapIndexTenths,
    null,
  );

  await prisma.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: context.competitionId },
      data: { maxHandicapIndexTenths: null },
    });

    await recalculateWithCap(tx, context, null, players);

    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'HANDICAP_CAP_REMOVED',
        entityType: 'Competition',
        entityId: context.competitionId,
        beforeData: toJson({ maxHandicapIndexTenths: context.maxHandicapIndexTenths }),
        afterData: toJson({ maxHandicapIndexTenths: null, affectedPlayers: impact.length }),
      },
    });
  });

  revalidatePath('/admin');
  revalidatePath('/admin/campo');
  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/parejas');
  revalidatePath('/admin/partidos');
  revalidatePath('/clasificacion');
  revalidatePath('/partido');
  revalidatePath('/tarjeta');

  return {
    ok: true,
    message:
      impact.length === 0
        ? 'Limite retirado. Ningun jugador estaba limitado.'
        : `Limite retirado. ${impact.length} jugador(es) vuelven a competir con su hándicap exacto.`,
  };
}

// ===========================================================================
// Alta de jugadores
// ===========================================================================

export type CreatePlayerResult =
  | { ok: true; message: string; color: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<NewPlayerField, string>> };

/**
 * Da de alta un jugador nuevo: usuario con su contrasena e inscripcion en el
 * campeonato actual, con un color elegido al azar.
 *
 * Con esa contrasena puede entrar en la app desde ese momento: el selector del
 * login lista a todos los usuarios activos.
 *
 * Su tarjeta no se crea aqui. Se crea al apuntar el primer hoyo, exactamente
 * como la de los participantes iniciales, para que no haya dos caminos.
 *
 * La contrasena solo se guarda hasheada y NO entra en la auditoria.
 */
export async function createPlayer(input: {
  firstName: string;
  lastName: string;
  password: string;
  handicap: string;
}): Promise<CreatePlayerResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (context.status === 'CLOSED') {
    return { ok: false, error: 'El campeonato esta cerrado: no se pueden inscribir jugadores.' };
  }

  const validation = validateNewPlayer(input);
  if (!validation.ok) {
    return {
      ok: false,
      error: 'Revisa los campos marcados.',
      fieldErrors: validation.fieldErrors,
    };
  }

  // Dos jugadores con el mismo nombre serian indistinguibles en el selector del
  // login, y el seed casa a los usuarios por nombre normalizado.
  const duplicate = await prisma.user.findFirst({
    where: { normalizedName: validation.normalizedName },
    select: { id: true },
  });
  if (duplicate) {
    return {
      ok: false,
      error: 'Ya existe un jugador con ese nombre.',
      fieldErrors: { lastName: 'Ya existe un jugador con este nombre y apellidos.' },
    };
  }

  const existing = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId },
    select: { color: true },
  });
  const color = pickPlayerColor(existing.map((row) => row.color));
  const passwordHash = await hashPassword(validation.password);

  const handicap =
    validation.handicapIndexTenths === null
      ? null
      : handicapFieldsFor(validation.handicapIndexTenths, context.maxHandicapIndexTenths, context);

  await prisma.$transaction(async (tx) => {
    const invalidation = await invalidateDrawSequence(tx, context.competitionId);
    const user = await tx.user.create({
      data: {
        firstName: validation.firstName,
        lastName: validation.lastName,
        displayName: validation.displayName,
        normalizedName: validation.normalizedName,
        passwordHash,
        role: 'PLAYER',
        defaultColor: color,
      },
      select: { id: true },
    });

    const player = await tx.competitionPlayer.create({
      data: {
        competitionId: context.competitionId,
        userId: user.id,
        snapshotId: context.snapshot.snapshotId,
        color,
        ...(handicap
          ? { handicapIndexTenths: validation.handicapIndexTenths, ...handicap.data }
          : {}),
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'PLAYER_CREATED',
        entityType: 'CompetitionPlayer',
        entityId: player.id,
        // Sin contrasena ni hash: la auditoria nunca los lleva.
        afterData: toJson({
          userId: user.id,
          displayName: validation.displayName,
          color,
          handicapIndexTenths: validation.handicapIndexTenths,
          playingHandicap: handicap?.calculation.playingHandicap ?? null,
          drawSequenceInvalidated: true,
          pairPlayersCleared: invalidation.clearedPairPlayers,
        }),
      },
    });
  });

  revalidatePath('/admin');
  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/parejas');
  revalidatePath('/admin/partidos');
  revalidatePath('/admin/tarjetas');
  revalidatePath('/clasificacion');
  revalidatePath('/login');

  const handicapText =
    handicap === null
      ? 'Sin hándicap todavia: fijalo en su ficha.'
      : `Hándicap de juego: ${handicap.calculation.playingHandicap}.`;

  return {
    ok: true,
    color,
    message: `${validation.displayName} inscrito. ${handicapText} Todavia no esta en ningun partido: vuelve a sortear en Partidos para incluirle.`,
  };
}

// ===========================================================================
// Acceso, baja y reactivacion de jugadores
// ===========================================================================

export type PasswordResetResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: { password?: string; confirmation?: string } };

/**
 * Sustituye la contrasena de un participante e invalida todas sus sesiones.
 *
 * Ni la contrasena ni su hash entran en la auditoria. `sessionEpoch` hace que
 * incluso una cookie que no se haya podido revocar deje de ser valida.
 */
export async function resetPlayerPassword(input: {
  competitionPlayerId: string;
  password: string;
  confirmation: string;
}): Promise<PasswordResetResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const password = typeof input.password === 'string' ? input.password : '';
  const confirmation = typeof input.confirmation === 'string' ? input.confirmation : '';
  const fieldErrors: { password?: string; confirmation?: string } = {};

  if (password.trim() === '') {
    fieldErrors.password = 'Escribe la nueva contraseña.';
  } else if (password.length < MIN_NEW_PLAYER_PASSWORD_LENGTH) {
    fieldErrors.password = `La contraseña debe tener al menos ${MIN_NEW_PLAYER_PASSWORD_LENGTH} caracteres.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    fieldErrors.password = 'La contraseña es demasiado larga.';
  }
  if (confirmation !== password) {
    fieldErrors.confirmation = 'Las contraseñas no coinciden.';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'Revisa los campos marcados.', fieldErrors };
  }

  const player = await prisma.competitionPlayer.findFirst({
    where: { id: input.competitionPlayerId, competitionId: context.competitionId },
    include: { user: { select: { id: true, displayName: true } } },
  });
  if (!player) return { ok: false, error: 'Jugador no encontrado.' };

  const passwordHash = await hashPassword(password);
  const revokedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: player.user.id },
      data: { passwordHash, sessionEpoch: { increment: 1 } },
    });
    await tx.session.updateMany({
      where: { userId: player.user.id, revokedAt: null },
      data: { revokedAt },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'PLAYER_PASSWORD_RESET',
        entityType: 'User',
        entityId: player.user.id,
        // Deliberadamente sin contrasena ni hash.
        afterData: toJson({ displayName: player.user.displayName, sessionsRevoked: true }),
      },
    });
  });

  revalidatePath('/admin/jugadores');
  revalidatePath('/login');
  return { ok: true, message: `Contraseña de ${player.user.displayName} actualizada.` };
}

/** Cambia si el jugador conoce el campo y reinicia la secuencia de sorteos. */
export async function setPlayerKnowsCourse(
  competitionPlayerId: string,
  knowsCourse: boolean,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const player = await prisma.competitionPlayer.findFirst({
    where: { id: competitionPlayerId, competitionId: context.competitionId },
    include: { user: { select: { displayName: true } } },
  });
  if (!player) return { ok: false, error: 'Jugador no encontrado.' };
  if (player.knowsCourse === knowsCourse) {
    return { ok: true, message: 'El conocimiento del campo ya tenia ese valor.' };
  }

  await prisma.$transaction(async (tx) => {
    const invalidation = player.isActive
      ? await invalidateDrawSequence(tx, context.competitionId)
      : null;
    await tx.competitionPlayer.update({
      where: { id: competitionPlayerId },
      data: { knowsCourse },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'PLAYER_COURSE_KNOWLEDGE_UPDATED',
        entityType: 'CompetitionPlayer',
        entityId: competitionPlayerId,
        beforeData: toJson({ knowsCourse: player.knowsCourse }),
        afterData: toJson({
          knowsCourse,
          drawSequenceInvalidated: player.isActive,
          pairPlayersCleared: invalidation?.clearedPairPlayers ?? 0,
        }),
      },
    });
  });

  for (const path of [
    '/admin',
    '/admin/jugadores',
    '/admin/partidos',
    '/admin/parejas',
    '/admin/clasificacion',
    '/clasificacion',
  ]) {
    revalidatePath(path);
  }
  return {
    ok: true,
    message: player.isActive
      ? `${player.user.displayName}: conoce el campo ${knowsCourse ? 'Sí' : 'No'}. Vuelve a sortear y confirmar los partidos.`
      : `${player.user.displayName}: conoce el campo ${knowsCourse ? 'Sí' : 'No'}. El cambio se aplicará cuando vuelva a estar activo.`,
  };
}

/** Baja o reactiva la inscripcion sin borrar tarjetas ni auditoria. */
export async function setPlayerActive(
  competitionPlayerId: string,
  active: boolean,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const player = await prisma.competitionPlayer.findFirst({
    where: { id: competitionPlayerId, competitionId: context.competitionId },
    include: {
      user: { select: { id: true, displayName: true, role: true, isActive: true } },
      flightMember: { select: { flightId: true } },
    },
  });
  if (!player) return { ok: false, error: 'Jugador no encontrado.' };
  if (player.isActive === active) {
    return {
      ok: true,
      message: active ? 'El jugador ya estaba activo.' : 'El jugador ya estaba dado de baja.',
    };
  }

  const revokedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const invalidation = await invalidateDrawSequence(tx, context.competitionId);
    if (!active) {
      await tx.flightMember.deleteMany({ where: { competitionPlayerId } });
      await tx.competitionPlayer.update({
        where: { id: competitionPlayerId },
        data: { isActive: false, pairNumber: null, pairSoloMultiplier: false },
      });

      // Un administrador puede seguir organizando aunque deje de jugar. Para
      // un jugador normal, la baja tambien cierra el acceso a la aplicacion.
      if (player.user.role === 'PLAYER') {
        await tx.user.update({
          where: { id: player.user.id },
          data: { isActive: false, sessionEpoch: { increment: 1 } },
        });
        await tx.session.updateMany({
          where: { userId: player.user.id, revokedAt: null },
          data: { revokedAt },
        });
      }
    } else {
      await tx.competitionPlayer.update({
        where: { id: competitionPlayerId },
        data: { isActive: true, pairNumber: null, pairSoloMultiplier: false },
      });
      if (player.user.role === 'PLAYER') {
        await tx.user.update({
          where: { id: player.user.id },
          data: { isActive: true },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: active ? 'PLAYER_REACTIVATED' : 'PLAYER_DEACTIVATED',
        entityType: 'CompetitionPlayer',
        entityId: competitionPlayerId,
        beforeData: toJson({
          isActive: player.isActive,
          userIsActive: player.user.isActive,
          flightId: player.flightMember?.flightId ?? null,
          pairNumber: player.pairNumber,
          pairSoloMultiplier: player.pairSoloMultiplier,
        }),
        afterData: toJson({
          isActive: active,
          userIsActive: player.user.role === 'ADMIN' ? player.user.isActive : active,
          flightId: null,
          pairNumber: null,
          pairSoloMultiplier: false,
          drawSequenceInvalidated: true,
          pairPlayersCleared: invalidation.clearedPairPlayers,
        }),
      },
    });
  });

  for (const path of [
    '/admin',
    '/admin/jugadores',
    '/admin/parejas',
    '/admin/partidos',
    '/admin/tarjetas',
    '/admin/clasificacion',
    '/admin/exportacion',
    '/clasificacion',
    '/partido',
    '/tarjeta',
    '/login',
  ]) {
    revalidatePath(path);
  }

  return {
    ok: true,
    message: active
      ? `${player.user.displayName} reactivado. Vuelve a sortear y confirmar los partidos; despues sortea las parejas.`
      : `${player.user.displayName} dado de baja. Sus resultados se conservan. Vuelve a sortear y confirmar los partidos.`,
  };
}

// ===========================================================================
// Configuracion y composicion de parejas
// ===========================================================================

export async function updatePairSettings(input: {
  enabled: boolean;
  scoringMode: string;
}): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (!isPairScoringMode(input.scoringMode)) {
    return { ok: false, error: 'Modalidad de parejas no valida.' };
  }

  const scoringMode: PairScoringMode = input.scoringMode;
  await prisma.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: context.competitionId },
      data: { pairModeEnabled: Boolean(input.enabled), pairScoringMode: scoringMode },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'PAIR_SETTINGS_UPDATED',
        entityType: 'Competition',
        entityId: context.competitionId,
        beforeData: toJson({
          pairModeEnabled: context.pairModeEnabled,
          pairScoringMode: context.pairScoringMode,
        }),
        afterData: toJson({
          pairModeEnabled: Boolean(input.enabled),
          pairScoringMode: scoringMode,
        }),
      },
    });
  });

  revalidatePath('/admin');
  revalidatePath('/admin/parejas');
  revalidatePath('/admin/clasificacion');
  revalidatePath('/admin/exportacion');
  revalidatePath('/clasificacion');
  return {
    ok: true,
    message: input.enabled
      ? 'Modo parejas activado y modalidad guardada.'
      : 'Modo parejas desactivado. Las asignaciones se conservan.',
  };
}

/** Sortea todas las parejas sobre la composicion de partidos confirmada. */
export async function drawPairs(rawSeed?: string): Promise<PairDrawResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (!context.pairModeEnabled) {
    return { ok: false, error: 'Activa primero el modo parejas.' };
  }
  if (!context.flightsConfirmedAt) {
    return {
      ok: false,
      error: 'Primero debes sortear, revisar y confirmar los partidos.',
    };
  }
  let seed: string;
  try {
    seed = normalizeDrawSeed(rawSeed) || randomBytes(8).toString('hex');
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'La semilla no es valida.',
    };
  }
  let proposal: ReturnType<typeof buildPairDraw>;
  let playerData = new Map<string, { displayName: string; flightOrder: number }>();

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const latestCompetition = await lockCompetitionDrawState(tx, context.competitionId);
      if (!latestCompetition.pairModeEnabled) {
        throw new Error('Activa primero el modo parejas.');
      }
      if (!latestCompetition.flightsConfirmedAt) {
        throw new Error('Primero debes sortear, revisar y confirmar los partidos.');
      }

      const players = await tx.competitionPlayer.findMany({
        where: { competitionId: context.competitionId, isActive: true },
        include: {
          user: { select: { displayName: true } },
          flightMember: {
            include: { flight: { select: { id: true, order: true, status: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (players.length < 2) {
        throw new Error('Se necesitan al menos dos participantes activos.');
      }
      if (
        players.some(
          (player) => !player.flightMember || player.flightMember.flight.status !== 'CONFIRMED',
        )
      ) {
        throw new Error('Todos los participantes deben pertenecer a partidos confirmados.');
      }

      const drawPlayers: PairDrawPlayer[] = players.map((player) => ({
        competitionPlayerId: player.id,
        displayName: player.user.displayName,
        isActive: player.isActive,
        handicapIndexTenths: player.handicapIndexTenths,
        flightId: player.flightMember!.flight.id,
        flightOrder: player.flightMember!.flight.order,
      }));
      const nextProposal = buildPairDraw({ players: drawPlayers, seed });
      const byId = new Map(players.map((player) => [player.id, player] as const));

      await tx.competitionPlayer.updateMany({
        where: { competitionId: context.competitionId },
        data: { pairNumber: null, pairSoloMultiplier: false },
      });

      for (const pair of nextProposal.pairs) {
        const updated = await tx.competitionPlayer.updateMany({
          where: {
            competitionId: context.competitionId,
            id: { in: pair.memberIds },
            isActive: true,
          },
          data: {
            pairNumber: pair.pairNumber,
            pairSoloMultiplier: pair.isSolo,
          },
        });
        if (updated.count !== pair.memberIds.length) {
          throw new Error('La lista de participantes ha cambiado. Repite el sorteo de parejas.');
        }
      }

      await tx.competition.update({
        where: { id: context.competitionId },
        data: { pairDrawSeed: seed },
      });

      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: 'PAIRS_DRAWN',
          entityType: 'CompetitionPair',
          entityId: context.competitionId,
          afterData: toJson({
            seed,
            flightsConfirmedAt: latestCompetition.flightsConfirmedAt.toISOString(),
            metrics: nextProposal.metrics,
            pairs: nextProposal.pairs.map((pair) => ({
              pairNumber: pair.pairNumber,
              isSolo: pair.isSolo,
              equivalentHandicapTenths: pair.equivalentHandicapTenths,
              members: pair.memberIds.map((id) => ({
                competitionPlayerId: id,
                displayName: byId.get(id)?.user.displayName ?? id,
                flightOrder: byId.get(id)?.flightMember?.flight.order ?? null,
              })),
            })),
          }),
        },
      });

      return {
        proposal: nextProposal,
        players: players.map((player) => ({
          competitionPlayerId: player.id,
          displayName: player.user.displayName,
          flightOrder: player.flightMember!.flight.order,
        })),
      };
    });
    proposal = outcome.proposal;
    playerData = new Map(
      outcome.players.map((player) => [
        player.competitionPlayerId,
        { displayName: player.displayName, flightOrder: player.flightOrder },
      ]),
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se han podido sortear las parejas.',
    };
  }

  for (const path of [
    '/admin',
    '/admin/parejas',
    '/admin/jugadores',
    '/admin/clasificacion',
    '/admin/exportacion',
    '/clasificacion',
    '/tarjeta',
    '/partido',
  ]) {
    revalidatePath(path);
  }

  const solo = proposal.soloPlayerId
    ? playerData.get(proposal.soloPlayerId)?.displayName ?? 'un participante'
    : null;
  return {
    ok: true,
    seed,
    message: solo
      ? `${proposal.pairs.length} equipos sorteados. ${solo} juega individual y sus puntos cuentan x2. Semilla: ${seed}`
      : `${proposal.pairs.length} parejas sorteadas. Semilla: ${seed}`,
  };
}

export async function createPair(
  firstPlayerId: string,
  secondPlayerId: string,
  solo = false,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  const isSolo = Boolean(solo);
  if (!firstPlayerId) {
    return { ok: false, error: 'Elige al menos un jugador.' };
  }
  if (!isSolo && (!secondPlayerId || firstPlayerId === secondPlayerId)) {
    return { ok: false, error: 'Elige dos jugadores distintos.' };
  }
  let outcome: { pairNumber: number; memberNames: string[]; isSolo: boolean };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const latestCompetition = await lockCompetitionDrawState(tx, context.competitionId);
      if (!latestCompetition.pairModeEnabled) {
        throw new Error('Activa primero el modo parejas.');
      }
      if (!latestCompetition.flightsConfirmedAt) {
        throw new Error('Confirma primero los partidos.');
      }

      const roster = await tx.competitionPlayer.findMany({
        where: { competitionId: context.competitionId, isActive: true },
        include: {
          user: { select: { displayName: true } },
          flightMember: {
            include: { flight: { select: { id: true, order: true, status: true } } },
          },
        },
      });
      if (
        roster.some(
          (player) => !player.flightMember || player.flightMember.flight.status !== 'CONFIRMED',
        )
      ) {
        throw new Error('Todos los participantes deben tener un partido confirmado.');
      }

      const selectedIds = isSolo ? [firstPlayerId] : [firstPlayerId, secondPlayerId];
      const players = roster.filter((player) => selectedIds.includes(player.id));
      if (players.length !== selectedIds.length) {
        throw new Error('Alguno de los jugadores no existe o esta dado de baja.');
      }
      if (players.some((player) => player.pairNumber !== null)) {
        throw new Error('Uno de los jugadores ya pertenece a un equipo.');
      }
      if (isSolo) {
        const existingSolo = await tx.competitionPlayer.findFirst({
          where: { competitionId: context.competitionId, pairSoloMultiplier: true },
          select: { id: true },
        });
        if (existingSolo) {
          throw new Error('Ya existe un participante individual con puntos x2.');
        }
      }

      const maximum = await tx.competitionPlayer.aggregate({
        where: { competitionId: context.competitionId },
        _max: { pairNumber: true },
      });
      const pairNumber = (maximum._max.pairNumber ?? 0) + 1;
      const updated = await tx.competitionPlayer.updateMany({
        where: {
          competitionId: context.competitionId,
          id: { in: selectedIds },
          isActive: true,
          pairNumber: null,
        },
        data: { pairNumber, pairSoloMultiplier: isSolo },
      });
      if (updated.count !== selectedIds.length) {
        throw new Error('La composición de equipos ha cambiado. Vuelve a intentarlo.');
      }

      // Un ajuste manual deja de ser reproducible a partir de la semilla del
      // sorteo automatico. La composicion se conserva, pero ya no se presenta
      // una seed que no reconstruiria exactamente el estado visible.
      await tx.competition.update({
        where: { id: context.competitionId },
        data: { pairDrawSeed: null },
      });

      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: isSolo ? 'PAIR_SOLO_CREATED_MANUALLY' : 'PAIR_CREATED_MANUALLY',
          entityType: 'CompetitionPair',
          entityId: `${context.competitionId}:${pairNumber}`,
          afterData: toJson({
            pairNumber,
            source: 'MANUAL',
            isSolo,
            members: players.map((player) => ({
              competitionPlayerId: player.id,
              displayName: player.user.displayName,
              flightOrder: player.flightMember?.flight.order ?? null,
            })),
          }),
        },
      });

      return {
        pairNumber,
        memberNames: players.map((player) => player.user.displayName),
        isSolo,
      };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se ha podido crear la pareja.',
    };
  }

  revalidatePath('/admin/parejas');
  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/clasificacion');
  revalidatePath('/admin/exportacion');
  revalidatePath('/clasificacion');
  return {
    ok: true,
    message: outcome.isSolo
      ? `Equipo ${outcome.pairNumber} creado: ${outcome.memberNames[0]} jugará individual y sus puntos contarán x2.`
      : `Pareja ${outcome.pairNumber} creada: ${outcome.memberNames.join(' / ')}.`,
  };
}

export async function removePair(pairNumber: number): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (!Number.isInteger(pairNumber) || pairNumber < 1) {
    return { ok: false, error: 'Pareja no valida.' };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await lockCompetitionDrawState(tx, context.competitionId);
      const members = await tx.competitionPlayer.findMany({
        where: { competitionId: context.competitionId, pairNumber },
        include: { user: { select: { displayName: true } } },
      });
      if (members.length === 0) throw new Error('Pareja no encontrada.');

      await tx.competitionPlayer.updateMany({
        where: { competitionId: context.competitionId, pairNumber },
        data: { pairNumber: null, pairSoloMultiplier: false },
      });
      await tx.competition.update({
        where: { id: context.competitionId },
        data: { pairDrawSeed: null },
      });
      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: 'PAIR_REMOVED',
          entityType: 'CompetitionPair',
          entityId: `${context.competitionId}:${pairNumber}`,
          beforeData: toJson({
            pairNumber,
            members: members.map((member) => ({
              competitionPlayerId: member.id,
              displayName: member.user.displayName,
              wasSolo: member.pairSoloMultiplier,
            })),
          }),
        },
      });
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se ha podido disolver el equipo.',
    };
  }

  revalidatePath('/admin/parejas');
  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/clasificacion');
  revalidatePath('/admin/exportacion');
  revalidatePath('/clasificacion');
  return { ok: true, message: `Equipo ${pairNumber} disuelto.` };
}

/** Vacía toda la segunda fase para poder reconstruirla manualmente desde cero. */
export async function clearPairs(): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  let cleared = 0;
  try {
    cleared = await prisma.$transaction(async (tx) => {
      await lockCompetitionDrawState(tx, context.competitionId);
      const members = await tx.competitionPlayer.findMany({
        where: {
          competitionId: context.competitionId,
          OR: [{ pairNumber: { not: null } }, { pairSoloMultiplier: true }],
        },
        include: { user: { select: { displayName: true } } },
      });
      if (members.length === 0) {
        await tx.competition.update({
          where: { id: context.competitionId },
          data: { pairDrawSeed: null },
        });
        return 0;
      }

      await tx.competitionPlayer.updateMany({
        where: { competitionId: context.competitionId },
        data: { pairNumber: null, pairSoloMultiplier: false },
      });
      await tx.competition.update({
        where: { id: context.competitionId },
        data: { pairDrawSeed: null },
      });
      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: 'PAIRS_CLEARED_MANUALLY',
          entityType: 'CompetitionPair',
          entityId: context.competitionId,
          beforeData: toJson({
            members: members.map((member) => ({
              competitionPlayerId: member.id,
              displayName: member.user.displayName,
              pairNumber: member.pairNumber,
              wasSolo: member.pairSoloMultiplier,
            })),
          }),
          afterData: toJson({ source: 'MANUAL', pairDrawSeed: null }),
        },
      });
      return members.length;
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'No se han podido vaciar las parejas.',
    };
  }

  for (const path of [
    '/admin',
    '/admin/parejas',
    '/admin/jugadores',
    '/admin/clasificacion',
    '/admin/exportacion',
    '/clasificacion',
    '/tarjeta',
    '/partido',
  ]) {
    revalidatePath(path);
  }

  return {
    ok: true,
    message:
      cleared === 0
        ? 'No había equipos asignados.'
        : `Se han retirado las asignaciones de ${cleared} participante(s). Ya puedes crear las parejas manualmente.`,
  };
}

// ===========================================================================
// Fecha del campeonato
// ===========================================================================

/**
 * Fija la fecha del campeonato. Vacio la quita.
 *
 * Si ya hay horas de salida, se mueven al nuevo dia conservando la hora de
 * reloj: si el partido 1 salia a las 09:10, sigue saliendo a las 09:10 del dia
 * nuevo. Sin esto, cambiar la fecha dejaria las salidas apuntando al dia
 * antiguo.
 */
export async function setCompetitionDate(rawDate: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (context.status === 'CLOSED') {
    return { ok: false, error: 'El campeonato esta cerrado: la fecha no puede cambiarse.' };
  }

  const value = rawDate.trim();
  let date: Date | null = null;
  if (value !== '') {
    try {
      date = competitionDateFromInput(value);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof ScheduleInputError ? error.message : 'Fecha no valida.',
      };
    }
  }

  const flights =
    date === null
      ? []
      : await prisma.flight.findMany({
          where: { competitionId: context.competitionId, teeTime: { not: null } },
          select: { id: true, teeTime: true },
        });

  await prisma.$transaction(async (tx) => {
    await tx.competition.update({
      where: { id: context.competitionId },
      data: { date },
    });

    for (const flight of flights) {
      if (!flight.teeTime) continue;
      await tx.flight.update({
        where: { id: flight.id },
        data: { teeTime: moveTeeTimeToDate(flight.teeTime, value) },
      });
    }

    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'COMPETITION_DATE_SET',
        entityType: 'Competition',
        entityId: context.competitionId,
        beforeData: toJson({ date: context.date ? dateInputInMadrid(context.date) : null }),
        afterData: toJson({ date: date ? value : null, teeTimesMoved: flights.length }),
      },
    });
  });

  revalidatePath('/admin');
  revalidatePath('/admin/partidos');
  revalidatePath('/tarjeta');
  revalidatePath('/partido');

  if (date === null) return { ok: true, message: 'Fecha retirada. El campeonato queda sin fecha.' };
  return {
    ok: true,
    message:
      flights.length > 0
        ? `Fecha guardada. ${flights.length} hora(s) de salida movidas al nuevo dia.`
        : 'Fecha guardada.',
  };
}

// ===========================================================================
// Hora de salida de un partido
// ===========================================================================

/**
 * Fija la hora de salida de un partido ("HH:MM", hora de Ulzama). Vacio la quita.
 *
 * La hora se combina con la fecha del campeonato, asi que hace falta haberla
 * fijado antes en el resumen.
 */
export async function setFlightTeeTime(flightId: string, rawTime: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (context.status === 'CLOSED') {
    return { ok: false, error: 'El campeonato esta cerrado: las horas no pueden cambiarse.' };
  }

  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    select: { id: true, competitionId: true, name: true, teeTime: true },
  });
  if (!flight || flight.competitionId !== context.competitionId) {
    return { ok: false, error: 'Partido no encontrado.' };
  }

  const value = rawTime.trim();
  let teeTime: Date | null = null;
  if (value !== '') {
    if (!context.date) {
      return {
        ok: false,
        error: 'Fija primero la fecha del campeonato en Resumen: la hora se aplica a ese dia.',
      };
    }
    try {
      parseTimeInput(value);
      teeTime = madridInstant(dateInputInMadrid(context.date), value);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof ScheduleInputError ? error.message : 'Hora no valida.',
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.flight.update({ where: { id: flight.id }, data: { teeTime } });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'FLIGHT_TEE_TIME_SET',
        entityType: 'Flight',
        entityId: flight.id,
        beforeData: toJson({ teeTime: flight.teeTime?.toISOString() ?? null }),
        afterData: toJson({ teeTime: teeTime?.toISOString() ?? null, local: value || null }),
      },
    });
  });

  revalidatePath('/admin');
  revalidatePath('/admin/partidos');
  revalidatePath('/partido');
  revalidatePath('/tarjeta');

  return {
    ok: true,
    message: teeTime ? `${flight.name}: salida a las ${value}.` : `${flight.name}: hora retirada.`,
  };
}

/**
 * Resumen de lo que se destruiria al vaciar, para la primera confirmacion.
 *
 * Es de solo lectura: no escribe nada y no autoriza nada. Se llama al abrir el
 * panel de acciones criticas, y vuelve a comprobar el rol porque cualquier
 * funcion exportada de este archivo es alcanzable desde el navegador.
 */
export async function previewScoreReset(): Promise<
  | { ok: true; preview: ReturnType<typeof previewReset> }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId },
    include: {
      user: { select: { displayName: true } },
      scorecard: {
        include: {
          holes: { select: { grossStrokes: true, isPickup: true } },
          reviews: { select: { status: true } },
        },
      },
    },
  });

  const cards: ResetScopeCard[] = players.map((player) => ({
    competitionPlayerId: player.id,
    scorecardId: player.scorecard?.id ?? null,
    displayName: player.user.displayName,
    status: player.scorecard?.status ?? 'NOT_STARTED',
    holeScoreCount: player.scorecard?.holes.length ?? 0,
    holesPlayed:
      player.scorecard?.holes.filter((h) => h.grossStrokes !== null || h.isPickup).length ?? 0,
    points: player.scorecard?.pointsTotal ?? 0,
    isLocked: player.scorecard?.lockedAt !== null && player.scorecard !== null,
    hasReview: (player.scorecard?.reviews.length ?? 0) > 0,
  }));

  return { ok: true, preview: previewReset(cards, context.classificationStatus) };
}

/**
 * Vacia los resultados de TODAS las tarjetas del campeonato actual (seccion 3).
 *
 * ---------------------------------------------------------------------------
 * Por que una sola transaccion
 * ---------------------------------------------------------------------------
 * Porque un vaciado a medias es el peor estado posible: tarjetas vacias con una
 * clasificacion calculada de resultados que ya no existen, o revisiones
 * apuntando a versiones que se fueron. Aqui todo entra o no entra nada.
 *
 * ---------------------------------------------------------------------------
 * Por que se incrementa la generacion
 * ---------------------------------------------------------------------------
 * Porque un movil puede estar sin cobertura con nueve hoyos apuntados en la cola
 * en el momento del vaciado. Al recuperar la conexion, esas nueve operaciones son
 * legitimas y el servidor las aplicaria sin pestanear: resultados borrados
 * reapareciendo solos horas despues. Con la generacion, `applyMutation` las
 * rechaza y el movil las marca como obsoletas (seccion 3.5).
 *
 * Lo que NO se toca: usuarios, contrasenas, roles, hándicaps exactos, el limite
 * de hándicap, colores, partidos, horas de salida, campo, valoracion, reglas y
 * el historial de auditoria anterior.
 */
export async function clearAllScores(confirmationText: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  /**
   * La autorizacion se comprueba AQUI, en el servidor, con la sesion real.
   * Ocultar el boton a los jugadores no es una medida de seguridad: la seccion 3
   * lo dice y `requireAdmin` es lo que la hace cumplir.
   */
  const authorized = authorizeReset({
    actorRole: admin.role,
    confirmationText,
    competitionStatus: context.status,
  });
  if (!authorized.ok) return { ok: false, error: authorized.error };

  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId },
    include: {
      user: { select: { displayName: true } },
      scorecard: {
        include: {
          holes: { select: { grossStrokes: true, isPickup: true } },
          reviews: { select: { status: true } },
        },
      },
    },
  });

  const cards: ResetScopeCard[] = players.map((player) => ({
    competitionPlayerId: player.id,
    scorecardId: player.scorecard?.id ?? null,
    displayName: player.user.displayName,
    status: player.scorecard?.status ?? 'NOT_STARTED',
    holeScoreCount: player.scorecard?.holes.length ?? 0,
    holesPlayed:
      player.scorecard?.holes.filter((h) => h.grossStrokes !== null || h.isPickup).length ?? 0,
    points: player.scorecard?.pointsTotal ?? 0,
    isLocked: player.scorecard?.lockedAt !== null && player.scorecard !== null,
    hasReview: (player.scorecard?.reviews.length ?? 0) > 0,
  }));

  const preview = previewReset(cards, context.classificationStatus);
  const scorecardIds = players
    .map((player) => player.scorecard?.id)
    .filter((id): id is string => typeof id === 'string');

  const audit = buildResetAudit(preview, context.scoreGeneration);

  await prisma.$transaction(async (tx) => {
    /**
     * La generacion se incrementa PRIMERO.
     *
     * Dentro de una transaccion el orden no cambia lo que ve el exterior, pero
     * si lo que ve cualquier escritura que llegue mientras esta corriendo: la
     * fila de Competition queda bloqueada desde este momento, asi que una
     * operacion de un movil que entre a mitad espera y se encuentra ya con la
     * generacion nueva. Es lo que evita que un resultado se cuele entre el
     * borrado y el fin del vaciado.
     */
    const competition = await tx.competition.update({
      where: { id: context.competitionId },
      data: {
        scoreResetVersion: { increment: 1 },
        classificationStatus: 'HIDDEN',
      },
    });

    if (scorecardIds.length > 0) {
      // Los resultados por hoyo: golpes, rayas, netos, puntos y confirmaciones.
      await tx.holeScore.deleteMany({ where: { scorecardId: { in: scorecardIds } } });

      // Revisiones y conflictos abiertos: son datos derivados de resultados que
      // ya no existen, y dejarlos apuntaria a versiones que se han ido.
      await tx.cardReview.deleteMany({ where: { scorecardId: { in: scorecardIds } } });
      await tx.syncConflict.deleteMany({ where: { scorecardId: { in: scorecardIds } } });

      /**
       * Las tarjetas se vacian, NO se borran.
       *
       * `version` se incrementa para que cualquier cliente con la version
       * anterior en la mano detecte que su base ya no vale, y para que una
       * revision hecha antes del vaciado quede automaticamente desactualizada.
       */
      for (const scorecardId of scorecardIds) {
        await tx.scorecard.update({
          where: { id: scorecardId },
          data: {
            status: 'NOT_STARTED',
            holesCompleted: 0,
            pointsTotal: 0,
            numericStrokesTotal: 0,
            pickupCount: 0,
            playerConfirmedFinish: false,
            reviewedById: null,
            reviewedAt: null,
            lockedAt: null,
            version: { increment: 1 },
          },
        });
      }
    }

    /**
     * Las operaciones offline que todavia no han llegado se marcan como
     * rechazadas por obsoletas. Las que ya se aplicaron se dejan como estan: son
     * historia, y reescribirla seria mentir sobre lo que paso.
     */
    await tx.syncMutation.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: 'STALE_GENERATION' },
    });

    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: audit.action,
        entityType: audit.entityType,
        entityId: context.competitionId,
        beforeData: toJson(audit.before),
        afterData: toJson({ ...audit.after, scoreGeneration: competition.scoreResetVersion }),
      },
    });
  });

  // Todo lo que muestra resultados deja de ser valido a la vez.
  revalidatePath('/tarjeta');
  revalidatePath('/partido');
  revalidatePath('/clasificacion');
  revalidatePath('/admin');
  revalidatePath('/admin/tarjetas');
  revalidatePath('/admin/clasificacion');
  revalidatePath('/admin/historial');

  return { ok: true, message: RESET_SUCCESS_MESSAGE };
}
