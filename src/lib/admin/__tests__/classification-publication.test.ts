import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildClassificationPublicationTransition } from '../classification-publication';

describe('interruptor de publicacion de la clasificacion', () => {
  test('oficial publica todas las posiciones de una sola vez', () => {
    const now = new Date('2026-10-31T18:00:00.000Z');
    const transition = buildClassificationPublicationTransition({
      official: true,
      totalGroups: 11,
      actorId: 'admin-1',
      now,
    });

    assert.equal(transition.classificationStatus, 'PUBLISHED');
    assert.equal(transition.reveal.status, 'PUBLISHED');
    assert.equal(transition.reveal.revealedCount, 11);
    assert.equal(transition.reveal.currentIndex, 11);
    assert.equal(transition.reveal.isPaused, false);
    assert.equal(transition.reveal.publishedAt, now);
    assert.equal(transition.auditAction, 'CLASSIFICATION_PUBLISHED');
  });

  test('provisional vuelve a ocultarla para los jugadores y reinicia la revelacion', () => {
    const transition = buildClassificationPublicationTransition({
      official: false,
      totalGroups: 11,
      actorId: 'admin-1',
    });

    assert.equal(transition.classificationStatus, 'HIDDEN');
    assert.equal(transition.reveal.status, 'HIDDEN');
    assert.equal(transition.reveal.revealedCount, 0);
    assert.equal(transition.reveal.currentIndex, 0);
    assert.equal(transition.reveal.publishedAt, null);
    assert.equal(transition.reveal.snapshotId, null);
    assert.equal(transition.auditAction, 'CLASSIFICATION_RETURNED_TO_PROVISIONAL');
  });

  test('no permite publicar una clasificacion vacia', () => {
    assert.throws(
      () =>
        buildClassificationPublicationTransition({
          official: true,
          totalGroups: 0,
          actorId: 'admin-1',
        }),
      /No hay ninguna posicion/,
    );
  });
});
