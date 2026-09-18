/**
 * Guardian de campos del esquema.
 *
 * ---------------------------------------------------------------------------
 * Por que existe este archivo
 * ---------------------------------------------------------------------------
 * Al anadir `maxHandicapIndexTenths` y `scoreResetVersion` al modelo
 * `Competition` en la v1.2.0, la edicion **borro `handicapRuleVersion`**: el
 * bloque de texto que se sustituyo incluia esa linea y no se volvio a escribir.
 *
 * No lo detecto nada:
 *
 *  - Los 609 tests pasaban. Ninguno lee ese campo.
 *  - `scripts/__tests__/generate-sql.test.ts` comprueba que **cada campo del
 *    esquema tiene su columna**. Un campo que desaparece del esquema desaparece
 *    tambien del SQL generado, asi que los dos siguen cuadrando y el test pasa.
 *    Comprobaba la direccion equivocada.
 *  - `prisma/sql/schema.sql` se regenero sin la columna, asi que una base de
 *    datos creada desde cero habria quedado sin ella.
 *
 * Lo detecto el `tsc` del build de Vercel, tres minutos antes de desplegar, con
 * un error que hablaba de `CompetitionUpdateInput` y no de un campo borrado.
 *
 * Este archivo cierra el hueco por el otro lado: fija los campos que el dominio
 * NECESITA para funcionar. Si alguno desaparece del esquema, falla aqui, con el
 * nombre del campo y sin necesidad de compilar Next.
 *
 * No es la lista completa del esquema a proposito: una lista exhaustiva habria
 * que mantenerla a mano en cada cambio y acabaria desincronizada. Aqui solo
 * estan los campos cuya ausencia rompe un calculo, una sesion o una escritura.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

/** Campos declarados en un modelo, con su tipo tal cual aparece. */
function modelFields(model: string): Map<string, string> {
  const match = new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  assert.ok(match, `el modelo ${model} no existe en el esquema`);

  const fields = new Map<string, string>();
  for (const raw of match[1].split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('//') || line.startsWith('@@')) continue;
    const parsed = /^(\w+)\s+(\S+)/.exec(line);
    if (parsed) fields.set(parsed[1], parsed[2]);
  }
  return fields;
}

/**
 * Campos imprescindibles por modelo.
 *
 * El tipo se comprueba tambien: un `Int` que pasa a `Float` compilaria sin
 * quejarse y estropearia la aritmetica exacta del hándicap en silencio, que es
 * peor que un campo que falta.
 */
const REQUIRED: Record<string, Record<string, string>> = {
  Competition: {
    // Reglas de calculo. `handicapRuleVersion` es la que se borro: sin ella no
    // se puede reconstruir con que reglas se jugo una edicion pasada.
    handicapAllowancePercent: 'Int',
    handicapRoundingPolicy: 'HandicapRoundingPolicy',
    handicapRuleVersion: 'String',
    // Limite de hándicap y generacion de resultados (v1.2.0).
    maxHandicapIndexTenths: 'Int?',
    scoreResetVersion: 'Int',
    status: 'CompetitionStatus',
    classificationStatus: 'ClassificationStatus',
    teeColor: 'TeeName',
    category: 'PlayerCategory',
    modality: 'Modality',
  },
  CompetitionPlayer: {
    // Decimas enteras, nunca Float: la coma flotante no puede decidir una
    // clasificacion.
    handicapIndexTenths: 'Int?',
    appliedHandicapIndexTenths: 'Int?',
    courseHandicap: 'Int?',
    playingHandicap: 'Int?',
    courseHandicapRawHundredths: 'Int?',
    playingHandicapRawHundredths: 'Int?',
    calculationVersion: 'String?',
    color: 'String',
    isActive: 'Boolean',
  },
  CompetitionCourseSnapshot: {
    slopeRating: 'Int',
    courseRatingTenths: 'Int',
    parTotal: 'Int',
    distanceTotal: 'Int',
    isActive: 'Boolean',
  },
  CourseHoleSnapshot: {
    holeNumber: 'Int',
    par: 'Int',
    strokeIndex: 'Int',
    distance: 'Int',
  },
  Scorecard: {
    status: 'ScorecardStatus',
    version: 'Int',
    playerConfirmedFinish: 'Boolean',
    holesCompleted: 'Int',
    pointsTotal: 'Int',
    numericStrokesTotal: 'Int',
    pickupCount: 'Int',
    lockedAt: 'DateTime?',
    reviewedAt: 'DateTime?',
  },
  HoleScore: {
    // Los tres campos que sostienen la distincion entre vacio y raya.
    grossStrokes: 'Int?',
    isPickup: 'Boolean',
    isConfirmed: 'Boolean',
    strokesReceived: 'Int',
    stablefordPoints: 'Int',
    serverVersion: 'Int',
    isOverridden: 'Boolean',
  },
  SyncMutation: {
    clientMutationId: 'String',
    operation: 'String',
    scoreGeneration: 'Int',
    status: 'SyncStatus',
    rejectionReason: 'String?',
  },
  User: {
    passwordHash: 'String',
    normalizedName: 'String',
    role: 'Role',
    sessionEpoch: 'Int',
    defaultColor: 'String',
    isActive: 'Boolean',
  },
  Session: {
    tokenHash: 'String',
    sessionEpoch: 'Int',
    expiresAt: 'DateTime',
    revokedAt: 'DateTime?',
  },
};

describe('campos imprescindibles del esquema', () => {
  for (const [model, fields] of Object.entries(REQUIRED)) {
    describe(model, () => {
      const declared = modelFields(model);

      test('estan todos', () => {
        const faltan = Object.keys(fields).filter((name) => !declared.has(name));
        assert.deepEqual(
          faltan,
          [],
          `estos campos han desaparecido de ${model}: la aplicacion no compila sin ellos`,
        );
      });

      test('conservan su tipo', () => {
        const cambiados: string[] = [];
        for (const [name, expected] of Object.entries(fields)) {
          const actual = declared.get(name);
          if (actual === undefined) continue; // lo reporta el test anterior
          // Se ignoran los atributos: solo interesa el tipo y si es opcional.
          if (actual !== expected) cambiados.push(`${name}: ${actual} (se esperaba ${expected})`);
        }
        assert.deepEqual(cambiados, []);
      });
    });
  }
});

describe('el SQL generado incluye los campos imprescindibles', () => {
  /**
   * La otra mitad del guardian.
   *
   * El test de `generate-sql` comprueba que cada campo del esquema tiene su
   * columna. Eso no basta: si un campo desaparece del esquema, desaparece
   * tambien del SQL y los dos siguen cuadrando. Esto comprueba la direccion que
   * faltaba, contra la lista de arriba.
   */
  const sql = readFileSync(join(process.cwd(), 'prisma/sql/schema.sql'), 'utf8');

  test('cada campo imprescindible tiene su columna en schema.sql', () => {
    const faltan: string[] = [];
    for (const [model, fields] of Object.entries(REQUIRED)) {
      const table = new RegExp(`CREATE TABLE IF NOT EXISTS "${model}" \\(([\\s\\S]*?)\\n\\);`).exec(
        sql,
      );
      if (!table) {
        faltan.push(`${model}: la tabla entera`);
        continue;
      }
      for (const name of Object.keys(fields)) {
        if (!table[1].includes(`"${name}"`)) faltan.push(`${model}.${name}`);
      }
    }
    assert.deepEqual(faltan, [], 'ejecuta npm run gen:sql');
  });
});

describe('la aritmetica exacta no se ha relajado', () => {
  test('ningun hándicap ni valoracion usa Float o Decimal', () => {
    /**
     * Regla de oro del esquema: nada que decida una clasificacion pasa por coma
     * flotante. Todo va en decimas o centesimas enteras.
     *
     * Un `Float` colado aqui no rompe nada visible: simplemente empieza a dar un
     * golpe de diferencia en algunos hándicaps, y eso no se descubre hasta que
     * alguien compara con la calculadora del club.
     */
    const sospechosos: string[] = [];
    for (const raw of SCHEMA.split('\n')) {
      const line = raw.trim();
      if (line.startsWith('//')) continue;
      const parsed = /^(\w*(?:[Hh]andicap|Rating|Tenths|Hundredths)\w*)\s+(\S+)/.exec(line);
      if (!parsed) continue;
      if (/^(Float|Decimal)\??$/.test(parsed[2])) {
        sospechosos.push(`${parsed[1]}: ${parsed[2]}`);
      }
    }
    assert.deepEqual(sospechosos, []);
  });
});
