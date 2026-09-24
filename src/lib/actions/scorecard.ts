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
import type { HoleMutation, HoleOperation } from '../sync/queue';

export type ActionResult =
  | { ok: true; version: number; staleAllocation?: boolean }
  | { ok: false; error: string; kind?: 'CONFLICT' | 'REJECTED' | 'STALE_GENERATION' };

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

/**
 * Nucleo comun de "escribir un hoyo" y "borrar un hoyo".
 *
 * Las dos operaciones recorren exactamente el mismo camino: cargar el estado,
 * dejar que `applyMutation` decida, y escribir el resultado en una transaccion.
 * Lo unico que cambia es el contenido del hoyo que queda al final.
 *
 * Estan juntas a proposito. Cuando eran dos funciones separadas, el recalculo de
 * totales y el registro de auditoria acabaron duplicados, y un cambio en uno de
 * los dos caminos dejaba el otro desincronizado. Aqui el recalculo ocurre una
 * sola vez, con lo que haya en la tabla despues de la escritura, sea cual sea la
 * operacion.
 *
 * No se exporta: en un archivo `'use server'` cada funcion exportada es una
 * Server Action accesible desde el navegador, y esta recibe la operacion como
 * parametro. Las dos puertas publicas son `saveHole` y `clearHole`.
 */
async function writeHole(
  operation: HoleOperation,
  input: {
    clientMutationId: string;
    clientId: string;
    holeNumber: number;
    grossStrokes: number | null;
    isPickup: boolean;
    baseVersion: number;
    /** Generacion de resultados que el movil tenia. */
    scoreGeneration?: number;
  },
): Promise<ActionResult> {
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

  /**
   * Borrar exige que la tarjeta exista. Crearla aqui para dejarla vacia acto
   * seguido no tendria ningun sentido, y el mensaje explica el estado real en
   * lugar de fingir que ha pasado algo.
   */
  if (operation === 'CLEAR' && !player.scorecard) {
    return { ok: false, error: 'Todavia no has apuntado nada en esta tarjeta.' };
  }

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
    operation,
    grossStrokes: operation === 'CLEAR' ? null : input.grossStrokes,
    isPickup: operation === 'CLEAR' ? false : input.isPickup,
    baseVersion: input.baseVersion,
    // Sin dato del cliente se asume la generacion vigente: una operacion escrita
    // en esta misma peticion no puede ser anterior a un vaciado.
    scoreGeneration: input.scoreGeneration ?? context.scoreGeneration,
    createdAtLocal: new Date().toISOString(),
  };

  const outcome = applyMutation(state, mutation, appliedIds, {
    actorUserId: user.userId,
    actorRole: user.role,
    competitionClosed: context.status === 'CLOSED',
    competitionScoreGeneration: context.scoreGeneration,
  });

  if (outcome.type === 'DUPLICATE') return { ok: true, version: outcome.version };

  if (outcome.type === 'REJECTED') {
    /**
     * Una operacion obsoleta se registra como rechazada antes de contestar.
     *
     * Sin esta fila, el jugador ve un aviso que no cuadra con nada y el
     * administrador no tiene forma de saber cuantos resultados se quedaron por
     * el camino al vaciar las tarjetas.
     */
    if (outcome.code === 'STALE_GENERATION') {
      await prisma.syncMutation.upsert({
        where: { clientMutationId: input.clientMutationId },
        create: {
          clientMutationId: input.clientMutationId,
          userId: user.userId,
          entityType: 'HoleScore',
          entityId: `${scorecard.id}:${input.holeNumber}`,
          operation,
          payloadHash: operation === 'CLEAR' ? 'vacio' : `${input.grossStrokes ?? 'raya'}`,
          scoreGeneration: mutation.scoreGeneration ?? 0,
          status: 'REJECTED',
          rejectionReason: outcome.code,
        },
        update: { status: 'REJECTED', rejectionReason: outcome.code },
      });
      return { ok: false, error: outcome.message, kind: 'STALE_GENERATION' };
    }
    return { ok: false, error: outcome.message, kind: 'REJECTED' };
  }

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

  /**
   * Un hoyo borrado se resuelve con la misma funcion que cualquier otro, pasando
   * la entrada vacia. `resolveHole` ya sabe que eso es un hoyo sin jugar, y no
   * una raya: no hay que replicar la regla aqui.
   */
  const resolved = resolveHole(hole, strokesReceived, {
    holeNumber: input.holeNumber,
    grossStrokes: mutation.grossStrokes,
    isPickup: mutation.isPickup,
  });
  const isClear = operation === 'CLEAR';

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
        // Un hoyo vacio NO esta confirmado: es lo que lo distingue de una raya,
        // que si es un resultado que el jugador ha dado por bueno.
        isConfirmed: !isClear,
        serverVersion: outcome.version,
        confirmedAt: isClear ? null : new Date(),
      },
      update: {
        grossStrokes: resolved.grossStrokes,
        isPickup: resolved.isPickup,
        strokesReceived,
        netStrokes: resolved.netStrokes,
        grossToPar: resolved.grossToPar,
        netToPar: resolved.netToPar,
        stablefordPoints: resolved.stablefordPoints,
        isConfirmed: !isClear,
        isOverridden: false,
        serverVersion: outcome.version,
        confirmedAt: isClear ? null : new Date(),
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

    /**
     * Borrar un hoyo puede devolver la tarjeta a "En juego" desde "Finalizada" o
     * "Revisada", y en ese caso la confirmacion del jugador deja de ser cierta:
     * ya no ha terminado. Se retira, porque si no `deriveStatus` volveria a dar
     * FINISHED en cuanto rellenase el hueco, sin que nadie lo hubiera vuelto a
     * confirmar.
     */
    const stillComplete = totals.total.holesPlayed === results.length;
    const playerConfirmedFinish = scorecard.playerConfirmedFinish && stillComplete;

    await tx.scorecard.update({
      where: { id: scorecard.id },
      data: {
        version: outcome.version,
        holesCompleted: totals.total.holesPlayed,
        pointsTotal: totals.total.points,
        numericStrokesTotal: totals.total.numericStrokes,
        pickupCount: totals.total.pickups,
        playerConfirmedFinish,
        status: deriveStatus(
          results,
          playerConfirmedFinish,
          scorecard.reviewedAt !== null && stillComplete,
          scorecard.lockedAt !== null,
        ),
      },
    });

    /**
     * La revision existente queda DESACTUALIZADA, no borrada.
     *
     * `evaluateReview` compara la version de la tarjeta con la de la revision, y
     * al haber subido la version ya la considera obsoleta sola. Marcarla aqui
     * como OUTDATED es lo que hace que el companero que reviso vea por que se le
     * vuelve a pedir, en lugar de encontrarse la pantalla como si nunca hubiera
     * revisado nada.
     */
    if (isClear && !stillComplete) {
      await tx.cardReview.updateMany({
        where: { scorecardId: scorecard.id, status: 'OK' },
        data: { status: 'OUTDATED' },
      });
      await tx.scorecard.update({
        where: { id: scorecard.id },
        data: { reviewedById: null, reviewedAt: null },
      });
    }

    await tx.syncMutation.upsert({
      where: { clientMutationId: input.clientMutationId },
      create: {
        clientMutationId: input.clientMutationId,
        userId: user.userId,
        entityType: 'HoleScore',
        entityId: `${scorecard.id}:${input.holeNumber}`,
        operation,
        payloadHash: isClear ? 'vacio' : `${input.grossStrokes ?? 'raya'}`,
        scoreGeneration: mutation.scoreGeneration ?? 0,
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

  // Invalida tambien las rutas de los otros hoyos: tras guardar se navega al
  // siguiente, que debe recibir la version nueva de la tarjeta y no una RSC
  // visitada anteriormente con un `baseVersion` ya obsoleto.
  revalidatePath('/tarjeta', 'layout');
  revalidatePath(`/tarjeta/${input.holeNumber}`);
  revalidatePath('/partido');
  revalidatePath('/clasificacion');
  return { ok: true, version: outcome.version, staleAllocation: outcome.staleAllocation };
}

/** Escribe un hoyo. Se llama al confirmar en el teclado. */
export async function saveHole(input: {
  clientMutationId: string;
  clientId: string;
  holeNumber: number;
  grossStrokes: number | null;
  isPickup: boolean;
  baseVersion: number;
  scoreGeneration?: number;
}): Promise<ActionResult> {
  return writeHole('WRITE', input);
}

/**
 * Borra el resultado de un hoyo y lo deja realmente VACIO (seccion 4).
 *
 * Vacio no es raya: no cuenta como hoyo completado, no da puntos e impide
 * finalizar la tarjeta. La distincion la sostiene `resolveHole`, no esta accion.
 *
 * Los permisos NO se amplian: quien puede borrar es exactamente quien ya podia
 * escribir, y lo decide `applyMutation` con la sesion del servidor. Un jugador
 * no puede borrar en la tarjeta de otro ni en una tarjeta bloqueada.
 *
 * Es idempotente por el `clientMutationId`, asi que reenviarla desde la cola
 * offline no da error ni deja el hoyo en un estado raro.
 */
export async function clearHole(input: {
  clientMutationId: string;
  clientId: string;
  holeNumber: number;
  baseVersion: number;
  scoreGeneration?: number;
}): Promise<ActionResult> {
  return writeHole('CLEAR', {
    ...input,
    grossStrokes: null,
    isPickup: false,
  });
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
