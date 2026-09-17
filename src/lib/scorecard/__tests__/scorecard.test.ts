import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConfirmationSummary,
  canEditHole,
  checkCanFinish,
  deriveSaveStatus,
  lastPlayedHole,
  nextPendingHole,
  PLAYER_KEYPAD,
} from '../session';
import {
  canReviewCard,
  canSeeProvisionalPoints,
  cardAccess,
  evaluateReview,
  type ReviewRecord,
  type TargetCard,
  type Viewer,
} from '../visibility';
import { allocateStrokes } from '../../golf/strokes';
import { resolveScorecard, type HoleScoreInput } from '../../golf/stableford';
import { ULZAMA_HOLES } from '../../golf/course';

const strokesFor = (hj: number) =>
  new Map(allocateStrokes(hj, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]));

const buildResults = (played: Record<number, number | 'RAYA'>) => {
  const inputs = new Map<number, HoleScoreInput>(
    Object.entries(played).map(([hole, value]) => [
      Number(hole),
      value === 'RAYA'
        ? { holeNumber: Number(hole), grossStrokes: null, isPickup: true }
        : { holeNumber: Number(hole), grossStrokes: value, isPickup: false },
    ]),
  );
  return resolveScorecard(ULZAMA_HOLES, strokesFor(25), inputs);
};

describe('navegacion por la tarjeta', () => {
  test('el teclado del jugador es 1-9 y raya, nada mas', () => {
    assert.deepEqual(PLAYER_KEYPAD, [1, 2, 3, 4, 5, 6, 7, 8, 9, 'PICKUP']);
  });

  test('tarjeta vacia: el siguiente pendiente desde el 1 es el 2', () => {
    const results = buildResults({});
    assert.equal(nextPendingHole(results, 1), 2);
    assert.equal(lastPlayedHole(results), null);
  });

  test('avanza al siguiente hoyo sin resultado', () => {
    const results = buildResults({ 1: 5, 2: 3, 3: 4 });
    assert.equal(nextPendingHole(results, 3), 4);
    assert.equal(lastPlayedHole(results), 3);
  });

  test('da la vuelta: desde el 18 vuelve al hoyo saltado', () => {
    const played: Record<number, number> = {};
    for (let h = 1; h <= 18; h += 1) if (h !== 7) played[h] = 5;
    const results = buildResults(played);
    assert.equal(nextPendingHole(results, 18), 7);
  });

  test('tarjeta completa: no queda ninguno pendiente', () => {
    const played: Record<number, number> = {};
    for (let h = 1; h <= 18; h += 1) played[h] = 5;
    assert.equal(nextPendingHole(buildResults(played), 18), null);
  });

  test('la raya cuenta como resultado y no se vuelve a ofrecer', () => {
    const results = buildResults({ 1: 5, 2: 'RAYA' });
    assert.equal(nextPendingHole(results, 1), 3);
    assert.equal(lastPlayedHole(results), 2);
  });
});

describe('permisos de edicion de un hoyo', () => {
  test('el dueno puede editar mientras no este bloqueada', () => {
    const permission = canEditHole({
      status: 'IN_PLAY',
      role: 'PLAYER',
      isOwner: true,
      isHoleOverridden: false,
      hasReview: false,
    });
    assert.equal(permission.canEdit, true);
  });

  test('una tarjeta bloqueada no la edita el jugador', () => {
    const permission = canEditHole({
      status: 'LOCKED',
      role: 'PLAYER',
      isOwner: true,
      isHoleOverridden: false,
      hasReview: false,
    });
    assert.equal(permission.canEdit, false);
    assert.match(permission.reason ?? '', /bloqueada/);
  });

  test('nadie edita la tarjeta de otro', () => {
    const permission = canEditHole({
      status: 'IN_PLAY',
      role: 'PLAYER',
      isOwner: false,
      isHoleOverridden: false,
      hasReview: false,
    });
    assert.equal(permission.canEdit, false);
  });

  test('un jugador no pisa una correccion administrativa', () => {
    const permission = canEditHole({
      status: 'IN_PLAY',
      role: 'PLAYER',
      isOwner: true,
      isHoleOverridden: true,
      hasReview: false,
    });
    assert.equal(permission.canEdit, false);
    assert.equal(permission.overridesAdminCorrection, true);
    assert.match(permission.reason ?? '', /autorizacion/);
  });

  test('el administrador edita siempre, incluso bloqueada', () => {
    const permission = canEditHole({
      status: 'LOCKED',
      role: 'ADMIN',
      isOwner: false,
      isHoleOverridden: true,
      hasReview: true,
    });
    assert.equal(permission.canEdit, true);
    assert.equal(permission.invalidatesReview, true);
  });

  test('editar tras una revision avisa de que la invalida', () => {
    const permission = canEditHole({
      status: 'REVIEWED',
      role: 'PLAYER',
      isOwner: true,
      isHoleOverridden: false,
      hasReview: true,
    });
    assert.equal(permission.canEdit, true);
    assert.equal(permission.invalidatesReview, true);
  });
});

describe('resumen previo a confirmar un hoyo', () => {
  const hole5 = ULZAMA_HOLES[4]; // par 5, SI 1, 523 m

  test('muestra todo lo que exige la seccion 36', () => {
    const summary = buildConfirmationSummary(hole5, 2, {
      holeNumber: 5,
      grossStrokes: 6,
      isPickup: false,
    });
    assert.equal(summary.par, 5);
    assert.equal(summary.strokeIndex, 1);
    assert.equal(summary.distance, 523);
    assert.equal(summary.strokesReceived, 2);
    assert.equal(summary.strokesReceivedLabel, 'Recibe 2 golpes en este hoyo');
    assert.equal(summary.grossStrokes, 6);
    assert.equal(summary.netStrokes, 4);
    assert.equal(summary.stablefordPoints, 3); // neto 4 en par 5 = birdie neto
    assert.equal(summary.requiresExtraConfirmation, false);
  });

  test('la raya se resume como raya y sin puntuacion', () => {
    const summary = buildConfirmationSummary(hole5, 2, {
      holeNumber: 5,
      grossStrokes: null,
      isPickup: true,
    });
    assert.equal(summary.isPickup, true);
    assert.equal(summary.grossLabel, 'Raya');
    assert.equal(summary.stablefordPoints, 0);
    assert.equal(summary.netStrokes, null);
  });

  test('un hoyo en uno pide confirmacion extra pero no se bloquea', () => {
    const hole2 = ULZAMA_HOLES[1]; // par 3
    const summary = buildConfirmationSummary(hole2, 1, {
      holeNumber: 2,
      grossStrokes: 1,
      isPickup: false,
    });
    assert.equal(summary.requiresExtraConfirmation, true);
    assert.match(summary.extraConfirmationMessage ?? '', /Hoyo en uno/);
    assert.equal(summary.stablefordPoints, 5); // neto -1 con golpe recibido: albatros neto
  });

  test('un resultado normal no pide confirmacion extra', () => {
    const summary = buildConfirmationSummary(ULZAMA_HOLES[0], 1, {
      holeNumber: 1,
      grossStrokes: 5,
      isPickup: false,
    });
    assert.equal(summary.requiresExtraConfirmation, false);
    assert.equal(summary.extraConfirmationMessage, null);
  });
});

describe('estado de guardado', () => {
  test('todo enviado: sincronizado', () => {
    const status = deriveSaveStatus({
      pendingCount: 0,
      inFlightCount: 0,
      isOnline: true,
      hasPermanentFailure: false,
    });
    assert.equal(status.state, 'SYNCED');
  });

  test('sin conexion con pendientes: lo dice y cuenta cuantos', () => {
    const status = deriveSaveStatus({
      pendingCount: 4,
      inFlightCount: 0,
      isOnline: false,
      hasPermanentFailure: false,
    });
    assert.equal(status.state, 'OFFLINE');
    assert.match(status.label, /4 por enviar/);
    assert.match(status.ariaLabel, /guardados en el movil/);
  });

  test('un error permanente gana a cualquier otro estado', () => {
    const status = deriveSaveStatus({
      pendingCount: 3,
      inFlightCount: 1,
      isOnline: false,
      hasPermanentFailure: true,
    });
    assert.equal(status.state, 'ERROR');
    assert.match(status.ariaLabel, /guardados en el movil/);
  });

  test('enviando gana a pendiente', () => {
    const status = deriveSaveStatus({
      pendingCount: 2,
      inFlightCount: 1,
      isOnline: true,
      hasPermanentFailure: false,
    });
    assert.equal(status.state, 'SAVING');
  });

  test('todos los estados tienen etiqueta accesible', () => {
    const combos = [
      { pendingCount: 0, inFlightCount: 0, isOnline: true, hasPermanentFailure: false },
      { pendingCount: 1, inFlightCount: 0, isOnline: true, hasPermanentFailure: false },
      { pendingCount: 0, inFlightCount: 0, isOnline: false, hasPermanentFailure: false },
      { pendingCount: 0, inFlightCount: 1, isOnline: true, hasPermanentFailure: false },
      { pendingCount: 0, inFlightCount: 0, isOnline: true, hasPermanentFailure: true },
    ];
    for (const combo of combos) {
      const status = deriveSaveStatus(combo);
      assert.ok(status.ariaLabel.length > 0);
      assert.ok(status.label.length > 0);
    }
  });
});

describe('finalizar la tarjeta', () => {
  test('no se puede finalizar con hoyos vacios y dice cuales', () => {
    const played: Record<number, number> = {};
    for (let h = 1; h <= 16; h += 1) played[h] = 5;
    const check = checkCanFinish(buildResults(played));
    assert.equal(check.canFinish, false);
    assert.deepEqual(check.missingHoles, [17, 18]);
    assert.match(check.message ?? '', /17, 18/);
  });

  test('un solo hoyo que falta se avisa en singular', () => {
    const played: Record<number, number> = {};
    for (let h = 1; h <= 18; h += 1) if (h !== 12) played[h] = 5;
    const check = checkCanFinish(buildResults(played));
    assert.match(check.message ?? '', /Falta el hoyo 12/);
  });

  test('18 rayas es una tarjeta finalizable', () => {
    const played: Record<number, 'RAYA'> = {};
    for (let h = 1; h <= 18; h += 1) played[h] = 'RAYA';
    assert.equal(checkCanFinish(buildResults(played)).canFinish, true);
  });
});

describe('visibilidad de tarjetas', () => {
  const jugador: Viewer = { competitionPlayerId: 'p1', role: 'PLAYER', flightId: 'f1' };
  const companero: TargetCard = { competitionPlayerId: 'p2', flightId: 'f1', status: 'IN_PLAY' };
  const otroPartido: TargetCard = { competitionPlayerId: 'p9', flightId: 'f3', status: 'IN_PLAY' };
  const propia: TargetCard = { competitionPlayerId: 'p1', flightId: 'f1', status: 'IN_PLAY' };

  test('la tarjeta propia es de lectura y escritura', () => {
    assert.equal(cardAccess(jugador, propia, 'HIDDEN').access, 'READ_WRITE');
  });

  test('la tarjeta propia bloqueada pasa a solo lectura', () => {
    assert.equal(cardAccess(jugador, { ...propia, status: 'LOCKED' }, 'HIDDEN').access, 'READ');
  });

  test('las del mismo partido son de solo lectura', () => {
    assert.equal(cardAccess(jugador, companero, 'HIDDEN').access, 'READ');
  });

  test('las de otro partido no se ven antes de publicar', () => {
    assert.equal(cardAccess(jugador, otroPartido, 'HIDDEN').access, 'NONE');
    assert.equal(cardAccess(jugador, otroPartido, 'REVEALING').access, 'NONE');
  });

  test('al publicar se ven todas, en solo lectura', () => {
    assert.equal(cardAccess(jugador, otroPartido, 'PUBLISHED').access, 'READ');
    assert.equal(cardAccess(jugador, companero, 'PUBLISHED').access, 'READ');
  });

  test('el administrador ve y escribe todo', () => {
    const admin: Viewer = { competitionPlayerId: 'p0', role: 'ADMIN', flightId: null };
    assert.equal(cardAccess(admin, otroPartido, 'HIDDEN').access, 'READ_WRITE');
  });

  test('un jugador sin partido no ve las de nadie mas', () => {
    const sinPartido: Viewer = { competitionPlayerId: 'p1', role: 'PLAYER', flightId: null };
    assert.equal(cardAccess(sinPartido, companero, 'HIDDEN').access, 'NONE');
  });

  test('los puntos provisionales de otros solo los ve el admin antes de publicar', () => {
    const admin: Viewer = { competitionPlayerId: 'p0', role: 'ADMIN', flightId: null };
    assert.equal(canSeeProvisionalPoints(jugador, companero, 'HIDDEN'), false);
    assert.equal(canSeeProvisionalPoints(jugador, propia, 'HIDDEN'), true);
    assert.equal(canSeeProvisionalPoints(admin, companero, 'HIDDEN'), true);
    assert.equal(canSeeProvisionalPoints(jugador, companero, 'PUBLISHED'), true);
  });
});

describe('revision de tarjetas', () => {
  const jugador: Viewer = { competitionPlayerId: 'p1', role: 'PLAYER', flightId: 'f1' };

  test('nadie valida su propia tarjeta', () => {
    const result = canReviewCard(jugador, {
      competitionPlayerId: 'p1',
      flightId: 'f1',
      status: 'FINISHED',
    });
    assert.equal(result.canReview, false);
    assert.match(result.reason ?? '', /tu propia tarjeta/);
  });

  test('un companero de partido puede revisar una tarjeta finalizada', () => {
    const result = canReviewCard(jugador, {
      competitionPlayerId: 'p2',
      flightId: 'f1',
      status: 'FINISHED',
    });
    assert.equal(result.canReview, true);
  });

  test('no se puede revisar una tarjeta a medias', () => {
    const result = canReviewCard(jugador, {
      competitionPlayerId: 'p2',
      flightId: 'f1',
      status: 'IN_PLAY',
    });
    assert.equal(result.canReview, false);
  });

  test('un jugador de otro partido no revisa', () => {
    const result = canReviewCard(jugador, {
      competitionPlayerId: 'p9',
      flightId: 'f3',
      status: 'FINISHED',
    });
    assert.equal(result.canReview, false);
    assert.match(result.reason ?? '', /mismo partido/);
  });

  test('el admin revisa cualquiera menos la suya', () => {
    const admin: Viewer = { competitionPlayerId: 'p0', role: 'ADMIN', flightId: null };
    assert.equal(
      canReviewCard(admin, { competitionPlayerId: 'p9', flightId: 'f3', status: 'FINISHED' })
        .canReview,
      true,
    );
    assert.equal(
      canReviewCard(admin, { competitionPlayerId: 'p0', flightId: null, status: 'FINISHED' })
        .canReview,
      false,
    );
  });
});

describe('estado de la revision frente a la version de la tarjeta', () => {
  const review = (version: number, status: ReviewRecord['status'] = 'OK'): ReviewRecord => ({
    reviewerId: 'p2',
    scorecardVersion: version,
    status,
    createdAt: new Date(2026, 8, 17, 12, version),
  });

  test('sin revision: no se puede bloquear', () => {
    const state = evaluateReview([], 5);
    assert.equal(state.hasValidReview, false);
    assert.equal(state.blocksLocking, true);
  });

  test('revision al dia: se puede bloquear', () => {
    const state = evaluateReview([review(5)], 5);
    assert.equal(state.hasValidReview, true);
    assert.equal(state.blocksLocking, false);
    assert.equal(state.message, null);
  });

  test('la tarjeta cambio tras revisarse: revision desactualizada', () => {
    const state = evaluateReview([review(5)], 7);
    assert.equal(state.isOutdated, true);
    assert.equal(state.hasValidReview, false);
    assert.equal(state.blocksLocking, true);
    assert.match(state.message ?? '', /revision nueva/);
  });

  test('una objecion bloquea el bloqueo aunque la version cuadre', () => {
    const state = evaluateReview([review(5, 'OBJECTED')], 5);
    assert.equal(state.hasValidReview, false);
    assert.match(state.message ?? '', /objecion/);
  });

  test('vale la revision mas reciente, no la primera', () => {
    const state = evaluateReview([review(3), review(7)], 7);
    assert.equal(state.hasValidReview, true);
  });
});
