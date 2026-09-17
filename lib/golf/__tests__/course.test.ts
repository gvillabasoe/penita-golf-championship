import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ULZAMA_AMARILLAS_CABALLEROS,
  ULZAMA_AMARILLAS_CABALLEROS_2014,
  ULZAMA_HOLES,
  diffSnapshots,
  validateCourseSnapshot,
} from '../course';
import { calculateHandicap, DEFAULT_RULE_SET } from '../handicap';

const snapshotJson = JSON.parse(
  readFileSync(join(process.cwd(), 'data/ulzama.snapshot.json'), 'utf8'),
);

describe('datos del campo: Ulzama amarillas caballeros', () => {
  test('pasa todas las validaciones de la seccion 24', () => {
    const issues = validateCourseSnapshot(ULZAMA_AMARILLAS_CABALLEROS);
    assert.deepEqual(issues, [], `problemas: ${JSON.stringify(issues, null, 2)}`);
  });

  test('18 hoyos, par 72, ida 36, vuelta 36', () => {
    assert.equal(ULZAMA_HOLES.length, 18);
    const parOut = ULZAMA_HOLES.slice(0, 9).reduce((s, h) => s + h.par, 0);
    const parIn = ULZAMA_HOLES.slice(9).reduce((s, h) => s + h.par, 0);
    assert.equal(parOut, 36);
    assert.equal(parIn, 36);
    assert.equal(parOut + parIn, 72);
  });

  test('distancias 2.999 / 3.052 / 6.051 metros', () => {
    const out = ULZAMA_HOLES.slice(0, 9).reduce((s, h) => s + h.distance, 0);
    const inn = ULZAMA_HOLES.slice(9).reduce((s, h) => s + h.distance, 0);
    assert.equal(out, 2999);
    assert.equal(inn, 3052);
    assert.equal(out + inn, 6051);
  });

  test('stroke index 1-18 sin duplicados ni huecos', () => {
    const sis = ULZAMA_HOLES.map((h) => h.strokeIndex).sort((a, b) => a - b);
    assert.deepEqual(sis, Array.from({ length: 18 }, (_, i) => i + 1));
  });

  test('los SI impares estan en la ida y los pares en la vuelta (patron del campo)', () => {
    for (const hole of ULZAMA_HOLES) {
      const isOut = hole.holeNumber <= 9;
      assert.equal(
        hole.strokeIndex % 2 === 1,
        isOut,
        `hoyo ${hole.holeNumber}: SI ${hole.strokeIndex} no encaja con el patron`,
      );
    }
  });

  test('el modulo TypeScript y el JSON de trazabilidad no se han desincronizado', () => {
    const fromJson = snapshotJson.activeSnapshot;
    assert.equal(fromJson.slopeRating, ULZAMA_AMARILLAS_CABALLEROS.slopeRating);
    assert.equal(
      Math.round(fromJson.courseRating * 10),
      ULZAMA_AMARILLAS_CABALLEROS.courseRatingTenths,
    );
    assert.equal(fromJson.parTotal, ULZAMA_AMARILLAS_CABALLEROS.parTotal);
    assert.equal(fromJson.distanceTotal, ULZAMA_AMARILLAS_CABALLEROS.distanceTotal);
    assert.equal(fromJson.holes.length, ULZAMA_HOLES.length);
    for (const hole of ULZAMA_HOLES) {
      const json = fromJson.holes.find((h: { holeNumber: number }) => h.holeNumber === hole.holeNumber);
      assert.ok(json, `el JSON no tiene el hoyo ${hole.holeNumber}`);
      assert.equal(json.par, hole.par);
      assert.equal(json.strokeIndex, hole.strokeIndex);
      assert.equal(json.distance, hole.distance);
    }
  });

  test('la valoracion activa consta confirmada, con actor y fecha', () => {
    // El invariante que importa no es "sin confirmar", es "nunca activa sin
    // rastro". Confirmada por el organizador el 17/09/2026 tras comprobarla.
    const active = snapshotJson.activeSnapshot;
    assert.ok(active.confirmedAt, 'una valoracion activa sin fecha de confirmacion');
    assert.ok(active.confirmedByUserId, 'una valoracion activa sin saber quien la confirmo');
    assert.equal(active.confirmedByUserId, 'gvillabaso');
    assert.match(active.confirmedAt, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('la trazabilidad del campo esta cerrada: valores y fecha de vigencia', () => {
    const active = snapshotJson.activeSnapshot;
    assert.equal(active.ratingDate, '2024-07', 'falta la fecha de vigencia de la valoracion');

    const fuente = (snapshotJson.sources as Array<{ id: string; ratingDate?: string }>).find(
      (item) => item.id === 'rfeg-web-2026',
    );
    assert.equal(fuente?.ratingDate, '2024-07');

    // Lo unico que queda sin verificar son las valoraciones de 9 hoyos, que no
    // se usan: la competicion es a 18.
    const pendientes = snapshotJson.crossChecks.unverified as string[];
    assert.equal(pendientes.length, 1);
    assert.match(pendientes[0], /9 hoyos/);
  });
});

describe('deteccion de datos corruptos', () => {
  test('detecta stroke index duplicado', () => {
    const broken = {
      ...ULZAMA_AMARILLAS_CABALLEROS,
      holes: ULZAMA_HOLES.map((h) => (h.holeNumber === 2 ? { ...h, strokeIndex: 5 } : h)),
    };
    const codes = validateCourseSnapshot(broken).map((i) => i.code);
    assert.ok(codes.includes('STROKE_INDEX_DUPLICATED'));
    assert.ok(codes.includes('STROKE_INDEX_MISSING'));
  });

  test('detecta par total incoherente', () => {
    const broken = {
      ...ULZAMA_AMARILLAS_CABALLEROS,
      holes: ULZAMA_HOLES.map((h) => (h.holeNumber === 1 ? { ...h, par: 5 } : h)),
    };
    assert.ok(validateCourseSnapshot(broken).some((i) => i.code === 'PAR_TOTAL'));
  });

  test('detecta mezcla de barras (distancia total que no cuadra)', () => {
    const broken = { ...ULZAMA_AMARILLAS_CABALLEROS, distanceTotal: 6241 };
    assert.ok(validateCourseSnapshot(broken).some((i) => i.code === 'DISTANCE_TOTAL'));
  });

  test('detecta slope imposible', () => {
    const broken = { ...ULZAMA_AMARILLAS_CABALLEROS, slopeRating: 180 };
    assert.ok(validateCourseSnapshot(broken).some((i) => i.code === 'SLOPE_RANGE'));
  });
});

describe('comparacion de fuentes (seccion 19)', () => {
  test('la ficha de 2014 y la valoracion vigente difieren solo en Vc y Slope', () => {
    const diffs = diffSnapshots(ULZAMA_AMARILLAS_CABALLEROS_2014, ULZAMA_AMARILLAS_CABALLEROS);
    assert.deepEqual(diffs, [
      { field: 'Slope Rating', current: '132', incoming: '139' },
      { field: 'Valor de Campo', current: '72,2', incoming: '72,6' },
    ]);
  });

  test('impacto real del cambio de valoracion en el hándicap de juego', () => {
    // Este test documenta el efecto deportivo de la decision, para que quede
    // registrado en el repositorio y no dependa de la memoria de nadie.
    const afectados: Array<{ hcp: string; antes: number; ahora: number }> = [];
    for (let t = 0; t <= 400; t += 1) {
      const antes = calculateHandicap(t, ULZAMA_AMARILLAS_CABALLEROS_2014, DEFAULT_RULE_SET)
        .playingHandicap;
      const ahora = calculateHandicap(t, ULZAMA_AMARILLAS_CABALLEROS, DEFAULT_RULE_SET)
        .playingHandicap;
      if (antes !== ahora) {
        afectados.push({ hcp: (t / 10).toFixed(1), antes, ahora });
      }
    }
    // La valoracion nueva es mas exigente: nunca da MENOS golpes.
    for (const caso of afectados) {
      assert.ok(
        caso.ahora >= caso.antes,
        `con hcp ${caso.hcp} la valoracion nueva daria menos golpes (${caso.antes} -> ${caso.ahora})`,
      );
    }
    console.log(
      `    [dato] cambiar 72,2/132 por 72,6/139 altera el hándicap de juego en ${afectados.length} de 401 hándicaps exactos entre 0,0 y 40,0`,
    );
  });
});
