/**
 * Genera el SQL de creacion del esquema a partir de prisma/schema.prisma.
 *
 *   npm run gen:sql
 *
 * ---------------------------------------------------------------------------
 * Por que generado y no escrito a mano
 * ---------------------------------------------------------------------------
 * El esquema tiene 20 tablas, 255 campos, 23 claves foraneas, 14 indices unicos
 * y 13 enums. Transcribir eso a mano es garantizar una errata, y una errata en
 * un `CREATE TABLE` no se nota hasta que falta una columna en mitad del torneo.
 *
 * Esto lo deriva mecanicamente, y `scripts/__tests__` comprueba que el SQL
 * generado cubre cada modelo, cada campo, cada enum, cada indice y cada relacion
 * del esquema.
 *
 * ADVERTENCIA HONESTA: el SQL no se ha ejecutado nunca contra un PostgreSQL. No
 * hay base de datos en el entorno donde se genero. Lo que esta verificado es su
 * COMPLETITUD respecto al esquema, no que Postgres lo acepte.
 *
 * La alternativa sin riesgo es `npx prisma db push`, que hace lo mismo sin que
 * nadie escriba SQL. Este archivo existe para poder pegarlo en el editor de Neon
 * sin instalar nada.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Field {
  name: string;
  type: string;
  optional: boolean;
  isList: boolean;
  attributes: string;
}

interface Relation {
  fields: string[];
  references: string[];
  onDelete: string | null;
  optional: boolean;
}

export interface Model {
  name: string;
  fields: Field[];
  primaryKey: string | null;
  singleUniques: string[];
  compoundUniques: string[][];
  indexes: string[][];
  relations: Relation[];
}

export interface ParsedSchema {
  enums: Array<{ name: string; values: string[] }>;
  models: Model[];
}

const SCALARS: Record<string, string> = {
  String: 'TEXT',
  Int: 'INTEGER',
  Boolean: 'BOOLEAN',
  DateTime: 'TIMESTAMP(3)',
  Json: 'JSONB',
  Float: 'DOUBLE PRECISION',
  Decimal: 'DECIMAL(65,30)',
  BigInt: 'BIGINT',
  Bytes: 'BYTEA',
};

export function parseSchema(source: string): ParsedSchema {
  const enums: ParsedSchema['enums'] = [];
  const enumPattern = /enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = enumPattern.exec(source)) !== null) {
    enums.push({
      name: match[1],
      values: match[2]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !line.startsWith('//')),
    });
  }

  const models: Model[] = [];
  const modelPattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  while ((match = modelPattern.exec(source)) !== null) {
    const [, name, body] = match;
    const model: Model = {
      name,
      fields: [],
      primaryKey: null,
      singleUniques: [],
      compoundUniques: [],
      indexes: [],
      relations: [],
    };

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }

      if (line.startsWith('@@unique')) {
        const inner = /@@unique\(\[([^\]]+)\]/.exec(line);
        if (inner) model.compoundUniques.push(inner[1].split(',').map((p) => p.trim()));
        continue;
      }
      if (line.startsWith('@@index')) {
        const inner = /@@index\(\[([^\]]+)\]/.exec(line);
        if (inner) model.indexes.push(inner[1].split(',').map((p) => p.trim()));
        continue;
      }
      if (line.startsWith('@@')) continue;

      const parsed = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!parsed) continue;

      const [, fieldName, fieldType, list, optional, attributes] = parsed;
      const field: Field = {
        name: fieldName,
        type: fieldType,
        optional: optional === '?',
        isList: list === '[]',
        attributes: attributes ?? '',
      };
      model.fields.push(field);

      if (field.attributes.includes('@id')) model.primaryKey = field.name;
      if (/@unique\b/.test(field.attributes)) model.singleUniques.push(field.name);

      const relation = /@relation\(([^)]*)\)/.exec(field.attributes);
      if (relation && relation[1].includes('fields:')) {
        const fields = /fields:\s*\[([^\]]+)\]/.exec(relation[1]);
        const references = /references:\s*\[([^\]]+)\]/.exec(relation[1]);
        const onDelete = /onDelete:\s*(\w+)/.exec(relation[1]);
        if (fields && references) {
          model.relations.push({
            fields: fields[1].split(',').map((p) => p.trim()),
            references: references[1].split(',').map((p) => p.trim()),
            onDelete: onDelete ? onDelete[1] : null,
            optional: field.optional,
          });
        }
      }
    }

    models.push(model);
  }

  return { enums, models };
}

/** True si el campo se convierte en columna: escalares y enums, no relaciones. */
export function isColumn(field: Field, schema: ParsedSchema): boolean {
  if (field.isList) return false;
  if (SCALARS[field.type] !== undefined) return true;
  return schema.enums.some((item) => item.name === field.type);
}

function columnType(field: Field): string {
  return SCALARS[field.type] ?? `"${field.type}"`;
}

/**
 * Valor por defecto en SQL.
 *
 * `cuid()` NO se traduce: lo genera el cliente de Prisma, no la base de datos.
 * Es lo mismo que hace Prisma en sus propias migraciones. Lo mismo con
 * `@updatedAt`, que el cliente escribe en cada actualizacion.
 */
function columnDefault(field: Field): string {
  /**
   * La expresion regular admite un nivel de parentesis anidados.
   *
   * Con `[^)]*` se cortaba en el primer cierre, asi que `@default(cuid())`
   * capturaba `cuid(`, no coincidia con ninguna rama conocida y acababa
   * generando `DEFAULT 'cuid('::"String"`. Detectado leyendo el SQL generado.
   */
  const match = /@default\(((?:[^()]|\([^()]*\))*)\)/.exec(field.attributes);
  if (!match) return '';
  const value = match[1].trim();

  if (value === 'cuid()' || value === 'uuid()' || value === 'autoincrement()') return '';
  if (value === 'now()') return ' DEFAULT CURRENT_TIMESTAMP';
  if (value === 'true' || value === 'false') return ` DEFAULT ${value}`;
  if (/^-?\d+(\.\d+)?$/.test(value)) return ` DEFAULT ${value}`;
  if (/^".*"$/.test(value)) return ` DEFAULT '${value.slice(1, -1)}'`;
  // Valor de enum sin comillas: Role @default(PLAYER)
  return ` DEFAULT '${value}'::"${field.type}"`;
}

/**
 * Comportamiento al borrar.
 *
 * Cuando el esquema no lo declara se usan los valores por defecto de Prisma:
 * relacion obligatoria -> RESTRICT, opcional -> SET NULL. `ON UPDATE CASCADE`
 * siempre, que es tambien lo que hace Prisma.
 */
function referentialAction(relation: Relation): string {
  const declared: Record<string, string> = {
    Cascade: 'CASCADE',
    SetNull: 'SET NULL',
    Restrict: 'RESTRICT',
    NoAction: 'NO ACTION',
    SetDefault: 'SET DEFAULT',
  };
  const onDelete = relation.onDelete
    ? declared[relation.onDelete]
    : relation.optional
      ? 'SET NULL'
      : 'RESTRICT';
  return `ON DELETE ${onDelete} ON UPDATE CASCADE`;
}

/** Modelo al que apunta una relacion, deducido del tipo del campo. */
function relationTarget(model: Model, relation: Relation): string | null {
  for (const field of model.fields) {
    const match = /@relation\(([^)]*)\)/.exec(field.attributes);
    if (!match) continue;
    const fields = /fields:\s*\[([^\]]+)\]/.exec(match[1]);
    if (!fields) continue;
    if (fields[1].split(',').map((p) => p.trim()).join(',') === relation.fields.join(',')) {
      return field.type;
    }
  }
  return null;
}

export function generateSql(schema: ParsedSchema): string {
  const out: string[] = [];

  out.push('-- =============================================================================');
  out.push('-- Peñita Golf Championship - creación del esquema');
  out.push('--');
  out.push('-- GENERADO desde prisma/schema.prisma por scripts/generate-sql.ts.');
  out.push('-- No editar a mano: se regenera con `npm run gen:sql`.');
  out.push('--');
  out.push('-- Cómo aplicarlo:');
  out.push('--   Opción A (recomendada, sin SQL):  npx prisma db push');
  out.push('--   Opción B: pegar este archivo entero en el editor SQL de Neon.');
  out.push('--');
  out.push('-- Va todo en una transacción: si algo falla, no queda nada a medias.');
  out.push('-- Un esquema creado a medias es peor que ninguno.');
  out.push('--');
  out.push('-- Es re-ejecutable: los enums se crean con un bloque condicional y las');
  out.push('-- tablas e índices con IF NOT EXISTS.');
  out.push('--');
  out.push('-- AVISO: este SQL no se ha ejecutado nunca contra un PostgreSQL. Lo que');
  out.push('-- está verificado es que cubre cada modelo, campo, enum, índice y relación');
  out.push('-- del esquema, no que Postgres lo acepte. Pruébalo primero en una rama de');
  out.push('-- desarrollo de Neon: son instantáneas y desechables.');
  out.push('-- =============================================================================');
  out.push('');
  out.push('BEGIN;');
  out.push('');

  // --- Enums ---
  out.push('-- ----------------------------------------------------------------------------');
  out.push(`-- Tipos enumerados (${schema.enums.length})`);
  out.push('-- ----------------------------------------------------------------------------');
  out.push('');
  for (const item of schema.enums) {
    const values = item.values.map((value) => `'${value}'`).join(', ');
    out.push(`DO $$ BEGIN`);
    out.push(`  CREATE TYPE "${item.name}" AS ENUM (${values});`);
    out.push(`EXCEPTION WHEN duplicate_object THEN NULL;`);
    out.push(`END $$;`);
    out.push('');
  }

  // --- Tablas ---
  out.push('-- ----------------------------------------------------------------------------');
  out.push(`-- Tablas (${schema.models.length})`);
  out.push('-- ----------------------------------------------------------------------------');
  out.push('');
  for (const model of schema.models) {
    const columns: string[] = [];
    for (const field of model.fields) {
      if (!isColumn(field, schema)) continue;
      const nullability = field.optional ? '' : ' NOT NULL';
      columns.push(`    "${field.name}" ${columnType(field)}${nullability}${columnDefault(field)}`);
    }
    if (model.primaryKey) {
      columns.push(`    CONSTRAINT "${model.name}_pkey" PRIMARY KEY ("${model.primaryKey}")`);
    }
    out.push(`CREATE TABLE IF NOT EXISTS "${model.name}" (`);
    out.push(columns.join(',\n'));
    out.push(');');
    out.push('');
  }

  // --- Indices ---
  out.push('-- ----------------------------------------------------------------------------');
  out.push('-- Índices');
  out.push('-- ----------------------------------------------------------------------------');
  out.push('');
  for (const model of schema.models) {
    for (const field of model.singleUniques) {
      out.push(
        `CREATE UNIQUE INDEX IF NOT EXISTS "${model.name}_${field}_key" ON "${model.name}"("${field}");`,
      );
    }
    for (const group of model.compoundUniques) {
      const name = `${model.name}_${group.join('_')}_key`;
      const cols = group.map((c) => `"${c}"`).join(', ');
      out.push(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ON "${model.name}"(${cols});`);
    }
    for (const group of model.indexes) {
      const name = `${model.name}_${group.join('_')}_idx`;
      const cols = group.map((c) => `"${c}"`).join(', ');
      out.push(`CREATE INDEX IF NOT EXISTS "${name}" ON "${model.name}"(${cols});`);
    }
  }
  out.push('');

  // --- Claves foraneas ---
  out.push('-- ----------------------------------------------------------------------------');
  out.push('-- Claves foráneas');
  out.push('--');
  out.push('-- Al final a propósito: así el orden de creación de tablas da igual.');
  out.push('-- ----------------------------------------------------------------------------');
  out.push('');
  for (const model of schema.models) {
    for (const relation of model.relations) {
      const target = relationTarget(model, relation);
      if (!target) continue;
      const name = `${model.name}_${relation.fields.join('_')}_fkey`;
      const local = relation.fields.map((f) => `"${f}"`).join(', ');
      const foreign = relation.references.map((f) => `"${f}"`).join(', ');
      out.push(`DO $$ BEGIN`);
      out.push(`  ALTER TABLE "${model.name}" ADD CONSTRAINT "${name}"`);
      out.push(
        `    FOREIGN KEY (${local}) REFERENCES "${target}"(${foreign}) ${referentialAction(relation)};`,
      );
      out.push(`EXCEPTION WHEN duplicate_object THEN NULL;`);
      out.push(`END $$;`);
      out.push('');
    }
  }

  out.push('COMMIT;');
  out.push('');
  out.push('-- =============================================================================');
  out.push('-- Después de esto:');
  out.push('--');
  out.push('--   1. Las restricciones que Prisma no sabe expresar:');
  out.push('--      pegar prisma/sql/constraints.sql');
  out.push('--');
  out.push('--   2. Los 13 jugadores, la competición y la valoración del campo:');
  out.push('--      npm run db:seed        (ver docs/seed-credentials.md)');
  out.push('--');
  out.push('--   3. Comprobar que todo está:');
  out.push('--      abrir /api/diagnostico');
  out.push('--');
  out.push('-- Nota sobre Prisma: si creas las tablas con este SQL, Prisma no sabe que');
  out.push('-- existen y avisará de "drift" si algún día cambias el esquema. Para eso,');
  out.push('-- `npx prisma db push` reconcilia sin perder datos.');
  out.push('-- =============================================================================');

  return out.join('\n');
}

function main(): void {
  const schema = parseSchema(readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8'));
  const sql = generateSql(schema);
  const target = join(process.cwd(), 'prisma/sql/schema.sql');
  writeFileSync(target, `${sql}\n`);

  const tables = schema.models.length;
  const foreignKeys = schema.models.reduce((sum, model) => sum + model.relations.length, 0);
  console.log(`prisma/sql/schema.sql generado:`);
  console.log(`  ${schema.enums.length} enums, ${tables} tablas, ${foreignKeys} claves foráneas`);
  console.log(`  ${sql.split('\n').length} líneas`);
}

if (process.argv[1]?.endsWith('generate-sql.ts')) {
  main();
}
