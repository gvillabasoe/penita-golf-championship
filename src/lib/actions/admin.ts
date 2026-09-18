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
import { assignTeeTimes, confirmDraw, drawFlights, validateFlights } from '../admin/draw';
import { applyRevealAction, type RevealAction } from '../reveal/controller';
import { rankingFingerprint } from '../golf/ranking';
import { randomBytes } from 'node:crypto';

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

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

  await prisma.$transaction(async (tx) => {
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
        }),
      },
    });
  });

  revalidatePath('/admin/jugadores');
  revalidatePath('/admin/partidos');
  revalidatePath('/clasificacion');
  revalidatePath('/partido');
  revalidatePath('/tarjeta');

  const capped = appliedTenths !== tenths;
  return {
    ok: true,
    message: capped
      ? `Hándicap exacto ${formatTenths(tenths)}, limitado a ${formatTenths(appliedTenths)}. Hándicap de juego: ${calculation.playingHandicap}`
      : `Hándicap de juego: ${calculation.playingHandicap}`,
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
  return { ok: true, message: `${result.impact.length} jugador(es) cambian de hándicap de juego.` };
}

/** Sortea los partidos. Devuelve la propuesta sin guardarla. */
export async function previewDraw(seed?: string): Promise<
  | { ok: true; seed: string; flights: Array<{ order: number; name: string; memberIds: string[] }> }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId },
    include: { user: { select: { displayName: true } } },
  });

  const usedSeed = seed?.trim() || randomBytes(8).toString('hex');

  try {
    const proposal = drawFlights({
      players: players.map((p) => ({
        competitionPlayerId: p.id,
        displayName: p.user.displayName,
        isActive: p.isActive,
      })),
      seed: usedSeed,
    });
    return {
      ok: true,
      seed: proposal.seed,
      flights: proposal.flights.map((f) => ({
        order: f.order,
        name: f.name,
        memberIds: f.memberIds,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sorteo fallido.' };
  }
}

/** Guarda el sorteo con sus horas de salida. */
export async function saveDraw(
  seed: string,
  firstTeeTime: string,
  intervalMinutes = 10,
): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const players = await prisma.competitionPlayer.findMany({
    where: { competitionId: context.competitionId },
    include: { user: { select: { displayName: true } } },
  });

  const drawPlayers = players.map((p) => ({
    competitionPlayerId: p.id,
    displayName: p.user.displayName,
    isActive: p.isActive,
  }));

  let proposal;
  try {
    proposal = drawFlights({ players: drawPlayers, seed });
    proposal.flights = assignTeeTimes(proposal.flights, firstTeeTime, intervalMinutes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sorteo fallido.' };
  }

  const issues = validateFlights({
    flights: proposal.flights,
    players: drawPlayers,
    requireTeeTimes: true,
  });
  const errors = issues.filter((issue) => issue.severity === 'ERROR');
  if (errors.length > 0) return { ok: false, error: errors.map((e) => e.message).join(' ') };

  const confirmation = confirmDraw({
    proposal,
    players: drawPlayers,
    actorId: admin.userId,
    actorRole: 'ADMIN',
  });
  if (!confirmation.ok) return { ok: false, error: confirmation.errors.join(' ') };

  await prisma.$transaction(async (tx) => {
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
    if (confirmation.audit) {
      await tx.auditLog.create({
        data: {
          competitionId: context.competitionId,
          actorId: admin.userId,
          action: confirmation.audit.action,
          entityType: confirmation.audit.entityType,
          entityId: context.competitionId,
          afterData: toJson(confirmation.audit.afterData),
        },
      });
    }
  });

  revalidatePath('/admin/partidos');
  revalidatePath('/partido');
  return { ok: true, message: `${proposal.flights.length} partidos guardados. Semilla: ${seed}` };
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

/** Controla la revelacion progresiva. */
export async function controlReveal(action: RevealAction): Promise<AdminResult> {
  const admin = await requireAdmin();
  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const { rows, order, state } = await getRanking(context);
  const fingerprint = rankingFingerprint(rows);

  const stored = await prisma.classificationReveal.findUnique({
    where: { competitionId: context.competitionId },
  });

  const currentState = {
    ...state,
    snapshotFingerprint: stored?.snapshotId ? (stored.snapshotId.split('#')[1] ?? null) : null,
    totalGroups: order.length,
  };

  // Snapshot nuevo al iniciar o reiniciar.
  const needsSnapshot = action === 'START' || action === 'RESTART';
  const snapshotId = needsSnapshot
    ? `${new Date().toISOString()}#${fingerprint}`
    : (stored?.snapshotId ?? undefined);

  const result = applyRevealAction(currentState, action, {
    actorId: admin.userId,
    actorRole: 'ADMIN',
    currentFingerprint: fingerprint,
    totalGroups: order.length,
    snapshotId,
  });

  if (!result.ok) return { ok: false, error: result.errors.join(' ') };

  await prisma.$transaction(async (tx) => {
    await tx.classificationReveal.upsert({
      where: { competitionId: context.competitionId },
      create: {
        competitionId: context.competitionId,
        snapshotId: null,
        status: result.state.status,
        revealedCount: result.state.revealedCount,
        isPaused: result.state.isPaused,
        currentIndex: result.state.revealedCount,
        nextActionAvailableAt: new Date(result.state.nextActionAvailableAt),
        publishedAt: result.state.publishedAt ? new Date(result.state.publishedAt) : null,
        updatedById: admin.userId,
      },
      update: {
        status: result.state.status,
        revealedCount: result.state.revealedCount,
        isPaused: result.state.isPaused,
        currentIndex: result.state.revealedCount,
        nextActionAvailableAt: new Date(result.state.nextActionAvailableAt),
        publishedAt: result.state.publishedAt ? new Date(result.state.publishedAt) : null,
        updatedById: admin.userId,
      },
    });

    await tx.competition.update({
      where: { id: context.competitionId },
      data: { classificationStatus: result.state.status },
    });

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
        },
      });
    }
  });

  revalidatePath('/clasificacion');
  revalidatePath('/admin/revelacion');
  return { ok: true };
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

    // Clasificacion: snapshots congelados y estado de revelacion.
    await tx.rankingSnapshot.deleteMany({ where: { competitionId: context.competitionId } });
    await tx.classificationReveal.updateMany({
      where: { competitionId: context.competitionId },
      data: {
        status: 'HIDDEN',
        snapshotId: null,
        revealedCount: 0,
        currentIndex: 0,
        isPaused: false,
        publishedAt: null,
        nextActionAvailableAt: null,
        updatedById: admin.userId,
      },
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
  revalidatePath('/admin/revelacion');
  revalidatePath('/admin/historial');

  return { ok: true, message: RESET_SUCCESS_MESSAGE };
}
