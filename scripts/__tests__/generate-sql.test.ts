/**
 * Verificacion del SQL generado.
 *
 * No puede comprobar que PostgreSQL acepte el archivo: no hay base de datos en
 * el entorno donde se genera. Lo que comprueba es su **completitud**: que cada
 * modelo, cada campo, cada enum, cada indice y cada relacion del esquema tengan
 * su reflejo en el SQL, y que no haya nada de mas.
 *
 * Es la parte que se puede verificar de "he generado esto a partir del esquema",
 * y es justo donde una transcripcion a mano habria fallado: una columna que
 * falta no se nota hasta que alguien intenta escribir en ella.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generateSql, isColumn, parseSchema } from '../generate-sql';

const ROOT = process.cwd();
const schema = parseSchema(readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8'));
const sql = readFileSync(join(ROOT, 'prisma/sql/schema.sql'), 'utf8');

/** Cuerpo de un CREATE TABLE concreto. */
function tableBody(name: string): string | null {
  const pattern = new RegExp(
    `CREATE TABLE IF NOT EXISTS "${name}" \\(([\\s\\S]*?)\\n\\);`,
  );
  const match = pattern.exec(sql);
  return match ? match[1] : null;
}

describe('el archivo esta al dia', () => {
  test('lo que hay en disco es lo que genera el script', () => {
    // Si alguien edita prisma/sql/schema.sql a mano, este test lo dice.
    assert.equal(
      `${generateSql(schema)}\n`,
      sql,
      'prisma/sql/schema.sql esta desincronizado: ejecuta npm run gen:sql',
    );
  });

  test('avisa de que no se ha ejecutado contra un PostgreSQL', () => {
    // La advertencia no es decorativa: es lo unico que separa esto de una
    // migracion validada.
    assert.match(sql, /no se ha ejecutado nunca contra un PostgreSQL/);
  });
});

describe('estructura del archivo', () => {
  test('va todo en una transaccion', () => {
    assert.match(sql, /^\s*(?:--[^\n]*\n)*\s*BEGIN;/m);
    assert.match(sql, /\nCOMMIT;/);
    assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  });

  test('los enums se crean antes de las tablas', () => {
    const firstType = sql.indexOf('CREATE TYPE');
    const firstTable = sql.indexOf('CREATE TABLE');
    assert.ok(firstType > 0 && firstTable > 0);
    assert.ok(firstType < firstTable, 'una tabla que use un enum fallaria');
  });

  test('las claves foraneas van al final, despues de todas las tablas', () => {
    const lastTable = sql.lastIndexOf('CREATE TABLE');
    const firstForeignKey = sql.indexOf('ADD CONSTRAINT');
    assert.ok(firstForeignKey > lastTable, 'el orden de creacion de tablas importaria');
  });

  test('es re-ejecutable', () => {
    // Postgres no admite CREATE TYPE IF NOT EXISTS: de ahi los bloques DO.
    assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length, schema.models.length);
    assert.equal((sql.match(/EXCEPTION WHEN duplicate_object/g) ?? []).length,
      schema.enums.length + schema.models.reduce((n, m) => n + m.relations.length, 0));
    assert.equal(sql.includes('CREATE INDEX "'), false, 'los indices deben ser IF NOT EXISTS');
  });

  test('parentesis equilibrados y comillas pares', () => {
    const opens = (sql.match(/\(/g) ?? []).length;
    const closes = (sql.match(/\)/g) ?? []).length;
    assert.equal(opens, closes, 'parentesis desequilibrados');
    assert.equal((sql.match(/"/g) ?? []).length % 2, 0, 'comillas dobles impares');
    assert.equal((sql.match(/'/g) ?? []).length % 2, 0, 'comillas simples impares');
  });
});

describe('enums', () => {
  test('los 13 enums estan, con todos sus valores', () => {
    assert.equal(schema.enums.length, 13);
    for (const item of schema.enums) {
      const pattern = new RegExp(`CREATE TYPE "${item.name}" AS ENUM \\(([^)]*)\\)`);
      const match = pattern.exec(sql);
      assert.ok(match, `falta el enum ${item.name}`);
      for (const value of item.values) {
        assert.ok(
          match[1].includes(`'${value}'`),
          `al enum ${item.name} le falta el valor ${value}`,
        );
      }
    }
  });

  test('ningun enum trae valores que el esquema no declare', () => {
    for (const item of schema.enums) {
      const match = new RegExp(`CREATE TYPE "${item.name}" AS ENUM \\(([^)]*)\\)`).exec(sql);
      assert.ok(match);
      const inSql = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      assert.deepEqual(inSql.sort(), [...item.values].sort());
    }
  });
});

describe('tablas y columnas', () => {
  test('las 20 tablas estan', () => {
    assert.equal(schema.models.length, 20);
    for (const model of schema.models) {
      assert.ok(tableBody(model.name), `falta la tabla ${model.name}`);
    }
  });

  test('cada campo escalar o de enum tiene su columna', () => {
    const missing: string[] = [];
    for (const model of schema.models) {
      const body = tableBody(model.name);
      assert.ok(body);
      for (const field of model.fields) {
        if (!isColumn(field, schema)) continue;
        if (!body.includes(`"${field.name}" `)) missing.push(`${model.name}.${field.name}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  test('los campos de relacion NO generan columna', () => {
    // `user User @relation(...)` no es una columna: la columna es `userId`.
    const extra: string[] = [];
    for (const model of schema.models) {
      const body = tableBody(model.name);
      assert.ok(body);
      for (const field of model.fields) {
        if (isColumn(field, schema)) continue;
        if (new RegExp(`"${field.name}" (TEXT|INTEGER|BOOLEAN|TIMESTAMP|JSONB)`).test(body)) {
          extra.push(`${model.name}.${field.name}`);
        }
      }
    }
    assert.deepEqual(extra, []);
  });

  test('la nulabilidad coincide con el esquema', () => {
    const wrong: string[] = [];
    for (const model of schema.models) {
      const body = tableBody(model.name);
      assert.ok(body);
      for (const field of model.fields) {
        if (!isColumn(field, schema)) continue;
        const line = body
          .split('\n')
          .find((l) => l.trim().startsWith(`"${field.name}" `));
        if (!line) continue;
        const hasNotNull = line.includes('NOT NULL');
        if (field.optional === hasNotNull) {
          wrong.push(
            `${model.name}.${field.name}: esquema ${field.optional ? 'opcional' : 'obligatorio'}, SQL ${hasNotNull ? 'NOT NULL' : 'nullable'}`,
          );
        }
      }
    }
    assert.deepEqual(wrong, []);
  });

  test('cada tabla tiene su clave primaria con el nombre que usa Prisma', () => {
    for (const model of schema.models) {
      if (!model.primaryKey) continue;
      assert.match(
        sql,
        new RegExp(`CONSTRAINT "${model.name}_pkey" PRIMARY KEY \\("${model.primaryKey}"\\)`),
        `falta la clave primaria de ${model.name}`,
      );
    }
  });

  test('cuid() no se traduce a un DEFAULT de base de datos', () => {
    // Lo genera el cliente de Prisma. Un DEFAULT aqui seria una invencion.
    assert.equal(sql.includes('cuid'), false);
    // Y `id` nunca lleva default.
    for (const model of schema.models) {
      const body = tableBody(model.name);
      if (!body) continue;
      const line = body.split('\n').find((l) => l.trim().startsWith('"id" '));
      if (line) assert.equal(line.includes('DEFAULT'), false, `${model.name}.id lleva DEFAULT`);
    }
  });

  test('los valores por defecto del esquema estan en el SQL', () => {
    const missing: string[] = [];
    for (const model of schema.models) {
      const body = tableBody(model.name);
      if (!body) continue;
      for (const field of model.fields) {
        if (!isColumn(field, schema)) continue;
        const declared = /@default\(((?:[^()]|\([^()]*\))*)\)/.exec(field.attributes);
        if (!declared) continue;
        const value = declared[1].trim();
        if (value === 'cuid()' || value === 'uuid()' || value === 'autoincrement()') continue;
        const line = body.split('\n').find((l) => l.trim().startsWith(`"${field.name}" `));
        if (!line || !line.includes('DEFAULT')) {
          missing.push(`${model.name}.${field.name} = ${value}`);
        }
      }
    }
    assert.deepEqual(missing, []);
  });
});

describe('indices', () => {
  test('cada @unique de campo tiene su indice unico', () => {
    for (const model of schema.models) {
      for (const field of model.singleUniques) {
        assert.match(
          sql,
          new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS "${model.name}_${field}_key"`),
          `falta el unico de ${model.name}.${field}`,
        );
      }
    }
  });

  test('cada @@unique compuesto tiene su indice', () => {
    for (const model of schema.models) {
      for (const group of model.compoundUniques) {
        const name = `${model.name}_${group.join('_')}_key`;
        assert.match(sql, new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}"`), `falta ${name}`);
        for (const column of group) {
          assert.ok(sql.includes(`"${column}"`), `${name} no menciona ${column}`);
        }
      }
    }
  });

  test('cada @@index tiene su indice', () => {
    for (const model of schema.models) {
      for (const group of model.indexes) {
        const name = `${model.name}_${group.join('_')}_idx`;
        assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS "${name}"`), `falta ${name}`);
      }
    }
  });

  test('el unico de HoleScore por hoyo esta: sin el se podrian duplicar hoyos', () => {
    assert.match(sql, /"HoleScore_scorecardId_holeNumber_key"/);
    assert.match(sql, /"CourseHoleSnapshot_snapshotId_holeNumber_key"/);
    assert.match(sql, /"CourseHoleSnapshot_snapshotId_strokeIndex_key"/);
  });
});

describe('claves foraneas', () => {
  test('todas las relaciones del esquema tienen su clave foranea', () => {
    const missing: string[] = [];
    for (const model of schema.models) {
      for (const relation of model.relations) {
        const name = `${model.name}_${relation.fields.join('_')}_fkey`;
        if (!sql.includes(`"${name}"`)) missing.push(name);
      }
    }
    assert.deepEqual(missing, []);
  });

  test('el borrado en cascada del esquema se respeta', () => {
    // Borrar una tarjeta debe llevarse sus hoyos. Si esto no cuadra, quedarian
    // hoyos huerfanos apuntando a una tarjeta que ya no existe.
    assert.match(
      sql,
      /"HoleScore_scorecardId_fkey"[\s\S]*?ON DELETE CASCADE/,
    );
    assert.match(sql, /"Session_userId_fkey"[\s\S]*?ON DELETE CASCADE/);
    assert.match(sql, /"CourseHoleSnapshot_snapshotId_fkey"[\s\S]*?ON DELETE CASCADE/);
  });

  test('las relaciones opcionales sin onDelete declarado quedan en SET NULL', () => {
    // Es el valor por defecto de Prisma. Inventar CASCADE aqui borraria filas
    // que deberian sobrevivir: una entrada de auditoria no desaparece porque se
    // borre el usuario que la provoco.
    assert.match(sql, /"AuditLog_actorId_fkey"[\s\S]*?ON DELETE SET NULL/);
    assert.match(sql, /"AuditLog_competitionId_fkey"[\s\S]*?ON DELETE SET NULL/);
  });

  test('todas apuntan a una tabla que existe', () => {
    const referenced = [...sql.matchAll(/REFERENCES "(\w+)"/g)].map((m) => m[1]);
    const tables = new Set(schema.models.map((m) => m.name));
    for (const target of new Set(referenced)) {
      assert.ok(tables.has(target), `una clave foranea apunta a "${target}", que no existe`);
    }
  });
});

describe('recuentos', () => {
  test('el SQL no se deja nada ni anade nada', () => {
    const expectedForeignKeys = schema.models.reduce((n, m) => n + m.relations.length, 0);
    assert.equal((sql.match(/ADD CONSTRAINT/g) ?? []).length, expectedForeignKeys);

    const expectedUniques =
      schema.models.reduce((n, m) => n + m.singleUniques.length + m.compoundUniques.length, 0);
    assert.equal((sql.match(/CREATE UNIQUE INDEX/g) ?? []).length, expectedUniques);

    const expectedIndexes = schema.models.reduce((n, m) => n + m.indexes.length, 0);
    assert.equal((sql.match(/CREATE INDEX/g) ?? []).length, expectedIndexes);
  });
});

/**
 * Verificacion de prisma/sql/constraints.sql.
 *
 * Ese archivo si esta escrito a mano, porque Prisma no sabe expresar CHECK. Lo
 * que se comprueba aqui es que toda tabla y toda columna que menciona existan de
 * verdad en el esquema: una errata en un CHECK no se nota hasta que alguien
 * ejecuta el archivo, y entonces la transaccion entera se cae.
 */
describe('restricciones escritas a mano', () => {
  const constraints = readFileSync(join(ROOT, 'prisma/sql/constraints.sql'), 'utf8');

  /** Bloques `ALTER TABLE "X" ... ;` con su tabla y sus columnas citadas. */
  function alterBlocks(): Array<{ table: string; columns: string[] }> {
    const blocks: Array<{ table: string; columns: string[] }> = [];
    const pattern = /ALTER TABLE "(\w+)"([\s\S]*?);/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(constraints)) !== null) {
      const [, table, body] = match;
      const columns = [...body.matchAll(/CHECK \(([\s\S]*?)\)\s*(?:,|$)/g)]
        .flatMap((check) => [...check[1].matchAll(/"(\w+)"/g)].map((c) => c[1]));
      blocks.push({ table, columns: [...new Set(columns)] });
    }
    return blocks;
  }

  test('hay bloques que comprobar', () => {
    assert.ok(alterBlocks().length >= 7, `solo ${alterBlocks().length} bloques`);
  });

  test('todas las tablas mencionadas existen en el esquema', () => {
    const tables = new Set(schema.models.map((model) => model.name));
    const missing = alterBlocks()
      .map((block) => block.table)
      .filter((table) => !tables.has(table));
    assert.deepEqual([...new Set(missing)], []);
  });

  test('todas las columnas de los CHECK existen en su tabla', () => {
    const problems: string[] = [];
    for (const block of alterBlocks()) {
      const model = schema.models.find((item) => item.name === block.table);
      if (!model) continue;
      const fields = new Set(
        model.fields.filter((field) => isColumn(field, schema)).map((field) => field.name),
      );
      for (const column of block.columns) {
        // Los nombres de las propias restricciones tambien van entre comillas:
        // se descartan porque nunca coinciden con un campo del modelo y llevan
        // guion bajo en minusculas.
        if (/^[a-z]+(_[a-z0-9]+)+$/.test(column)) continue;
        if (!fields.has(column)) problems.push(`${block.table}."${column}"`);
      }
    }
    assert.deepEqual([...new Set(problems)], []);
  });

  test('el indice parcial apunta a una columna real', () => {
    assert.match(constraints, /ON "CompetitionCourseSnapshot" \("competitionId"\)/);
    assert.match(constraints, /WHERE "isActive" = true/);
    const model = schema.models.find((item) => item.name === 'CompetitionCourseSnapshot');
    assert.ok(model?.fields.some((f) => f.name === 'competitionId'));
    assert.ok(model?.fields.some((f) => f.name === 'isActive'));
  });

  test('es re-ejecutable y transaccional', () => {
    assert.match(constraints, /^BEGIN;$/m);
    assert.match(constraints, /^COMMIT;$/m);
    const blocks = (constraints.match(/DO \$\$ BEGIN/g) ?? []).length;
    const handlers = (constraints.match(/EXCEPTION WHEN duplicate_object/g) ?? []).length;
    assert.equal(blocks, handlers, 'algun bloque DO se ha quedado sin manejador');
    assert.ok(blocks >= 7);
    assert.match(constraints, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  });

  test('parentesis equilibrados', () => {
    assert.equal(
      (constraints.match(/\(/g) ?? []).length,
      (constraints.match(/\)/g) ?? []).length,
    );
  });
});
