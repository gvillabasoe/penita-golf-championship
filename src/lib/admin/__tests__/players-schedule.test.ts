import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  contrastRatio,
  MIN_COLOR_CONTRAST,
  MIN_NEW_PLAYER_PASSWORD_LENGTH,
  nearestDistance,
  pickPlayerColor,
  validateNewPlayer,
} from '../players';
import {
  competitionDateFromInput,
  dateInputInMadrid,
  madridInstant,
  moveTeeTimeToDate,
  parseDateInput,
  parseTimeInput,
  ScheduleInputError,
  timeInputInMadrid,
} from '../schedule';
import { ACCENT_RAMP } from '../../seed/roster';
import { verifyPassword, hashPassword } from '../../auth/password';

/** Generador determinista para los tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const valid = {
  firstName: 'Iñigo',
  lastName: 'Ruiz de Gauna',
  password: 'iruizdegauna13',
  handicap: '18,4',
};

describe('alta de jugador: validacion', () => {
  test('una ficha correcta se acepta y se normaliza', () => {
    const result = validateNewPlayer({ ...valid, firstName: '  Iñigo ', lastName: 'Ruiz  de  Gauna' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.firstName, 'Iñigo');
    assert.equal(result.lastName, 'Ruiz de Gauna');
    assert.equal(result.displayName, 'Iñigo Ruiz de Gauna');
    assert.equal(result.normalizedName, 'inigo ruiz de gauna');
    assert.equal(result.handicapIndexTenths, 184);
  });

  test('el hándicap admite coma, punto y plus', () => {
    for (const [raw, tenths] of [['18,4', 184], ['18.4', 184], ['+1,2', -12], ['36', 360]] as const) {
      const result = validateNewPlayer({ ...valid, handicap: raw });
      assert.equal(result.ok, true, raw);
      if (result.ok) assert.equal(result.handicapIndexTenths, tenths, raw);
    }
  });

  test('sin hándicap se acepta: se puede fijar despues en su ficha', () => {
    const result = validateNewPlayer({ ...valid, handicap: '   ' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.handicapIndexTenths, null);
  });

  test('devuelve todos los errores a la vez, cada uno en su campo', () => {
    const result = validateNewPlayer({ firstName: '', lastName: '', password: '', handicap: 'abc' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(Object.keys(result.fieldErrors).sort(), [
      'firstName',
      'handicap',
      'lastName',
      'password',
    ]);
  });

  test('la contrasena tiene un minimo, compatible con el patron de la edicion', () => {
    // La mas corta de la edicion tiene siete caracteres: el minimo no puede pasar de ahi.
    assert.ok(MIN_NEW_PLAYER_PASSWORD_LENGTH <= 7);
    const corta = validateNewPlayer({ ...valid, password: 'abc' });
    assert.equal(corta.ok, false);
    if (!corta.ok) assert.match(corta.fieldErrors.password ?? '', /al menos/);
    assert.equal(validateNewPlayer({ ...valid, password: 'jdiaz14' }).ok, true);
  });

  test('una contrasena de solo espacios no vale', () => {
    const result = validateNewPlayer({ ...valid, password: '          ' });
    assert.equal(result.ok, false);
  });

  test('la contrasena NO se recorta: un espacio final es parte de ella', () => {
    const result = validateNewPlayer({ ...valid, password: 'clave-larga ' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.password, 'clave-larga ');
  });

  test('rechaza nombres sin letras y hándicaps fuera de rango', () => {
    assert.equal(validateNewPlayer({ ...valid, firstName: '1234' }).ok, false);
    assert.equal(validateNewPlayer({ ...valid, handicap: '60' }).ok, false);
  });

  test('con la contrasena validada se genera un hash que permite entrar', async () => {
    // El circuito completo del alta: lo que se valida es exactamente lo que se
    // hashea, y con ello el jugador tiene que poder iniciar sesion.
    const result = validateNewPlayer(valid);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const hash = await hashPassword(result.password);
    assert.equal(await verifyPassword(valid.password, hash), true);
    assert.equal(await verifyPassword('otra-cosa', hash), false);
  });
});

describe('alta de jugador: color aleatorio', () => {
  test('mientras queden colores de la paleta, usa uno libre', () => {
    const used = ACCENT_RAMP.slice(0, 5).map(String);
    for (let seed = 1; seed <= 30; seed += 1) {
      const color = pickPlayerColor(used, seeded(seed));
      assert.ok((ACCENT_RAMP as readonly string[]).includes(color), color);
      assert.equal(used.includes(color), false, `repite ${color}`);
    }
  });

  test('es aleatorio: distintas semillas dan colores distintos', () => {
    const colors = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) colors.add(pickPlayerColor([], seeded(seed)));
    assert.ok(colors.size > 5, `solo ${colors.size} colores distintos`);
  });

  test('con la paleta agotada (jugador 14) genera uno nuevo legible y distinto', () => {
    const used = [...ACCENT_RAMP];
    for (let seed = 1; seed <= 50; seed += 1) {
      const color = pickPlayerColor(used, seeded(seed));
      assert.match(color, /^#[0-9a-f]{6}$/);
      assert.equal(used.includes(color as (typeof ACCENT_RAMP)[number]), false);
      assert.ok(
        contrastRatio(color, '#ffffff') >= MIN_COLOR_CONTRAST,
        `${color} no contrasta con el blanco`,
      );
    }
  });

  test('el generado se distingue de los usados tanto o mas que la paleta entre si', () => {
    // Referencia honesta: la distancia minima entre dos colores de la propia
    // paleta original. Un umbral fijo mas alto no es alcanzable con colores
    // oscuros y muchos jugadores, y exigir mas que la paleta no tendria sentido.
    const palette = [...ACCENT_RAMP] as string[];
    const paletteMin = Math.min(
      ...palette.flatMap((a, i) => palette.slice(i + 1).map((b) => nearestDistance(a, [b]))),
    );

    // Jugadores 14 a 20, cada uno con los colores de todos los anteriores.
    const used = [...palette];
    for (let player = 14; player <= 20; player += 1) {
      const color = pickPlayerColor(used, seeded(player));
      const distance = nearestDistance(color, used);
      assert.ok(
        distance > paletteMin,
        `jugador ${player}: ${color} a ${distance.toFixed(0)}, paleta a ${paletteMin.toFixed(0)}`,
      );
      used.push(color);
    }
  });

  test('el jugador 14 recibe un color claramente distinto', () => {
    const color = pickPlayerColor([...ACCENT_RAMP], seeded(14));
    assert.ok(nearestDistance(color, [...ACCENT_RAMP]) >= 40);
  });

  test('toda la paleta contrasta con el blanco', () => {
    for (const color of ACCENT_RAMP) {
      assert.ok(contrastRatio(color, '#ffffff') >= MIN_COLOR_CONTRAST, color);
    }
  });
});

describe('fecha del campeonato y horas de salida', () => {
  test('la fecha se guarda a mediodia UTC y se ve el mismo dia en Madrid', () => {
    const date = competitionDateFromInput('2026-06-13');
    assert.equal(date.toISOString(), '2026-06-13T12:00:00.000Z');
    assert.equal(dateInputInMadrid(date), '2026-06-13');
    // Tambien en invierno.
    assert.equal(dateInputInMadrid(competitionDateFromInput('2026-01-15')), '2026-01-15');
  });

  test('rechaza fechas imposibles o mal escritas', () => {
    for (const bad of ['2026-02-30', '13/06/2026', '', '2026-6-1', '1990-01-01']) {
      assert.throws(() => parseDateInput(bad), ScheduleInputError, bad);
    }
  });

  test('la hora de salida usa el desplazamiento real de Madrid', () => {
    assert.equal(madridInstant('2026-06-13', '09:10').toISOString(), '2026-06-13T07:10:00.000Z');
    assert.equal(madridInstant('2026-01-15', '09:10').toISOString(), '2026-01-15T08:10:00.000Z');
  });

  test('ida y vuelta: lo que se guarda es lo que se vuelve a mostrar', () => {
    for (const hhmm of ['07:00', '09:10', '13:45', '18:30']) {
      const instant = madridInstant('2026-06-13', hhmm);
      assert.equal(timeInputInMadrid(instant), hhmm);
      assert.equal(dateInputInMadrid(instant), '2026-06-13');
    }
  });

  test('rechaza horas mal escritas', () => {
    for (const bad of ['9:10', '24:00', '09:60', 'nueve', '']) {
      assert.throws(() => parseTimeInput(bad), ScheduleInputError, bad);
    }
  });

  test('cambiar la fecha mueve la hora de salida conservando la hora de reloj', () => {
    const before = madridInstant('2026-06-13', '09:10');
    const after = moveTeeTimeToDate(before, '2026-10-24');
    assert.equal(dateInputInMadrid(after), '2026-10-24');
    assert.equal(timeInputInMadrid(after), '09:10');
    // Y cruzando el cambio de hora de octubre (25/10/2026).
    const winter = moveTeeTimeToDate(before, '2026-10-31');
    assert.equal(timeInputInMadrid(winter), '09:10');
    assert.equal(winter.toISOString(), '2026-10-31T08:10:00.000Z');
  });
});
