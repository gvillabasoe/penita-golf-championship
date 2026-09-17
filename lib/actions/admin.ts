'use server';

/**
 * Acciones de administracion.
 *
 * Todas empiezan por `requireAdmin()`, que consulta la sesion de verdad. El
 * middleware no puede hacerlo: corre en edge y no tiene base de datos. Esta es
 * la capa que protege.
 */

import { revalidatePath } from 'next/cache';

import { prisma, toJson } from '../db';
import { requireAdmin } from '../auth/server';
import { getCompetition, getRanking } from '../data/queries';
import { calculateHandicap } from '../golf/handicap';
import { parseHandicapIndexToTenths, HandicapParseError } from '../golf/decimal';
import { changeRuleSet, buildRuleVersion } from '../golf/competition-config';
import { assignTeeTimes, confirmDraw, drawFlights, validateFlights } from '../admin/draw';
import { applyRevealAction, type RevealAction } from '../reveal/controller';
import { rankingFingerprint } from '../golf/ranking';
import { randomBytes } from 'node:crypto';

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

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

  const calculation = calculateHandicap(tenths, context.snapshot, {
    allowancePercent: context.allowancePercent,
    roundingPolicy: 'ROUND_TWICE',
    ruleVersion: context.ruleVersion,
  });

  await prisma.$transaction(async (tx) => {
    await tx.competitionPlayer.update({
      where: { id: competitionPlayerId },
      data: {
        handicapIndexTenths: tenths,
        courseHandicapRawHundredths: calculation.courseHandicapRawHundredths,
        courseHandicap: calculation.courseHandicap,
        playingHandicapRawHundredths: calculation.playingHandicapRawHundredths,
        playingHandicap: calculation.playingHandicap,
        calculationVersion: calculation.ruleVersion,
      },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: admin.userId,
        action: 'HANDICAP_SET',
        entityType: 'CompetitionPlayer',
        entityId: competitionPlayerId,
        beforeData: toJson({ handicapIndexTenths: player.handicapIndexTenths, playingHandicap: player.playingHandicap }),
        afterData: toJson({ handicapIndexTenths: tenths, playingHandicap: calculation.playingHandicap }),
      },
    });
  });

  revalidatePath('/admin/jugadores');
  revalidatePath('/clasificacion');
  return { ok: true, message: `Hándicap de juego: ${calculation.playingHandicap}` };
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
    players: players.map((p) => ({
      playerId: p.id,
      handicapIndexTenths: p.handicapIndexTenths as number,
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

    // Recalculo de todos los afectados.
    for (const player of players) {
      const calculation = calculateHandicap(player.handicapIndexTenths as number, context.snapshot, {
        allowancePercent,
        roundingPolicy,
        ruleVersion: result.ruleVersion,
      });
      await tx.competitionPlayer.update({
        where: { id: player.id },
        data: {
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
