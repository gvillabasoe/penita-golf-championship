import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildClassificationPublicationTransition } from '../classification-publication';

describe('interruptor de publicacion de la clasificacion', () => {
  test('oficial usa exclusivamente el estado PUBLISHED', () => {
    assert.deepEqual(buildClassificationPublicationTransition(true), {
      classificationStatus: 'PUBLISHED',
      auditAction: 'CLASSIFICATION_PUBLISHED',
    });
  });

  test('provisional usa exclusivamente el estado HIDDEN', () => {
    assert.deepEqual(buildClassificationPublicationTransition(false), {
      classificationStatus: 'HIDDEN',
      auditAction: 'CLASSIFICATION_RETURNED_TO_PROVISIONAL',
    });
  });

  test('la transicion solo contiene el estado y la auditoria', () => {
    const keys = Object.keys(buildClassificationPublicationTransition(true)).sort();
    assert.deepEqual(keys, ['auditAction', 'classificationStatus']);
  });
});


describe('accion de servidor del interruptor', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/actions/admin.ts'), 'utf8');
  const start = source.indexOf('export async function setClassificationOfficial');
  const end = source.indexOf('/**', start + 1);
  const action = source.slice(start, end === -1 ? undefined : end);

  test('solo usa Competition y AuditLog dentro de la transaccion', () => {
    assert.ok(start >= 0, 'no se encontro setClassificationOfficial');
    assert.match(action, /tx\.competition\.update/);
    assert.match(action, /classificationStatus: transition\.classificationStatus/);
    const accessors = [...action.matchAll(/tx\.(\w+)\./g)].map((match) => match[1]);
    assert.deepEqual([...new Set(accessors)].sort(), ['auditLog', 'competition']);
  });

  test('la peticion repetida es idempotente', () => {
    assert.match(action, /competition\.classificationStatus === transition\.classificationStatus/);
    assert.match(action, /return;/);
  });
});
