import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  drawPairs,
  validatePairDraw,
  worstPairHandicapPlayerIds,
  type PairDrawPlayer,
} from '../pair-draw';

function roster(count = 13): PairDrawPlayer[] {
  const distribution = count === 13 ? [4, 3, 3, 3] : [3, 3, 3, 3];
  const players: PairDrawPlayer[] = [];
  let cursor = 0;
  distribution.forEach((size, flightIndex) => {
    for (let position = 0; position < size; position += 1) {
      const index = cursor++;
      players.push({
        competitionPlayerId: `p${index + 1}`,
        displayName: `Jugador ${index + 1}`,
        isActive: true,
        handicapIndexTenths: 40 + index * 22,
        flightId: `f${flightIndex + 1}`,
        flightOrder: flightIndex + 1,
      });
    }
  });
  return players;
}

describe('sorteo de parejas sobre partidos confirmados', () => {
  test('la misma semilla reproduce exactamente el sorteo', () => {
    const players = roster();
    assert.deepEqual(
      drawPairs({ players, seed: 'parejas-2026' }),
      drawPairs({ players, seed: 'parejas-2026' }),
    );
  });

  test('asigna a todos una vez, siempre entre partidos distintos', () => {
    const players = roster(12);
    const proposal = drawPairs({ players, seed: 'doce' });
    assert.deepEqual(validatePairDraw(proposal, players), []);
    assert.equal(proposal.pairs.length, 6);
    assert.equal(proposal.soloPlayerId, null);

    const byId = new Map(players.map((player) => [player.competitionPlayerId, player]));
    const assigned = proposal.pairs.flatMap((pair) => pair.memberIds);
    assert.equal(assigned.length, players.length);
    assert.equal(new Set(assigned).size, players.length);
    for (const pair of proposal.pairs) {
      assert.equal(pair.memberIds.length, 2);
      assert.notEqual(byId.get(pair.memberIds[0])?.flightId, byId.get(pair.memberIds[1])?.flightId);
    }
  });

  test('los cuatro HCP mas altos nunca forman pareja entre ellos', () => {
    const players = roster(12);
    const worst = worstPairHandicapPlayerIds(players);
    const proposal = drawPairs({ players, seed: 'separar-peores' });
    for (const pair of proposal.pairs) {
      assert.ok(pair.memberIds.filter((id) => worst.has(id)).length <= 1);
    }
  });

  test('con numero impar elige un individual, lo integra en el equilibrio y varia con la semilla', () => {
    const players = roster(13);
    const soloIds = new Set<string>();
    for (let index = 0; index < 18; index += 1) {
      const proposal = drawPairs({ players, seed: `impar-${index}` });
      assert.deepEqual(validatePairDraw(proposal, players), []);
      assert.ok(proposal.soloPlayerId);
      soloIds.add(proposal.soloPlayerId as string);
      const solo = proposal.pairs.find((pair) => pair.isSolo);
      assert.ok(solo);
      assert.deepEqual(solo.memberIds, [proposal.soloPlayerId]);
      assert.equal(solo.equivalentHandicapTenths % 2, 0);
    }
    assert.ok(soloIds.size >= 2, `solo se eligio a ${[...soloIds].join(', ')}`);
  });

  test('semillas distintas pueden producir parejas distintas sin perder equilibrio', () => {
    const players = roster(12);
    const signatures = new Set<string>();
    for (let index = 0; index < 10; index += 1) {
      const proposal = drawPairs({ players, seed: `variacion-${index}` });
      assert.ok(
        proposal.metrics.handicapRangeTenths <= 44,
        `rango de HCP de equipo demasiado alto: ${proposal.metrics.handicapRangeTenths}`,
      );
      assert.ok(
        proposal.metrics.complementPenalty <= 2,
        `emparejamiento poco complementario: ${proposal.metrics.complementPenalty}`,
      );
      signatures.add(
        proposal.pairs
          .map((pair) => [...pair.memberIds].sort().join(':'))
          .sort()
          .join('|'),
      );
    }
    assert.ok(signatures.size > 1);
  });
});
