import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DRAW_SEED_MAX_LENGTH, normalizeDrawSeed } from '../draw-seed';

describe('semillas de sorteo', () => {
  test('normaliza los espacios exteriores sin alterar el contenido', () => {
    assert.equal(normalizeDrawSeed('  ulzama-2026  '), 'ulzama-2026');
    assert.equal(normalizeDrawSeed(undefined), '');
  });

  test('admite exactamente el limite documentado', () => {
    const seed = 'a'.repeat(DRAW_SEED_MAX_LENGTH);
    assert.equal(normalizeDrawSeed(seed), seed);
  });

  test('rechaza semillas demasiado largas o de varias lineas', () => {
    assert.throws(
      () => normalizeDrawSeed('a'.repeat(DRAW_SEED_MAX_LENGTH + 1)),
      /no puede superar/,
    );
    assert.throws(() => normalizeDrawSeed('una\ndos'), /una sola linea/);
  });
});
