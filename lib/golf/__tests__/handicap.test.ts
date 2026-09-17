import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateHandicap,
  courseHandicap,
  roundingPolicyDivergences,
  DEFAULT_RULE_SET,
} from '../handicap';
import {
  parseHandicapIndexToTenths,
  formatTenths,
  formatHundredths,
  roundDiv,
  HandicapParseError,
} from '../decimal';
import {
  EGA_TABLE_AMARILLAS_CABALLEROS,
  ULZAMA_AMARILLAS_2014,
} from './ega-table.fixture';

const ULZAMA_VIGENTE = {
  slopeRating: 139,
  courseRatingTenths: 726,
  parTotal: 72,
};

describe('parseHandicapIndexToTenths', () => {
  test('acepta coma y punto indistintamente', () => {
    assert.equal(parseHandicapIndexToTenths('20,7'), 207);
    assert.equal(parseHandicapIndexToTenths('20.7'), 207);
    assert.equal(parseHandicapIndexToTenths(' 20,7 '), 207);
  });

  test('acepta enteros y cero', () => {
    assert.equal(parseHandicapIndexToTenths('20'), 200);
    assert.equal(parseHandicapIndexToTenths('0'), 0);
    assert.equal(parseHandicapIndexToTenths('54,0'), 540);
  });

  test('interpreta el prefijo + como hándicap plus (negativo interno)', () => {
    assert.equal(parseHandicapIndexToTenths('+2,4'), -24);
    assert.equal(parseHandicapIndexToTenths('+2.4'), -24);
    assert.equal(parseHandicapIndexToTenths('-2,4'), -24);
  });

  test('rechaza entradas invalidas', () => {
    for (const bad of ['', '  ', 'abc', '20,75', '20,,7', '1e3', '55,0', '+10,1']) {
      assert.throws(() => parseHandicapIndexToTenths(bad), HandicapParseError, `deberia fallar: ${bad}`);
    }
  });

  test('el formateo es reversible', () => {
    for (let t = -100; t <= 540; t += 1) {
      assert.equal(parseHandicapIndexToTenths(formatTenths(t)), t);
    }
  });
});

describe('roundDiv (0,5 se aleja de cero, sin coma flotante)', () => {
  test('casos frontera', () => {
    assert.equal(roundDiv(1500, 1000), 2);
    assert.equal(roundDiv(-1500, 1000), -2);
    assert.equal(roundDiv(1499, 1000), 1);
    assert.equal(roundDiv(-1499, 1000), -1);
    assert.equal(roundDiv(0, 1130), 0);
  });

  test('nunca devuelve -0 (regresion: -0 sobrevive a JSON y rompe la igualdad)', () => {
    assert.ok(Object.is(roundDiv(-1, 1130), 0));
    assert.ok(Object.is(roundDiv(-500, 1130), 0));
    assert.equal(JSON.stringify({ hj: roundDiv(-1, 1130) }), '{"hj":0}');
  });

  test('no hereda el error de 0,1 + 0,2', () => {
    // 20,7 x 132 / 113 + 0,2 en coma flotante puede caer al lado equivocado.
    // Aqui se resuelve sobre enteros.
    assert.equal(roundDiv(207 * 132 + 113 * (722 - 720), 1130), 24);
  });
});

describe('formula del hándicap de campo contra la tabla EGA oficial de Ulzama', () => {
  test('los 64 intervalos transcritos del PDF cuadran en ambos extremos', () => {
    let checks = 0;
    for (const row of EGA_TABLE_AMARILLAS_CABALLEROS) {
      for (const tenths of [row.fromTenths, row.toTenths]) {
        const actual = courseHandicap(
          tenths,
          ULZAMA_AMARILLAS_2014.slopeRating,
          ULZAMA_AMARILLAS_2014.courseRatingTenths,
          ULZAMA_AMARILLAS_2014.parTotal,
        );
        assert.equal(
          actual,
          row.expected,
          `hándicap exacto ${formatTenths(tenths)} -> esperado ${row.expected}, obtenido ${actual}`,
        );
        checks += 1;
      }
    }
    assert.equal(checks, EGA_TABLE_AMARILLAS_CABALLEROS.length * 2);
  });

  test('cada intervalo completo (decima a decima) produce el mismo valor', () => {
    for (const row of EGA_TABLE_AMARILLAS_CABALLEROS) {
      for (let t = row.fromTenths; t <= row.toTenths; t += 1) {
        assert.equal(
          courseHandicap(
            t,
            ULZAMA_AMARILLAS_2014.slopeRating,
            ULZAMA_AMARILLAS_2014.courseRatingTenths,
            ULZAMA_AMARILLAS_2014.parTotal,
          ),
          row.expected,
          `rotura dentro del intervalo en ${formatTenths(t)}`,
        );
      }
    }
  });

  test('es monotona no decreciente en todo el rango +10,0 .. 54,0', () => {
    let previous = Number.NEGATIVE_INFINITY;
    for (let t = -100; t <= 540; t += 1) {
      const value = courseHandicap(t, 139, 726, 72);
      assert.ok(value >= previous, `no monotona en ${formatTenths(t)}`);
      previous = value;
    }
  });
});

describe('hándicap de juego con la valoracion vigente (Slope 139 / Vc 72,6)', () => {
  test('caso de referencia 20,7 con 95%', () => {
    const result = calculateHandicap(207, ULZAMA_VIGENTE, DEFAULT_RULE_SET);
    // 20,7 x 139/113 = 25,4628... ; + (72,6 - 72) = 26,0628... ; x 95% = 24,7597...
    assert.equal(result.courseHandicap, 26);
    assert.equal(formatHundredths(result.courseHandicapRawHundredths), '26,06');
    assert.equal(result.playingHandicap, 25);
    // Con ROUND_TWICE el porcentaje se aplica al hándicap de campo YA redondeado:
    // 26 x 95% = 24,70.
    assert.equal(formatHundredths(result.playingHandicapRawHundredths), '24,70');
  });

  test('scratch recibe solo el ajuste Vc - Par', () => {
    const result = calculateHandicap(0, ULZAMA_VIGENTE, DEFAULT_RULE_SET);
    assert.equal(result.courseHandicap, 1); // 0,6 -> 1
    assert.equal(result.playingHandicap, 1); // 0,57 -> 1
  });

  test('hándicap plus produce hándicap de juego negativo', () => {
    const result = calculateHandicap(-24, ULZAMA_VIGENTE, DEFAULT_RULE_SET);
    // -2,4 x 139/113 = -2,9522 ; +0,6 = -2,3522 ; x95% = -2,2346
    assert.equal(result.courseHandicap, -2);
    assert.equal(result.playingHandicap, -2);
  });

  test('guarda todos los intermedios que exige la auditoria', () => {
    const result = calculateHandicap(207, ULZAMA_VIGENTE, DEFAULT_RULE_SET);
    assert.equal(result.slopeRating, 139);
    assert.equal(result.courseRatingTenths, 726);
    assert.equal(result.allowancePercent, 95);
    assert.equal(result.roundingPolicy, 'ROUND_TWICE');
    assert.match(result.ruleVersion, /allowance=95/);
    assert.ok(result.calculatedAt.endsWith('Z'));
    assert.match(result.formula, /95%/);
  });

  test('rechaza parametros imposibles en lugar de calcular basura', () => {
    assert.throws(() => calculateHandicap(207, { ...ULZAMA_VIGENTE, slopeRating: 200 }));
    assert.throws(() => calculateHandicap(207, { ...ULZAMA_VIGENTE, parTotal: 3 }));
    assert.throws(() =>
      calculateHandicap(207, ULZAMA_VIGENTE, { ...DEFAULT_RULE_SET, allowancePercent: 0 }),
    );
    assert.throws(() => calculateHandicap(20.7 as unknown as number, ULZAMA_VIGENTE));
  });
});

describe('decision de reglas fijada para esta edicion', () => {
  test('la politica activa es ROUND_TWICE al 95 % (decision autorizada, no cambiar en silencio)', () => {
    // Si este test falla, alguien ha cambiado la politica de redondeo del
    // campeonato. Eso es una regla deportiva: debe ir acompanado de una
    // decision explicita del organizador y de una entrada en el CHANGELOG.
    assert.equal(DEFAULT_RULE_SET.roundingPolicy, 'ROUND_TWICE');
    assert.equal(DEFAULT_RULE_SET.allowancePercent, 95);
    assert.match(DEFAULT_RULE_SET.ruleVersion, /rounding=ROUND_TWICE/);
    assert.match(DEFAULT_RULE_SET.ruleVersion, /allowance=95/);
  });

  test('los casos de referencia dan el mismo hándicap de juego con las dos politicas', () => {
    // Tranquilizador: para el hándicap tipico de la peña el cambio no mueve nada.
    for (const tenths of [0, 207, -24]) {
      const once = calculateHandicap(tenths, ULZAMA_VIGENTE, {
        allowancePercent: 95,
        roundingPolicy: 'ROUND_ONCE',
        ruleVersion: 'cmp',
      }).playingHandicap;
      const twice = calculateHandicap(tenths, ULZAMA_VIGENTE, {
        allowancePercent: 95,
        roundingPolicy: 'ROUND_TWICE',
        ruleVersion: 'cmp',
      }).playingHandicap;
      assert.equal(once, twice, `difieren en ${formatTenths(tenths)}`);
    }
  });
});

describe('integridad de la tabla EGA transcrita', () => {
  /**
   * La transcripcion del PDF tiene un hueco: entre la fila 44,8-45,6 -> 53 y la
   * fila 46,5-47,3 -> 55 falta una linea que la extraccion no permitio leer.
   *
   * No se ha inventado esa fila. Lo que se comprueba aqui es que el hueco NO
   * puede esconder una discontinuidad: la formula, ya verificada contra las 64
   * filas legibles, cubre todo el rango sin saltos ni repeticiones. Si la tabla
   * oficial tuviera ahi algo distinto de un unico tramo 45,7-46,4 -> 54, la
   * formula habria fallado en alguna de las filas que si se leyeron.
   */
  test('la formula cubre 0,0 a 54,0 en tramos contiguos, sin huecos ni saltos', () => {
    const bands: Array<{ from: number; to: number; value: number }> = [];
    for (let t = 0; t <= 540; t += 1) {
      const value = courseHandicap(
        t,
        ULZAMA_AMARILLAS_2014.slopeRating,
        ULZAMA_AMARILLAS_2014.courseRatingTenths,
        ULZAMA_AMARILLAS_2014.parTotal,
      );
      const last = bands[bands.length - 1];
      if (last && last.value === value) last.to = t;
      else bands.push({ from: t, to: t, value });
    }

    // Contiguos: cada tramo empieza justo donde acaba el anterior.
    for (let i = 1; i < bands.length; i += 1) {
      assert.equal(bands[i].from, bands[i - 1].to + 1, `hueco antes de ${bands[i].from}`);
      assert.equal(bands[i].value, bands[i - 1].value + 1, `salto en ${bands[i].from}`);
    }
  });

  test('el hueco de la transcripcion corresponde a un unico tramo, que da 54', () => {
    const inGap = new Set<number>();
    for (let t = 457; t <= 464; t += 1) {
      inGap.add(
        courseHandicap(
          t,
          ULZAMA_AMARILLAS_2014.slopeRating,
          ULZAMA_AMARILLAS_2014.courseRatingTenths,
          ULZAMA_AMARILLAS_2014.parTotal,
        ),
      );
    }
    assert.deepEqual([...inGap], [54], 'el hueco 45,7-46,4 es un solo tramo con valor 54');
  });
});

describe('divergencia entre politicas de redondeo', () => {
  test('se puede enumerar exactamente donde difieren (dato para el admin)', () => {
    const divergences = roundingPolicyDivergences(ULZAMA_VIGENTE, 95, 0, 540);
    // No se afirma un numero concreto: se comprueba que la lista es coherente
    // y que en cada caso la diferencia es de un solo golpe.
    for (const d of divergences) {
      assert.equal(Math.abs(d.roundOnce - d.roundTwice), 1);
    }
    assert.ok(divergences.length > 0, 'las dos politicas deberian diferir en algun tramo');
    console.log(
      `    [dato] ROUND_ONCE vs ROUND_TWICE difieren en ${divergences.length} de 541 hándicaps posibles`,
    );
  });
});
