import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { allocateStrokes, strokesReceivedOnHole, totalAllocatedStrokes } from '../strokes';
import {
  computeTotals,
  deriveStatus,
  canFinish,
  grossCategory,
  isUnusualResult,
  resolveHole,
  resolveScorecard,
  stablefordPoints,
} from '../stableford';
import { buildRanking, revealOrder, rankingFingerprint } from '../ranking';
import { ULZAMA_HOLES } from '../course';
import type { HoleScoreInput } from '../stableford';
import type { RankingInput } from '../types';

describe('reparto de golpes (seccion 29)', () => {
  test('hándicap 10: un golpe en SI 1-10 y nada mas', () => {
    for (let si = 1; si <= 18; si += 1) {
      assert.equal(strokesReceivedOnHole(10, si), si <= 10 ? 1 : 0);
    }
  });

  test('hándicap 18: un golpe en todos los hoyos', () => {
    for (let si = 1; si <= 18; si += 1) {
      assert.equal(strokesReceivedOnHole(18, si), 1);
    }
  });

  test('hándicap 20: uno en todos, dos en SI 1 y 2', () => {
    assert.equal(strokesReceivedOnHole(20, 1), 2);
    assert.equal(strokesReceivedOnHole(20, 2), 2);
    assert.equal(strokesReceivedOnHole(20, 3), 1);
    assert.equal(strokesReceivedOnHole(20, 18), 1);
  });

  test('hándicap 36: dos golpes en todos', () => {
    for (let si = 1; si <= 18; si += 1) {
      assert.equal(strokesReceivedOnHole(36, si), 2);
    }
  });

  test('hándicap 0: ningun golpe', () => {
    for (let si = 1; si <= 18; si += 1) {
      assert.equal(strokesReceivedOnHole(0, si), 0);
    }
  });

  test('plus 2: devuelve un golpe en SI 18 y 17', () => {
    assert.equal(strokesReceivedOnHole(-2, 18), -1);
    assert.equal(strokesReceivedOnHole(-2, 17), -1);
    assert.equal(strokesReceivedOnHole(-2, 16), 0);
    assert.equal(strokesReceivedOnHole(-2, 1), 0);
  });

  test('invariante: el reparto suma exactamente el hándicap de juego', () => {
    for (let hj = -20; hj <= 60; hj += 1) {
      const allocation = allocateStrokes(hj, ULZAMA_HOLES);
      assert.equal(totalAllocatedStrokes(allocation), hj, `falla con HJ=${hj}`);
    }
  });

  test('rechaza stroke index invalido', () => {
    assert.throws(() => strokesReceivedOnHole(10, 0));
    assert.throws(() => strokesReceivedOnHole(10, 19));
    assert.throws(() => strokesReceivedOnHole(10.5, 5));
  });
});

describe('puntos Stableford (seccion 31)', () => {
  test('escala completa', () => {
    assert.equal(stablefordPoints(0), 2); // par neto
    assert.equal(stablefordPoints(-1), 3); // birdie neto
    assert.equal(stablefordPoints(-2), 4); // eagle neto
    assert.equal(stablefordPoints(-3), 5); // albatros neto
    assert.equal(stablefordPoints(1), 1); // bogey neto
    assert.equal(stablefordPoints(2), 0); // doble bogey neto
    assert.equal(stablefordPoints(7), 0);
  });

  test('tope de 5 puntos en esta edicion', () => {
    assert.equal(stablefordPoints(-4), 5);
    assert.equal(stablefordPoints(-10), 5);
  });
});

describe('resultado bruto (secciones 32-33)', () => {
  test('la categoria del bruto NO depende de los golpes recibidos', () => {
    const hole = ULZAMA_HOLES[0]; // hoyo 1, par 4, SI 5
    const sinGolpe = resolveHole(hole, 0, { holeNumber: 1, grossStrokes: 3, isPickup: false });
    const conGolpe = resolveHole(hole, 1, { holeNumber: 1, grossStrokes: 3, isPickup: false });
    assert.equal(sinGolpe.grossCategory, 'BIRDIE');
    assert.equal(conGolpe.grossCategory, 'BIRDIE');
    assert.equal(sinGolpe.stablefordPoints, 3);
    assert.equal(conGolpe.stablefordPoints, 4);
  });

  test('el hoyo en uno tiene prioridad sobre albatros', () => {
    assert.equal(grossCategory(1, 4), 'HOLE_IN_ONE');
    assert.equal(grossCategory(1, 3), 'HOLE_IN_ONE');
    assert.equal(grossCategory(2, 5), 'ALBATROS');
  });

  test('la raya siempre vale 0 puntos, con cualquier reparto', () => {
    const result = resolveHole(ULZAMA_HOLES[4], 2, {
      holeNumber: 5,
      grossStrokes: null,
      isPickup: true,
    });
    assert.equal(result.stablefordPoints, 0);
    assert.equal(result.grossCategory, 'PICKUP');
    assert.equal(result.netStrokes, null);
    assert.equal(result.grossToPar, null);
  });

  test('distingue hoyo sin jugar de raya', () => {
    const sinJugar = resolveHole(ULZAMA_HOLES[0], 1, undefined);
    assert.equal(sinJugar.isPickup, false);
    assert.equal(sinJugar.grossStrokes, null);
  });

  test('marca resultados poco habituales sin bloquearlos', () => {
    const hio = resolveHole(ULZAMA_HOLES[1], 0, { holeNumber: 2, grossStrokes: 1, isPickup: false });
    assert.equal(isUnusualResult(hio), true);
    assert.equal(hio.stablefordPoints, 4); // par 3, 1 golpe, sin recibir: -2 -> 4 puntos
    const normal = resolveHole(ULZAMA_HOLES[1], 0, {
      holeNumber: 2,
      grossStrokes: 3,
      isPickup: false,
    });
    assert.equal(isUnusualResult(normal), false);
  });
});

describe('totales de la tarjeta (seccion 37)', () => {
  const strokesFor = (hj: number) =>
    new Map(allocateStrokes(hj, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]));

  test('vuelta completa jugando al par exacto: 18 pares brutos', () => {
    const inputs = new Map<number, HoleScoreInput>(
      ULZAMA_HOLES.map((h) => [h.holeNumber, { holeNumber: h.holeNumber, grossStrokes: h.par, isPickup: false }]),
    );
    const results = resolveScorecard(ULZAMA_HOLES, strokesFor(0), inputs);
    const totals = computeTotals(results);

    assert.equal(totals.total.numericStrokes, 72);
    assert.equal(totals.out.numericStrokes, 36);
    assert.equal(totals.in.numericStrokes, 36);
    // Sin hoyos imputados, ajustado y numerico coinciden.
    assert.equal(totals.total.adjustedStrokes, 72);
    assert.equal(totals.total.imputedHoles, 0);
    assert.equal(totals.total.points, 36);
    assert.equal(totals.total.grossToPar, 0);
    assert.equal(totals.total.isGrossComplete, true);
    assert.equal(totals.total.holesPlayed, 18);
  });

  test('un jugador de 20,7 (HJ 25) que hace bogey en todos suma 36 puntos', () => {
    // HJ 25 = 1 golpe en todos + 1 extra en SI 1-7.
    const inputs = new Map<number, HoleScoreInput>(
      ULZAMA_HOLES.map((h) => [
        h.holeNumber,
        { holeNumber: h.holeNumber, grossStrokes: h.par + 1, isPickup: false },
      ]),
    );
    const results = resolveScorecard(ULZAMA_HOLES, strokesFor(25), inputs);
    const totals = computeTotals(results);
    assert.equal(totals.total.numericStrokes, 90);
    // 11 hoyos con 1 golpe -> par neto (2 pts). 7 hoyos con 2 golpes -> birdie neto (3 pts).
    assert.equal(totals.total.points, 11 * 2 + 7 * 3);
  });

  test('con rayas el bruto total no es comparable', () => {
    const inputs = new Map<number, HoleScoreInput>(
      ULZAMA_HOLES.map((h) => [
        h.holeNumber,
        h.holeNumber === 7
          ? { holeNumber: 7, grossStrokes: null, isPickup: true }
          : { holeNumber: h.holeNumber, grossStrokes: h.par, isPickup: false },
      ]),
    );
    const results = resolveScorecard(ULZAMA_HOLES, strokesFor(0), inputs);
    const totals = computeTotals(results);

    assert.equal(totals.total.pickups, 1);
    assert.equal(totals.total.grossToPar, null, 'no debe publicar un bruto falso');
    assert.equal(totals.total.isGrossComplete, false);
    assert.equal(totals.total.numericStrokes, 68); // 72 - par del hoyo 7 (4)
    assert.equal(totals.total.holesPlayed, 18);
    // Hoyo 7: par 4, sin golpes recibidos (HJ 0) -> doble bogey neto = 6.
    assert.equal(totals.total.adjustedStrokes, 74);
    assert.equal(totals.total.imputedHoles, 1);
  });
});

describe('estados de la tarjeta (seccion 38)', () => {
  const emptyInputs = new Map<number, HoleScoreInput>();
  const strokes = new Map<number, number>();

  test('sin resultados: NOT_STARTED', () => {
    const results = resolveScorecard(ULZAMA_HOLES, strokes, emptyInputs);
    assert.equal(deriveStatus(results, false, false, false), 'NOT_STARTED');
  });

  test('parcial: IN_PLAY y no se puede finalizar', () => {
    const inputs = new Map<number, HoleScoreInput>([
      [1, { holeNumber: 1, grossStrokes: 5, isPickup: false }],
    ]);
    const results = resolveScorecard(ULZAMA_HOLES, strokes, inputs);
    assert.equal(deriveStatus(results, false, false, false), 'IN_PLAY');
    const check = canFinish(results);
    assert.equal(check.ok, false);
    assert.equal(check.missingHoles.length, 17);
  });

  test('18 resultados sin confirmacion del jugador siguen siendo IN_PLAY', () => {
    const inputs = new Map<number, HoleScoreInput>(
      ULZAMA_HOLES.map((h) => [h.holeNumber, { holeNumber: h.holeNumber, grossStrokes: h.par, isPickup: false }]),
    );
    const results = resolveScorecard(ULZAMA_HOLES, strokes, inputs);
    assert.equal(deriveStatus(results, false, false, false), 'IN_PLAY');
    assert.equal(deriveStatus(results, true, false, false), 'FINISHED');
    assert.equal(deriveStatus(results, true, true, false), 'REVIEWED');
    assert.equal(deriveStatus(results, true, true, true), 'LOCKED');
  });

  test('la raya cuenta como resultado valido para finalizar', () => {
    const inputs = new Map<number, HoleScoreInput>(
      ULZAMA_HOLES.map((h) => [h.holeNumber, { holeNumber: h.holeNumber, grossStrokes: null, isPickup: true }]),
    );
    const results = resolveScorecard(ULZAMA_HOLES, strokes, inputs);
    assert.equal(canFinish(results).ok, true);
    assert.equal(deriveStatus(results, true, false, false), 'FINISHED');
  });
});

describe('clasificacion (seccion 46)', () => {
  const player = (
    id: string,
    name: string,
    points: number,
    hcpTenths: number,
    strokes: number,
    pickups = 0,
    adjusted?: number,
  ): RankingInput => ({
    competitionPlayerId: id,
    displayName: name,
    color: '#cfe8d8',
    handicapIndexTenths: hcpTenths,
    playingHandicap: 20,
    points,
    numericStrokes: strokes,
    adjustedStrokes: adjusted ?? strokes,
    pickups,
    holesCompleted: 18,
    scorecardStatus: 'FINISHED',
  });

  test('ordena por puntos y luego por hándicap exacto', () => {
    const ranking = buildRanking([
      player('a', 'Alex', 34, 180, 92),
      player('b', 'Beltran', 38, 250, 95),
      player('c', 'Carlos', 34, 175, 94),
    ]);
    assert.deepEqual(ranking.map((r) => r.competitionPlayerId), ['b', 'c', 'a']);
    assert.equal(ranking[1].resolvedBy, 'POINTS');
    assert.equal(ranking[2].resolvedBy, 'HANDICAP_INDEX');
  });

  test('usa todos los decimales del hándicap: 18,4 gana a 18,5', () => {
    const ranking = buildRanking([
      player('alto', 'Uno', 36, 185, 90),
      player('bajo', 'Dos', 36, 184, 90),
    ]);
    assert.equal(ranking[0].competitionPlayerId, 'bajo');
  });

  test('tercer criterio: menor suma de golpes ajustada', () => {
    const ranking = buildRanking([
      player('x', 'Xabi', 36, 200, 91),
      player('y', 'Yago', 36, 200, 88),
    ]);
    assert.equal(ranking[0].competitionPlayerId, 'y');
    assert.equal(ranking[1].resolvedBy, 'ADJUSTED_STROKES');
  });

  test('levantar la bola ya NO da ventaja en el desempate', () => {
    // El caso que el criterio antiguo resolvia mal: la tarjeta con tres rayas
    // tenia 88 golpes escritos frente a 95 de la tarjeta limpia, y ganaba. Con
    // las rayas imputadas a doble bogey neto, 88 se convierte en 109 y pierde.
    const ranking = buildRanking([
      player('limpia', 'Uno', 36, 200, 95, 0, 95),
      player('conrayas', 'Dos', 36, 200, 88, 3, 109),
    ]);
    assert.equal(ranking[0].competitionPlayerId, 'limpia', 'debe ganar quien termino los hoyos');
    assert.equal(ranking[1].resolvedBy, 'ADJUSTED_STROKES');
  });

  test('la nota explica sobre que base se resolvio el desempate', () => {
    const ranking = buildRanking([
      player('limpia', 'Uno', 36, 200, 95, 0, 95),
      player('conrayas', 'Dos', 36, 200, 88, 3, 109),
    ]);
    assert.match(ranking[1].tieBreakNote ?? '', /doble bogey neto/);
  });

  test('sin rayas por medio no se emite nota: no hay nada que explicar', () => {
    const ranking = buildRanking([
      player('x', 'Xabi', 36, 200, 91),
      player('y', 'Yago', 36, 200, 88),
    ]);
    assert.equal(ranking[1].tieBreakNote, null);
  });

  test('empate total: posicion compartida, sin desempate inventado', () => {
    const ranking = buildRanking([
      player('uno', 'Zacarias', 36, 200, 90),
      player('dos', 'Ana', 36, 200, 90),
      player('tres', 'Mikel', 30, 200, 95),
    ]);
    assert.equal(ranking[0].position, 1);
    assert.equal(ranking[1].position, 1);
    assert.equal(ranking[2].position, 3, 'ranking de competicion: 1, 1, 3');
    assert.equal(ranking[0].isSharedPosition, true);
    assert.equal(ranking[1].isSharedPosition, true);
    assert.equal(ranking[2].isSharedPosition, false);
    // Alfabetico solo para presentar.
    assert.equal(ranking[0].displayName, 'Ana');
    assert.equal(ranking[1].resolvedBy, 'TIE');
  });

  test('la barra de progreso es relativa al lider y no altera el orden', () => {
    const ranking = buildRanking([
      player('a', 'A', 40, 200, 90),
      player('b', 'B', 20, 210, 95),
    ]);
    assert.equal(ranking[0].progressPercent, 100);
    assert.equal(ranking[1].progressPercent, 50);
  });

  test('orden de revelacion: ultima, penultima, resto, tercera, segunda, primera', () => {
    const ranking = buildRanking([
      player('p1', 'Uno', 40, 100, 80),
      player('p2', 'Dos', 38, 110, 82),
      player('p3', 'Tres', 36, 120, 84),
      player('p4', 'Cuatro', 34, 130, 86),
      player('p5', 'Cinco', 32, 140, 88),
    ]);
    const order = revealOrder(ranking);
    const positions = order.map((group) => ranking[group[0]].position);
    assert.deepEqual(positions, [5, 4, 3, 2, 1]);
  });

  test('las posiciones compartidas se revelan en el mismo paso', () => {
    const ranking = buildRanking([
      player('a', 'A', 36, 200, 90),
      player('b', 'B', 36, 200, 90),
      player('c', 'C', 20, 210, 95),
    ]);
    const order = revealOrder(ranking);
    assert.equal(order.length, 2);
    assert.equal(order[0].length, 1); // posicion 3
    assert.equal(order[1].length, 2); // posicion 1 compartida
  });

  test('el fingerprint cambia si cambia un resultado (invalida el snapshot)', () => {
    const base = [player('a', 'A', 36, 200, 90), player('b', 'B', 30, 210, 95)];
    const before = rankingFingerprint(buildRanking(base));
    const after = rankingFingerprint(
      buildRanking([player('a', 'A', 37, 200, 90), player('b', 'B', 30, 210, 95)]),
    );
    assert.notEqual(before, after);
    assert.equal(before, rankingFingerprint(buildRanking(base)), 'debe ser determinista');
  });

  test('clasificacion vacia no rompe', () => {
    assert.deepEqual(buildRanking([]), []);
    assert.deepEqual(revealOrder([]), []);
  });
});
