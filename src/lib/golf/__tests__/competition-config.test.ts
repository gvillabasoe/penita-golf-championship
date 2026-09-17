import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertReadyToPlay,
  buildRuleVersion,
  changeRuleSet,
  confirmCourseSnapshot,
  type CompetitionConfig,
} from '../competition-config';
import {
  ULZAMA_AMARILLAS_CABALLEROS as VIGENTE,
  ULZAMA_AMARILLAS_CABALLEROS_2014 as HISTORICA,
} from '../course';

const CONFIG_DRAFT: CompetitionConfig = {
  status: 'DRAFT',
  allowancePercent: 95,
  roundingPolicy: 'ROUND_ONCE',
  ruleVersion: buildRuleVersion({ allowancePercent: 95, roundingPolicy: 'ROUND_ONCE' }),
  confirmedSnapshotId: null,
};

describe('confirmacion de la valoracion del campo', () => {
  test('rechaza la confirmacion si queda una diferencia sin revisar', () => {
    const result = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: VIGENTE,
      current: HISTORICA,
      actorId: 'admin',
      actorRole: 'ADMIN',
      acknowledgedFields: ['Slope Rating'], // falta el Valor de Campo
      competitionStatus: 'DRAFT',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Valor de Campo \(72,2 -> 72,6\)/);
  });

  test('confirma cuando se han revisado todas las diferencias y deja auditoria', () => {
    const result = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: VIGENTE,
      current: HISTORICA,
      actorId: 'admin',
      actorRole: 'ADMIN',
      acknowledgedFields: ['Slope Rating', 'Valor de Campo'],
      competitionStatus: 'DRAFT',
      now: new Date('2026-09-17T10:00:00Z'),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.audit.action, 'COURSE_SNAPSHOT_CONFIRMED');
    assert.equal(result.audit.actorId, 'admin');
    assert.equal(result.confirmedAt, '2026-09-17T10:00:00.000Z');
    assert.deepEqual(result.audit.beforeData, { slopeRating: 132, courseRatingTenths: 722 });
  });

  test('un jugador no puede confirmar la valoracion', () => {
    const result = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: VIGENTE,
      current: null,
      actorId: 'jugador',
      actorRole: 'PLAYER',
      acknowledgedFields: [],
      competitionStatus: 'DRAFT',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors[0], /Solo un administrador/);
  });

  test('la primera confirmacion no exige revisar diferencias porque no hay anterior', () => {
    const result = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: VIGENTE,
      current: null,
      actorId: 'admin',
      actorRole: 'ADMIN',
      acknowledgedFields: [],
      competitionStatus: 'DRAFT',
    });
    assert.equal(result.ok, true);
  });

  test('con la vuelta empezada exige motivo por escrito', () => {
    const sinMotivo = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: VIGENTE,
      current: HISTORICA,
      actorId: 'admin',
      actorRole: 'ADMIN',
      acknowledgedFields: ['Slope Rating', 'Valor de Campo'],
      competitionStatus: 'IN_PLAY',
    });
    assert.equal(sinMotivo.ok, false);

    const conMotivo = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: VIGENTE,
      current: HISTORICA,
      actorId: 'admin',
      actorRole: 'ADMIN',
      acknowledgedFields: ['Slope Rating', 'Valor de Campo'],
      competitionStatus: 'IN_PLAY',
      reason: 'El club confirma por telefono que la valoracion vigente es 72,6/139.',
    });
    assert.equal(conMotivo.ok, true);
    if (!conMotivo.ok) return;
    assert.match(conMotivo.audit.reason ?? '', /72,6\/139/);
  });

  test('una competicion cerrada no se toca ni con motivo', () => {
    const result = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: VIGENTE,
      current: HISTORICA,
      actorId: 'admin',
      actorRole: 'ADMIN',
      acknowledgedFields: ['Slope Rating', 'Valor de Campo'],
      competitionStatus: 'CLOSED',
      reason: 'lo que sea',
    });
    assert.equal(result.ok, false);
  });

  test('rechaza datos de campo invalidos aunque el admin los confirme', () => {
    const roto = {
      ...VIGENTE,
      holes: VIGENTE.holes.map((h) => (h.holeNumber === 2 ? { ...h, strokeIndex: 5 } : h)),
    };
    const result = confirmCourseSnapshot({
      snapshotId: 's1',
      incoming: roto,
      current: null,
      actorId: 'admin',
      actorRole: 'ADMIN',
      acknowledgedFields: [],
      competitionStatus: 'DRAFT',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((e) => e.includes('STROKE_INDEX_DUPLICATED')));
  });
});

describe('puerta de arranque del campeonato', () => {
  test('no se puede empezar sin valoracion confirmada', () => {
    const issues = assertReadyToPlay({
      config: CONFIG_DRAFT,
      activePlayers: 13,
      playersWithoutHandicap: 0,
      playersWithoutFlight: 0,
      flightsWithoutTeeTime: 0,
      duplicatedPlayers: 0,
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'COURSE_NOT_CONFIRMED');
    assert.equal(issues[0].area, 'CAMPO');
  });

  test('lista todas las incidencias a la vez, cada una con su area', () => {
    const issues = assertReadyToPlay({
      config: CONFIG_DRAFT,
      activePlayers: 13,
      playersWithoutHandicap: 3,
      playersWithoutFlight: 2,
      flightsWithoutTeeTime: 1,
      duplicatedPlayers: 1,
    });
    assert.deepEqual(
      issues.map((i) => i.code).sort(),
      [
        'COURSE_NOT_CONFIRMED',
        'DUPLICATED_PLAYER',
        'MISSING_FLIGHT',
        'MISSING_HANDICAP',
        'MISSING_TEE_TIME',
      ],
    );
    assert.deepEqual(
      [...new Set(issues.map((i) => i.area))].sort(),
      ['CAMPO', 'JUGADORES', 'PARTIDOS'],
    );
  });

  test('todo en orden: ninguna incidencia', () => {
    const issues = assertReadyToPlay({
      config: { ...CONFIG_DRAFT, status: 'CONFIGURED', confirmedSnapshotId: 's1' },
      activePlayers: 13,
      playersWithoutHandicap: 0,
      playersWithoutFlight: 0,
      flightsWithoutTeeTime: 0,
      duplicatedPlayers: 0,
    });
    assert.deepEqual(issues, []);
  });
});

describe('cambio de reglas de calculo', () => {
  const jugadores = [
    { playerId: 'p1', handicapIndexTenths: 16 }, // 1,6: tramo divergente
    { playerId: 'p2', handicapIndexTenths: 207 }, // 20,7
    { playerId: 'p3', handicapIndexTenths: 88 }, // 8,8: tramo divergente
  ];

  test('muestra el impacto exacto ANTES de aplicar el cambio', () => {
    const result = changeRuleSet({
      config: { ...CONFIG_DRAFT, confirmedSnapshotId: 's1' },
      snapshot: VIGENTE,
      next: { allowancePercent: 95, roundingPolicy: 'ROUND_TWICE' },
      players: jugadores,
      actorId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(result.ok, true);
    assert.equal(result.ruleVersion, 'WHS-ES;allowance=95;rounding=ROUND_TWICE');
    // 1,6 y 8,8 estan en tramos donde las politicas difieren; 20,7 no.
    assert.deepEqual(
      result.impact.map((i) => i.playerId).sort(),
      ['p1', 'p3'],
    );
    assert.equal(result.impact.find((i) => i.playerId === 'p1')?.before, 2);
    assert.equal(result.impact.find((i) => i.playerId === 'p1')?.after, 3);
  });

  test('un cambio sin efecto devuelve impacto vacio', () => {
    const result = changeRuleSet({
      config: { ...CONFIG_DRAFT, confirmedSnapshotId: 's1' },
      snapshot: VIGENTE,
      next: { allowancePercent: 95, roundingPolicy: 'ROUND_ONCE' },
      players: jugadores,
      actorId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.impact, []);
  });

  test('bajar el porcentaje quita golpes a todo el mundo', () => {
    const result = changeRuleSet({
      config: { ...CONFIG_DRAFT, confirmedSnapshotId: 's1' },
      snapshot: VIGENTE,
      next: { allowancePercent: 85, roundingPolicy: 'ROUND_ONCE' },
      players: jugadores,
      actorId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(result.ok, true);
    assert.ok(result.impact.length > 0);
    for (const i of result.impact) assert.ok(i.after <= i.before);
  });

  test('con la vuelta empezada exige motivo y no calcula impacto si falta', () => {
    const result = changeRuleSet({
      config: { ...CONFIG_DRAFT, status: 'IN_PLAY', confirmedSnapshotId: 's1' },
      snapshot: VIGENTE,
      next: { allowancePercent: 95, roundingPolicy: 'ROUND_TWICE' },
      players: jugadores,
      actorId: 'admin',
      actorRole: 'ADMIN',
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.impact, []);
    assert.equal(result.audit, null);
    assert.match(result.errors[0], /motivo por escrito/);
  });

  test('rechaza porcentajes imposibles', () => {
    for (const percent of [0, -5, 101, 95.5]) {
      const result = changeRuleSet({
        config: { ...CONFIG_DRAFT, confirmedSnapshotId: 's1' },
        snapshot: VIGENTE,
        next: { allowancePercent: percent, roundingPolicy: 'ROUND_ONCE' },
        players: jugadores,
        actorId: 'admin',
        actorRole: 'ADMIN',
      });
      assert.equal(result.ok, false, `deberia rechazar ${percent}`);
    }
  });

  test('la version de regla es deterministica y legible en la auditoria', () => {
    assert.equal(
      buildRuleVersion({ allowancePercent: 95, roundingPolicy: 'ROUND_ONCE' }),
      'WHS-ES;allowance=95;rounding=ROUND_ONCE',
    );
  });
});
