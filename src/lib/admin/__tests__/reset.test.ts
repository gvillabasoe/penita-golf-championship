/**
 * Vaciar los resultados de todas las tarjetas (secciones 3 y 30).
 *
 * Lo que se prueba aqui es la parte que se puede decidir sin base de datos:
 * autorizacion, confirmacion, alcance del recuento y auditoria. La escritura en
 * si vive en `clearAllScores`, que va en una transaccion y no se puede ejecutar
 * en este entorno porque no hay PostgreSQL. Lo que si se comprueba es que las
 * REGLAS que la gobiernan estan aqui, en funciones puras, y no sueltas dentro de
 * la accion.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  RESET_CARD_STATE,
  RESET_CLASSIFICATION_STATE,
  RESET_CONFIRMATION_WORD,
  RESET_FIRST_WARNING,
  RESET_IRREVERSIBLE_WARNING,
  RESET_SUCCESS_MESSAGE,
  authorizeReset,
  buildResetAudit,
  isResetConfirmed,
  previewReset,
  type ResetScopeCard,
} from '../reset';

const card = (overrides: Partial<ResetScopeCard> = {}): ResetScopeCard => ({
  competitionPlayerId: 'p1',
  scorecardId: 'sc1',
  displayName: 'Ana',
  status: 'IN_PLAY',
  holeScoreCount: 9,
  holesPlayed: 9,
  points: 18,
  isLocked: false,
  hasReview: false,
  ...overrides,
});

describe('solo el administrador puede vaciar', () => {
  test('un jugador no puede, aunque escriba la palabra correcta', () => {
    const result = authorizeReset({
      actorRole: 'PLAYER',
      confirmationText: RESET_CONFIRMATION_WORD,
      competitionStatus: 'IN_PLAY',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /administrador/);
  });

  test('el administrador si puede', () => {
    assert.equal(
      authorizeReset({
        actorRole: 'ADMIN',
        confirmationText: 'VACIAR',
        competitionStatus: 'IN_PLAY',
      }).ok,
      true,
    );
  });

  test('con el campeonato cerrado no se puede vaciar', () => {
    const result = authorizeReset({
      actorRole: 'ADMIN',
      confirmationText: 'VACIAR',
      competitionStatus: 'CLOSED',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /cerrado/);
  });
});

describe('la confirmacion escrita es obligatoria', () => {
  test('sin texto no se autoriza', () => {
    const result = authorizeReset({
      actorRole: 'ADMIN',
      confirmationText: '',
      competitionStatus: 'IN_PLAY',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /VACIAR/);
  });

  test('un texto parecido no vale', () => {
    for (const texto of ['vacia', 'VACIA', 'VACIARLO', 'BORRAR', 'si']) {
      assert.equal(isResetConfirmed(texto), false, texto);
    }
  });

  test('se admiten espacios alrededor y minusculas', () => {
    // El objetivo es que nadie vacie el campeonato con un toque accidental, no
    // montar un examen de mecanografia con un teclado movil.
    for (const texto of ['VACIAR', 'vaciar', ' Vaciar ', '  VACIAR']) {
      assert.equal(isResetConfirmed(texto), true, texto);
    }
  });
});

describe('recuento de lo que se destruye', () => {
  test('cuenta tarjetas, resultados, puntos, bloqueos y revisiones', () => {
    const preview = previewReset(
      [
        card({ competitionPlayerId: 'a', holeScoreCount: 18, holesPlayed: 18, points: 34 }),
        card({ competitionPlayerId: 'b', holeScoreCount: 9, holesPlayed: 8, points: 15, isLocked: true }),
        card({ competitionPlayerId: 'c', holeScoreCount: 0, holesPlayed: 0, points: 0, status: 'NOT_STARTED' }),
      ],
      'REVEALING',
    );

    assert.equal(preview.totalCards, 3);
    assert.equal(preview.affectedCards, 2, 'la tarjeta sin nada no se cuenta como afectada');
    assert.equal(preview.holeScores, 27);
    assert.equal(preview.playedHoles, 26);
    assert.equal(preview.points, 49);
    assert.equal(preview.lockedCards, 1);
    assert.equal(preview.classificationStatus, 'REVEALING');
    assert.equal(preview.isEmpty, false);
  });

  test('un hoyo vacio cuenta como registro pero no como jugado', () => {
    // Es la diferencia que hace que el aviso no exagere: "18 resultados" cuando
    // solo hay 17 apuntados y uno borrado seria falso.
    const preview = previewReset([card({ holeScoreCount: 18, holesPlayed: 17 })], 'HIDDEN');
    assert.equal(preview.holeScores, 18);
    assert.equal(preview.playedHoles, 17);
  });

  test('una tarjeta bloqueada sin resultados sigue siendo afectada', () => {
    // El vaciado le quita el bloqueo, asi que algo cambia y hay que contarla.
    const preview = previewReset(
      [card({ holeScoreCount: 0, holesPlayed: 0, points: 0, isLocked: true })],
      'HIDDEN',
    );
    assert.equal(preview.affectedCards, 1);
    assert.equal(preview.isEmpty, false);
  });

  test('una tarjeta con revision pero sin resultados tambien', () => {
    const preview = previewReset(
      [card({ holeScoreCount: 0, holesPlayed: 0, points: 0, hasReview: true })],
      'HIDDEN',
    );
    assert.equal(preview.affectedCards, 1);
    assert.equal(preview.reviewedCards, 1);
  });

  test('sin nada que vaciar se dice explicitamente', () => {
    const preview = previewReset(
      [card({ holeScoreCount: 0, holesPlayed: 0, points: 0, status: 'NOT_STARTED' })],
      'HIDDEN',
    );
    assert.equal(preview.isEmpty, true);
    assert.equal(preview.affectedCards, 0);
  });

  test('sin tarjetas no falla', () => {
    const preview = previewReset([], 'HIDDEN');
    assert.equal(preview.totalCards, 0);
    assert.equal(preview.isEmpty, true);
  });
});

describe('estado en el que quedan las tarjetas', () => {
  test('todo a cero y en Sin comenzar', () => {
    assert.equal(RESET_CARD_STATE.status, 'NOT_STARTED');
    assert.equal(RESET_CARD_STATE.holesCompleted, 0);
    assert.equal(RESET_CARD_STATE.pointsTotal, 0);
    assert.equal(RESET_CARD_STATE.numericStrokesTotal, 0);
    assert.equal(RESET_CARD_STATE.pickupCount, 0);
  });

  test('sin confirmacion de finalizacion, sin revision y sin bloqueo', () => {
    assert.equal(RESET_CARD_STATE.playerConfirmedFinish, false);
    assert.equal(RESET_CARD_STATE.reviewedAt, null);
    assert.equal(RESET_CARD_STATE.reviewedById, null);
    assert.equal(RESET_CARD_STATE.lockedAt, null);
  });

  test('la clasificacion vuelve al estado inicial coherente', () => {
    assert.equal(RESET_CLASSIFICATION_STATE.classificationStatus, 'HIDDEN');
    assert.equal(RESET_CLASSIFICATION_STATE.revealedCount, 0);
    assert.equal(RESET_CLASSIFICATION_STATE.snapshotId, null);
    assert.equal(RESET_CLASSIFICATION_STATE.publishedAt, null);
  });
});

describe('auditoria del vaciado', () => {
  const preview = previewReset(
    [card({ holeScoreCount: 18, holesPlayed: 18, points: 34, isLocked: true, hasReview: true })],
    'PUBLISHED',
  );

  test('registra el antes, el despues y las dos generaciones', () => {
    const audit = buildResetAudit(preview, 2);

    assert.equal(audit.action, 'SCORES_RESET');
    assert.equal(audit.before.holeScores, 18);
    assert.equal(audit.before.points, 34);
    assert.equal(audit.before.classificationStatus, 'PUBLISHED');
    assert.equal(audit.before.scoreGeneration, 2);

    assert.equal(audit.after.holeScores, 0);
    assert.equal(audit.after.points, 0);
    assert.equal(audit.after.classificationStatus, 'HIDDEN');
    assert.equal(
      audit.after.scoreGeneration,
      3,
      'la generacion sube: es el dato que explica un rechazo posterior',
    );
  });

  test('no registra ningun dato sensible', () => {
    const serializado = JSON.stringify(buildResetAudit(preview, 0)).toLowerCase();
    for (const prohibido of ['password', 'contrasena', 'hash', 'scrypt', 'argon', 'token']) {
      assert.equal(serializado.includes(prohibido), false, prohibido);
    }
  });
});

describe('los avisos dicen las dos cosas', () => {
  test('el primero enumera lo que se conserva, no solo lo que se destruye', () => {
    // Un aviso que solo amenaza se pulsa igual sin leerlo.
    assert.match(RESET_FIRST_WARNING, /eliminara todos los resultados/);
    assert.match(RESET_FIRST_WARNING, /jugadores, hándicaps, partidos/);
    assert.match(RESET_FIRST_WARNING, /se conservaran/);
  });

  test('se advierte de que no se puede deshacer', () => {
    assert.match(RESET_IRREVERSIBLE_WARNING, /no se puede deshacer/);
  });

  test('el mensaje de exito es el que pide el pliego', () => {
    assert.equal(
      RESET_SUCCESS_MESSAGE,
      'Los resultados de todas las tarjetas se han vaciado correctamente.',
    );
  });
});

/**
 * Guardianes sobre la accion de servidor.
 *
 * No se puede ejecutar `clearAllScores` sin una base de datos, asi que lo que se
 * comprueba es que su codigo cumple las condiciones que no se pueden verificar
 * de otra forma. Es menos que una prueba de comportamiento y se declara como lo
 * que es, pero detecta los tres descuidos que dejarian el vaciado a medias.
 */
describe('la accion de servidor cumple las condiciones del vaciado', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/actions/admin.ts'),
    'utf8',
  );
  const action = source.slice(source.indexOf('export async function clearAllScores'));

  test('comprueba el rol en el servidor, no solo en la interfaz', () => {
    assert.match(action, /await requireAdmin\(\)/);
    assert.match(action, /authorizeReset\(/);
  });

  test('todo ocurre dentro de una transaccion', () => {
    assert.match(action, /prisma\.\$transaction/);
  });

  test('incrementa la generacion de resultados', () => {
    assert.match(action, /scoreResetVersion: \{ increment: 1 \}/);
  });

  test('incrementa la version de las tarjetas', () => {
    // Es lo que invalida una revision hecha antes del vaciado.
    assert.match(action, /version: \{ increment: 1 \}/);
  });

  test('rechaza las operaciones offline pendientes', () => {
    assert.match(action, /syncMutation\.updateMany/);
    assert.match(action, /STALE_GENERATION/);
  });

  test('borra los resultados, las revisiones y los conflictos', () => {
    assert.match(action, /holeScore\.deleteMany/);
    assert.match(action, /cardReview\.deleteMany/);
    assert.match(action, /syncConflict\.deleteMany/);
  });

  test('restablece la clasificacion y su revelacion', () => {
    assert.match(action, /rankingSnapshot\.deleteMany/);
    assert.match(action, /classificationReveal\.updateMany/);
    assert.match(action, /classificationStatus: 'HIDDEN'/);
  });

  test('NO borra las tarjetas como entidades', () => {
    assert.equal(
      /scorecard\.deleteMany/.test(action),
      false,
      'las tarjetas se vacian, no se borran: recrearlas deja a un jugador sin tarjeta',
    );
  });

  test('NO toca jugadores, hándicaps, partidos ni campo', () => {
    for (const prohibido of [
      'competitionPlayer.deleteMany',
      'competitionPlayer.updateMany',
      'user.updateMany',
      'user.deleteMany',
      'flight.deleteMany',
      'competitionCourseSnapshot.deleteMany',
      'maxHandicapIndexTenths',
      'handicapIndexTenths',
    ]) {
      assert.equal(action.includes(prohibido), false, `el vaciado no debe tocar ${prohibido}`);
    }
  });

  test('registra la accion en auditoria', () => {
    assert.match(action, /auditLog\.create/);
  });

  test('revalida las pantallas que dejan de ser validas', () => {
    for (const ruta of ['/tarjeta', '/partido', '/clasificacion', '/admin/tarjetas']) {
      assert.ok(action.includes(`revalidatePath('${ruta}')`), `falta revalidar ${ruta}`);
    }
  });
});
