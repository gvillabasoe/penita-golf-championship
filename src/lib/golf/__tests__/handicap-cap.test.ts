/**
 * Limite maximo de hándicap (seccion 30).
 *
 * Lo que estos tests protegen, en una frase: el limite cambia lo que se CALCULA
 * y no cambia lo que el jugador TIENE. Casi todos los fallos posibles de esta
 * funcionalidad son variantes de confundir esas dos cosas.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAP_EXPLANATION,
  applicableHandicapTenths,
  applicableHandicapTenthsOrNull,
  capChangeImpact,
  describeHandicapCap,
  parseHandicapCapToTenths,
} from '../handicap-cap';
import { HandicapParseError } from '../decimal';
import { calculateHandicap } from '../handicap';
import { allocateStrokes, totalAllocatedStrokes } from '../strokes';
import { ULZAMA_HOLES, ULZAMA_AMARILLAS_CABALLEROS } from '../course';
import { buildRanking } from '../ranking';
import type { RankingInput } from '../types';

const SNAPSHOT = {
  slopeRating: ULZAMA_AMARILLAS_CABALLEROS.slopeRating,
  courseRatingTenths: ULZAMA_AMARILLAS_CABALLEROS.courseRatingTenths,
  parTotal: ULZAMA_AMARILLAS_CABALLEROS.parTotal,
};

describe('lectura del limite escrito por el administrador', () => {
  test('acepta coma, punto y entero', () => {
    assert.equal(parseHandicapCapToTenths('26,4'), 264);
    assert.equal(parseHandicapCapToTenths('26.4'), 264);
    assert.equal(parseHandicapCapToTenths('24'), 240);
    assert.equal(parseHandicapCapToTenths(' 26,4 '), 264);
  });

  test('el limite maximo del sistema es 54,0', () => {
    assert.equal(parseHandicapCapToTenths('54'), 540);
    assert.throws(() => parseHandicapCapToTenths('54,1'), HandicapParseError);
  });

  test('rechaza la notacion plus: un limite plus no limita a quien deberia', () => {
    // "+2,4" se interpretaria como -24 decimas y convertiria a todo el mundo en
    // jugador plus. Aceptarlo en silencio dejaria una configuracion que no hace
    // lo que su autor cree.
    assert.throws(() => parseHandicapCapToTenths('+2,4'), HandicapParseError);
    assert.throws(() => parseHandicapCapToTenths('-2,4'), HandicapParseError);
  });

  test('rechaza lo que no es un numero', () => {
    for (const entrada of ['', '  ', 'veinte', '26,44', '2-6', '26%']) {
      assert.throws(() => parseHandicapCapToTenths(entrada), HandicapParseError, entrada);
    }
  });

  test('los espacios interiores se ignoran, como en el hándicap exacto', () => {
    // Comportamiento heredado de `parseHandicapIndexToTenths`, que quita todo el
    // espacio en blanco antes de analizar. Se documenta en un test en vez de
    // cambiarlo: el limite y el hándicap exacto tienen que leerse igual, y con
    // un teclado movil el espacio de mas es un accidente frecuente.
    assert.equal(parseHandicapCapToTenths('2 6'), 260);
    assert.equal(parseHandicapCapToTenths('26 , 4'), 264);
  });
});

describe('hándicap aplicable', () => {
  test('sin limite, el aplicable es el exacto', () => {
    assert.equal(applicableHandicapTenths(302, null), 302);
    assert.equal(applicableHandicapTenths(0, null), 0);
    assert.equal(applicableHandicapTenths(-24, null), -24);
  });

  test('por debajo del limite no cambia nada', () => {
    assert.equal(applicableHandicapTenths(180, 264), 180);
    assert.equal(applicableHandicapTenths(264, 264), 264, 'justo en el limite no se toca');
  });

  test('por encima del limite se aplica el limite', () => {
    assert.equal(applicableHandicapTenths(302, 264), 264);
    assert.equal(applicableHandicapTenths(540, 240), 240);
  });

  test('un jugador plus nunca se ve afectado', () => {
    assert.equal(applicableHandicapTenths(-24, 0), -24);
    assert.equal(applicableHandicapTenths(-24, 264), -24);
  });

  test('sin hándicap exacto no hay aplicable que inventar', () => {
    assert.equal(applicableHandicapTenthsOrNull(null, 264), null);
    assert.equal(applicableHandicapTenthsOrNull(null, null), null);
  });
});

describe('presentacion del limite', () => {
  test('un jugador por debajo no genera ruido visual', () => {
    const view = describeHandicapCap(180, 264);
    assert.equal(view.isCapped, false);
    assert.equal(view.badge, null);
    assert.equal(view.exactLabel, '18,0');
    assert.equal(view.appliedLabel, '18,0');
  });

  test('un jugador por encima muestra los dos valores y la etiqueta', () => {
    const view = describeHandicapCap(302, 264);
    assert.equal(view.isCapped, true);
    assert.equal(view.exactLabel, '30,2');
    assert.equal(view.appliedLabel, '26,4');
    assert.equal(view.badge, 'HCP limitado a 26,4');
  });

  test('sin limite no hay etiqueta', () => {
    assert.equal(describeHandicapCap(302, null).badge, null);
  });

  test('sin hándicap exacto no se afirma que este limitado', () => {
    const view = describeHandicapCap(null, 264);
    assert.equal(view.isCapped, false);
    assert.equal(view.exactLabel, null);
    assert.equal(view.badge, null);
  });

  test('el texto explicativo dice que el exacto se conserva', () => {
    // Es la frase que evita la pregunta "entonces me habeis cambiado el
    // hándicap?" el dia del torneo.
    assert.match(CAP_EXPLANATION, /exacto original se conservara/);
  });
});

describe('el limite recorre el calculo completo', () => {
  const EXACT = 302; // 30,2
  const CAP = 264; // 26,4

  test('el hándicap de campo se calcula con el aplicable', () => {
    const sinLimite = calculateHandicap(EXACT, SNAPSHOT);
    const conLimite = calculateHandicap(applicableHandicapTenths(EXACT, CAP), SNAPSHOT);
    assert.notEqual(sinLimite.courseHandicap, conLimite.courseHandicap);
    assert.equal(conLimite.courseHandicap, calculateHandicap(CAP, SNAPSHOT).courseHandicap);
  });

  test('el hándicap de juego tambien', () => {
    const conLimite = calculateHandicap(applicableHandicapTenths(EXACT, CAP), SNAPSHOT);
    assert.equal(conLimite.playingHandicap, calculateHandicap(CAP, SNAPSHOT).playingHandicap);
  });

  test('los golpes recibidos por hoyo cambian y siguen sumando el hándicap de juego', () => {
    const conLimite = calculateHandicap(applicableHandicapTenths(EXACT, CAP), SNAPSHOT);
    const reparto = allocateStrokes(conLimite.playingHandicap, ULZAMA_HOLES);

    assert.equal(
      totalAllocatedStrokes(reparto),
      conLimite.playingHandicap,
      'el reparto tiene que sumar exactamente el hándicap de juego',
    );

    const sinLimite = calculateHandicap(EXACT, SNAPSHOT);
    assert.notEqual(
      totalAllocatedStrokes(allocateStrokes(sinLimite.playingHandicap, ULZAMA_HOLES)),
      totalAllocatedStrokes(reparto),
    );
  });

  test('un jugador por debajo del limite calcula exactamente igual que sin limite', () => {
    const exacto = 180;
    const sinLimite = calculateHandicap(exacto, SNAPSHOT);
    const conLimite = calculateHandicap(applicableHandicapTenths(exacto, CAP), SNAPSHOT);
    assert.deepEqual(conLimite, sinLimite);
  });
});

describe('el desempate sigue usando el hándicap exacto ORIGINAL', () => {
  /**
   * Es el punto mas delicado de toda la funcionalidad.
   *
   * Dos jugadores empatados a puntos, uno de 30,2 y otro de 28,0, con el limite
   * en 26,4: los dos compiten con 26,4, asi que si el desempate usase el
   * aplicable quedarian empatados para siempre y la posicion se decidiria por el
   * tercer criterio o se compartiria. Con el exacto, gana el de 28,0, que es lo
   * que dicen las reglas de la competicion.
   */
  const player = (
    id: string,
    name: string,
    handicapIndexTenths: number,
  ): RankingInput => ({
    competitionPlayerId: id,
    displayName: name,
    color: '#1b563b',
    handicapIndexTenths,
    playingHandicap: 25,
    points: 34,
    numericStrokes: 95,
    adjustedStrokes: 95,
    pickups: 0,
    holesCompleted: 18,
    scorecardStatus: 'FINISHED',
  });

  test('con dos jugadores limitados al mismo valor, el exacto rompe el empate', () => {
    const rows = buildRanking([
      player('alto', 'Alto', 302),
      player('bajo', 'Bajo', 280),
    ]);

    assert.equal(rows[0].displayName, 'Bajo');
    assert.equal(rows[0].position, 1);
    assert.equal(rows[0].isSharedPosition, false);
    assert.equal(rows[1].position, 2);
    assert.equal(rows[1].resolvedBy, 'HANDICAP_INDEX');
  });

  test('la clasificacion no recibe el hándicap aplicable en ningun campo', () => {
    // `RankingInput` no tiene donde meterlo, y es a proposito: si algun dia se
    // anade, este test recuerda que el desempate NO debe usarlo.
    const rows = buildRanking([player('a', 'Ana', 302)]);
    assert.equal(rows[0].handicapIndexTenths, 302);
    assert.equal('appliedHandicapIndexTenths' in rows[0], false);
  });
});

describe('impacto de cambiar el limite', () => {
  const PLAYERS = [
    { competitionPlayerId: 'a', displayName: 'Ana', handicapIndexTenths: 302 },
    { competitionPlayerId: 'b', displayName: 'Beto', handicapIndexTenths: 280 },
    { competitionPlayerId: 'c', displayName: 'Carla', handicapIndexTenths: 180 },
    { competitionPlayerId: 'd', displayName: 'Dani', handicapIndexTenths: null },
  ];

  test('poner un limite afecta solo a quien lo supera', () => {
    const impact = capChangeImpact(PLAYERS, null, 264);
    assert.deepEqual(
      impact.map((row) => row.displayName),
      ['Ana', 'Beto'],
    );
    assert.equal(impact[0].beforeAppliedTenths, 302);
    assert.equal(impact[0].afterAppliedTenths, 264);
  });

  test('quitar el limite devuelve a los afectados su exacto', () => {
    const impact = capChangeImpact(PLAYERS, 264, null);
    assert.deepEqual(
      impact.map((row) => row.afterAppliedTenths),
      [302, 280],
    );
  });

  test('un jugador sin hándicap no aparece en el impacto', () => {
    const impact = capChangeImpact(PLAYERS, null, 200);
    assert.equal(
      impact.some((row) => row.displayName === 'Dani'),
      false,
    );
  });

  test('subir el limite por encima de todos no afecta a nadie', () => {
    assert.deepEqual(capChangeImpact(PLAYERS, null, 540), []);
  });

  test('editar el limite mide el cambio respecto al anterior, no al exacto', () => {
    // De 26,4 a 24,0: Ana y Beto ya estaban limitados, asi que el impacto es el
    // salto entre los dos limites, no entre su exacto y el nuevo limite.
    const impact = capChangeImpact(PLAYERS, 264, 240);
    assert.deepEqual(
      impact.map((row) => [row.displayName, row.beforeAppliedTenths, row.afterAppliedTenths]),
      [
        ['Ana', 264, 240],
        ['Beto', 264, 240],
      ],
    );
  });
});
