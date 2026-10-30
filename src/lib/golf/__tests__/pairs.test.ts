import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPairRanking, buildPairScore, type PairMemberScore } from '../pairs';
import { computeTotals } from '../stableford';
import type { HoleResult } from '../types';

function result(holeNumber: number, points: number, gross: number | null, strokesReceived = 0): HoleResult {
  const par = 4;
  const isPickup = gross === null && points === 0;
  return {
    holeNumber,
    par,
    strokeIndex: holeNumber,
    strokesReceived,
    grossStrokes: gross,
    isPickup,
    netStrokes: gross === null ? null : gross - strokesReceived,
    grossToPar: gross === null ? null : gross - par,
    netToPar: gross === null ? null : gross - strokesReceived - par,
    stablefordPoints: points,
    grossCategory: gross === null ? 'PICKUP' : gross === 4 ? 'PAR' : 'BOGEY',
  };
}

function member(id: string, name: string, points: number[], gross: number[]): PairMemberScore {
  const results = Array.from({ length: 18 }, (_, index) =>
    result(index + 1, points[index] ?? 0, gross[index] ?? 5, index === 0 && id === 'b' ? 1 : 0),
  );
  return {
    competitionPlayerId: id,
    displayName: name,
    color: id === 'a' ? '#111111' : '#222222',
    handicapIndexTenths: id === 'a' ? 100 : 200,
    playingHandicap: id === 'a' ? 9 : 18,
    status: 'IN_PLAY',
    pairSoloMultiplier: false,
    results,
    totals: computeTotals(results),
  };
}

describe('parejas mejor bola', () => {
  test('elige por puntos Stableford y conserva los golpes recibidos del resultado elegido', () => {
    const first = member('a', 'Ana Uno', [2], [4]);
    const second = member('b', 'Berta Dos', [3], [4]);
    const pair = buildPairScore(1, [first, second], 'BEST_BALL');

    assert.equal(pair.results?.[0].stablefordPoints, 3);
    assert.equal(pair.results?.[0].strokesReceived, 1);
    assert.equal(pair.sources[0].competitionPlayerId, 'b');
    assert.equal(pair.points, pair.totals?.total.points);
    assert.equal(pair.holesAvailable, 18);
  });

  test('en igualdad de puntos representa el menor resultado neto', () => {
    const first = member('a', 'Ana Uno', [2], [5]);
    const second = member('b', 'Berta Dos', [2], [5]);
    const pair = buildPairScore(1, [first, second], 'BEST_BALL');

    // Berta recibe un golpe en el hoyo 1: 5 brutos son 4 netos frente a 5.
    assert.equal(pair.sources[0].competitionPlayerId, 'b');
  });
});

describe('parejas por suma', () => {
  test('suma puntos y hoyos de las dos tarjetas sin fabricar una tercera', () => {
    const first = member('a', 'Ana Uno', Array(18).fill(2), Array(18).fill(4));
    const second = member('b', 'Berta Dos', Array(18).fill(3), Array(18).fill(4));
    const pair = buildPairScore(2, [first, second], 'COMBINED_POINTS');

    assert.equal(pair.points, 90);
    assert.equal(pair.holesCompleted, 36);
    assert.equal(pair.holesAvailable, 36);
    assert.equal(pair.results, null);
    assert.equal(pair.totals, null);
  });
});

describe('participante individual por numero impar', () => {
  test('duplica los puntos y genera una unica tarjeta derivada en cualquier modalidad', () => {
    const solo = member('a', 'Ana Uno', Array(18).fill(2), Array(18).fill(4));
    solo.pairSoloMultiplier = true;

    for (const mode of ['BEST_BALL', 'COMBINED_POINTS'] as const) {
      const team = buildPairScore(4, [solo], mode);
      assert.equal(team.isSolo, true);
      assert.equal(team.points, 72);
      assert.equal(team.results?.[0].stablefordPoints, 4);
      assert.equal(team.totals?.total.points, 72);
      assert.equal(team.holesCompleted, 18);
      assert.equal(team.holesAvailable, 18);
      assert.equal(team.handicapIndexTenths, 200);
      assert.equal(team.playingHandicap, 18);
      assert.equal(team.isEligible, true);
    }
  });
});

describe('clasificacion de parejas', () => {
  test('ordena por puntos, suma de hándicap exacto y golpes ajustados', () => {
    const a = buildPairScore(1, [member('a', 'Ana Uno', Array(18).fill(2), Array(18).fill(4)), member('b', 'Berta Dos', Array(18).fill(2), Array(18).fill(4))], 'COMBINED_POINTS');
    const c = member('c', 'Carla Tres', Array(18).fill(2), Array(18).fill(4));
    c.handicapIndexTenths = 50;
    const d = member('d', 'Diana Cuatro', Array(18).fill(2), Array(18).fill(4));
    d.handicapIndexTenths = 60;
    const b = buildPairScore(2, [c, d], 'COMBINED_POINTS');

    const ranking = buildPairRanking([a, b]);
    assert.equal(ranking[0].pairNumber, 2);
    assert.equal(ranking[0].position, 1);
    assert.equal(ranking[1].position, 2);
  });
});
