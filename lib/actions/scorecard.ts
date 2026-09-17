'use server';

/**
 * Acciones de la tarjeta.
 *
 * Toda la decision esta en el dominio: `applyMutation` resuelve autorizacion,
 * idempotencia y conflictos, y tiene sus tests. Aqui se carga el estado, se
 * llama, y se escribe el resultado en una transaccion.
 */

import { revalidatePath } from 'next/cache';

import { prisma, toJson } from '../db';
import { getCurrentUser } from '../auth/server';
import { getCompetition } from '../data/queries';
import { applyMutation, type ServerScorecardState } from '../sync/apply';
import { allocateStrokes } from '../golf/strokes';
import { resolveHole, deriveStatus, canFinish, resolveScorecard, computeTotals, type HoleScoreInput } from '../golf/stableford';
import { evaluateReview, canReviewCard } from '../scorecard/visibility';
import type { HoleMutation } from '../sync/queue';

export type ActionResult =
  | { ok: true; version: number; staleAllocation?: boolean }
  | { ok: false; error: string; kind?: 'CONFLICT' | 'REJECTED' };

async function loadState(scorecardId: string): Promise<ServerScorecardState | null> {
  const card = await prisma.scorecard.findUnique({
    where: { id: scorecardId },
    include: { holes: true, player: { select: { userId: true } } },
  });
  if (!card) return null;

  return {
    id: card.id,
    ownerUserId: card.player.userId,
    version: card.version,
    status: card.status,
    allocationVersion: 1,
    holes: Object.fromEntries(
      card.holes.map((hole) => [
        hole.holeNumber,
        {
          grossStrokes: hole.grossStrokes,
          isPickup: hole.isPickup,
          isOverridden: hole.isOverridden,
          serverVersion: hole.serverVersion,
          lastWriterClientId: null,
        },
      ]),
    ),
  };
}

/** Escribe un hoyo. Se llama al confirmar en el teclado. */
export async function saveHole(input: {
  clientMutationId: string;
  clientId: string;
  holeNumber: number;
  grossStrokes: number | null;
  isPickup: boolean;
  baseVersion: number;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Sesion caducada. Vuelve a entrar.' };

  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };
  if (!user.competitionPlayerId) return { ok: false, error: 'No estas inscrito en la competicion.' };

  const player = await prisma.competitionPlayer.findUnique({
    where: { id: user.competitionPlayerId },
    include: { scorecard: true },
  });
  if (!player) return { ok: false, error: 'No estas inscrito en la competicion.' };

  const scorecard =
    player.scorecard ??
    (await prisma.scorecard.create({ data: { competitionPlayerId: player.id } }));

  // Idempotencia: si esta operacion ya se aplico, no se repite.
  const existing = await prisma.syncMutation.findUnique({
    where: { clientMutationId: input.clientMutationId },
  });
  const appliedIds = new Set(existing && existing.status === 'APPLIED' ? [input.clientMutationId] : []);

  const state = await loadState(scorecard.id);
  if (!state) return { ok: false, error: 'No se encuentra la tarjeta.' };

  const mutation: HoleMutation = {
    clientMutationId: input.clientMutationId,
    clientId: input.clientId,
    userId: user.userId,
    scorecardId: scorecard.id,
    holeNumber: input.holeNumber,
    grossStrokes: input.grossStrokes,
    isPickup: input.isPickup,
    baseVersion: input.baseVersion,
    createdAtLocal: new Date().toISOString(),
  };

  const outcome = applyMutation(state, mutation, appliedIds, {
    actorUserId: user.userId,
    actorRole: user.role,
    competitionClosed: context.status === 'CLOSED',
  });

  if (outcome.type === 'DUPLICATE') return { ok: true, version: outcome.version };
  if (outcome.type === 'REJECTED') return { ok: false, error: outcome.message, kind: 'REJECTED' };

  if (outcome.type === 'CONFLICT') {
    await prisma.syncConflict.create({
      data: {
        scorecardId: scorecard.id,
        holeNumber: outcome.conflict.holeNumber,
        localValue: toJson(outcome.conflict.localValue),
        serverValue: toJson(outcome.conflict.serverValue),
        baseVersion: outcome.conflict.baseVersion,
        serverVersion: outcome.conflict.serverVersion,
        reason: outcome.conflict.reason,
      },
    });
    return {
      ok: false,
      kind: 'CONFLICT',
      error:
        outcome.conflict.reason === 'ADMIN_OVERRIDE'
          ? 'El administrador ha corregido este hoyo. Habla con el antes de cambiarlo.'
          : 'Otro dispositivo ha escrito este hoyo. Recarga la tarjeta.',
    };
  }

  const hole = context.snapshot.holes.find((h) => h.holeNumber === input.holeNumber);
  if (!hole) return { ok: false, error: 'Hoyo desconocido.' };

  const strokesReceived =
    allocateStrokes(player.playingHandicap ?? 0, context.snapshot.holes).find(
      (a) => a.holeNumber === input.holeNumber,
    )?.strokesReceived ?? 0;

  const resolved = resolveHole(hole, strokesReceived, {
    holeNumber: input.holeNumber,
    grossStrokes: input.grossStrokes,
    isPickup: input.isPickup,
  });

  await prisma.$transaction(async (tx) => {
    await tx.holeScore.upsert({
      where: { scorecardId_holeNumber: { scorecardId: scorecard.id, holeNumber: input.holeNumber } },
      create: {
        scorecardId: scorecard.id,
        holeNumber: input.holeNumber,
        grossStrokes: resolved.grossStrokes,
        isPickup: resolved.isPickup,
        strokesReceived,
        netStrokes: resolved.netStrokes,
        grossToPar: resolved.grossToPar,
        netToPar: resolved.netToPar,
        stablefordPoints: resolved.stablefordPoints,
        isConfirmed: true,
        serverVersion: outcome.version,
        confirmedAt: new Date(),
      },
      update: {
        grossStrokes: resolved.grossStrokes,
        isPickup: resolved.isPickup,
        strokesReceived,
        netStrokes: resolved.netStrokes,
        grossToPar: resolved.grossToPar,
        netToPar: resolved.netToPar,
        stablefordPoints: resolved.stablefordPoints,
        isConfirmed: true,
        isOverridden: false,
        serverVersion: outcome.version,
        confirmedAt: new Date(),
      },
    });

    const holes = await tx.holeScore.findMany({ where: { scorecardId: scorecard.id } });
    const inputs = new Map<number, HoleScoreInput>(
      holes.map((h) => [
        h.holeNumber,
        { holeNumber: h.holeNumber, grossStrokes: h.grossStrokes, isPickup: h.isPickup },
      ]),
    );
    const strokesByHole = new Map(
      allocateStrokes(player.playingHandicap ?? 0, context.snapshot.holes).map((a) => [
        a.holeNumber,
        a.strokesReceived,
      ]),
    );
    const results = resolveScorecard(context.snapshot.holes, strokesByHole, inputs);
    const totals = computeTotals(results);

    await tx.scorecard.update({
      where: { id: scorecard.id },
      data: {
        version: outcome.version,
        holesCompleted: totals.total.holesPlayed,
        pointsTotal: totals.total.points,
        numericStrokesTotal: totals.total.numericStrokes,
        pickupCount: totals.total.pickups,
        status: deriveStatus(
          results,
          scorecard.playerConfirmedFinish,
          scorecard.reviewedAt !== null,
          scorecard.lockedAt !== null,
        ),
      },
    });

    await tx.syncMutation.upsert({
      where: { clientMutationId: input.clientMutationId },
      create: {
        clientMutationId: input.clientMutationId,
        userId: user.userId,
        entityType: 'HoleScore',
        entityId: `${scorecard.id}:${input.holeNumber}`,
        operation: 'WRITE',
        payloadHash: `${input.grossStrokes ?? 'raya'}`,
        status: 'APPLIED',
        appliedAt: new Date(),
      },
      update: { status: 'APPLIED', appliedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: user.userId,
        action: outcome.audit.action,
        entityType: outcome.audit.entityType,
        entityId: outcome.audit.entityId,
        beforeData: toJson(outcome.audit.beforeData),
        afterData: toJson(outcome.audit.afterData),
      },
    });
  });

  revalidatePath('/tarjeta');
  return { ok: true, version: outcome.version, staleAllocation: outcome.staleAllocation };
}

/** Finaliza la tarjeta. Exige los 18 hoyos con resultado o raya. */
export async function finishScorecard(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.competitionPlayerId) return { ok: false, error: 'Sesion caducada.' };

  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const player = await prisma.competitionPlayer.findUnique({
    where: { id: user.competitionPlayerId },
    include: { scorecard: { include: { holes: true } } },
  });
  if (!player?.scorecard) return { ok: false, error: 'No has empezado la tarjeta.' };

  const strokesByHole = new Map(
    allocateStrokes(player.playingHandicap ?? 0, context.snapshot.holes).map((a) => [
      a.holeNumber,
      a.strokesReceived,
    ]),
  );
  const inputs = new Map<number, HoleScoreInput>(
    player.scorecard.holes.map((h) => [
      h.holeNumber,
      { holeNumber: h.holeNumber, grossStrokes: h.grossStrokes, isPickup: h.isPickup },
    ]),
  );
  const results = resolveScorecard(context.snapshot.holes, strokesByHole, inputs);
  const check = canFinish(results);

  if (!check.ok) {
    return {
      ok: false,
      error: `Faltan hoyos: ${check.missingHoles.join(', ')}. Apunta resultado o raya en cada uno.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.scorecard.update({
      where: { id: player.scorecard!.id },
      data: { playerConfirmedFinish: true, status: 'FINISHED' },
    });
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: user.userId,
        action: 'SCORECARD_FINISHED',
        entityType: 'Scorecard',
        entityId: player.scorecard!.id,
      },
    });
  });

  revalidatePath('/tarjeta');
  return { ok: true, version: player.scorecard.version };
}

/** Revisa la tarjeta de un companero de partido. */
export async function reviewScorecard(
  targetCompetitionPlayerId: string,
  status: 'OK' | 'OBJECTED',
  notes?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.competitionPlayerId) return { ok: false, error: 'Sesion caducada.' };

  const context = await getCompetition();
  if (!context) return { ok: false, error: 'No hay competicion configurada.' };

  const target = await prisma.competitionPlayer.findUnique({
    where: { id: targetCompetitionPlayerId },
    include: { scorecard: { include: { reviews: true } }, flightMember: true },
  });
  if (!target?.scorecard) return { ok: false, error: 'Esa tarjeta no existe.' };

  const eligibility = canReviewCard(
    { competitionPlayerId: user.competitionPlayerId, role: user.role, flightId: user.flightId },
    {
      competitionPlayerId: target.id,
      flightId: target.flightMember?.flightId ?? null,
      status: target.scorecard.status,
    },
  );
  if (!eligibility.canReview) {
    return { ok: false, error: eligibility.reason ?? 'No puedes revisar esta tarjeta.' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.cardReview.create({
      data: {
        scorecardId: target.scorecard!.id,
        reviewerId: user.userId,
        scorecardVersion: target.scorecard!.version,
        status,
        notes: notes?.trim() || null,
      },
    });
    if (status === 'OK') {
      await tx.scorecard.update({
        where: { id: target.scorecard!.id },
        data: { status: 'REVIEWED', reviewedById: user.userId, reviewedAt: new Date() },
      });
    }
    await tx.auditLog.create({
      data: {
        competitionId: context.competitionId,
        actorId: user.userId,
        action: status === 'OK' ? 'CARD_REVIEWED' : 'CARD_OBJECTED',
        entityType: 'Scorecard',
        entityId: target.scorecard!.id,
        reason: notes?.trim() || null,
      },
    });
  });

  revalidatePath('/partido');
  return { ok: true, version: target.scorecard.version };
}

/** Estado de la revision, para la pantalla del partido. */
export async function reviewStateFor(scorecardId: string) {
  const card = await prisma.scorecard.findUnique({
    where: { id: scorecardId },
    include: { reviews: true },
  });
  if (!card) return null;
  return evaluateReview(
    card.reviews.map((review) => ({
      reviewerId: review.reviewerId,
      scorecardVersion: review.scorecardVersion,
      status: review.status,
      createdAt: review.createdAt,
    })),
    card.version,
  );
}
