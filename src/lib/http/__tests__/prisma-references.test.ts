/**
 * Guardian de referencias a Prisma.
 *
 * El cliente de Prisma se genera del esquema, y el esquema de este proyecto esta
 * escrito a mano. Eso significa que un modelo mal escrito, un campo que no
 * existe o un valor de enum inventado **no se detectan hasta que alguien
 * ejecuta `prisma generate` y `tsc`**. En el entorno donde se genero este
 * codigo no hay ni red ni base de datos, asi que estos tests hacen lo que se
 * puede hacer sin ellas: comparar cada referencia contra el esquema.
 *
 * No sustituye a `npm run typecheck`. Adelanta la clase de error mas probable.
 *
 * El analisis sigue las llaves en vez de usar una expresion regular suelta: una
 * primera version atribuia los `select` anidados al modelo de fuera y daba
 * trece falsos positivos. Aqui solo se comprueba el primer nivel del argumento
 * de la llamada y el primer nivel de sus `select` e `include`, que es hasta
 * donde se puede saber a que modelo pertenece cada clave.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

interface Schema {
  models: Map<string, Set<string>>;
  compoundKeys: Set<string>;
  enumValues: Set<string>;
}

function parseSchema(): Schema {
  const source = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
  const models = new Map<string, Set<string>>();
  const compoundKeys = new Set<string>();
  const enumValues = new Set<string>();

  const modelPattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelPattern.exec(source)) !== null) {
    const [, name, body] = match;
    const fields = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('//')) continue;
      if (line.startsWith('@@unique')) {
        const inner = /@@unique\(\[([^\]]+)\]/.exec(line);
        if (inner) {
          compoundKeys.add(
            inner[1]
              .split(',')
              .map((part) => part.trim())
              .join('_'),
          );
        }
        continue;
      }
      if (line.startsWith('@@')) continue;
      const field = /^(\w+)\s+/.exec(line);
      if (field) fields.add(field[1]);
    }
    models.set(name, fields);
  }

  const enumPattern = /enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  while ((match = enumPattern.exec(source)) !== null) {
    for (const line of match[2].split('\n')) {
      const value = line.trim();
      if (value !== '' && !value.startsWith('//')) enumValues.add(value);
    }
  }

  return { models, compoundKeys, enumValues };
}

const schema = parseSchema();
const modelByAccessor = new Map(
  [...schema.models.keys()].map((name) => [name[0].toLowerCase() + name.slice(1), name]),
);

/** Archivos que hablan con Prisma. Solo esos se analizan. */
function prismaFiles(): string[] {
  const out: string[] = [];
  const recurse = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) recurse(full);
      else if ((full.endsWith('.ts') || full.endsWith('.tsx')) && !full.includes('__tests__')) {
        const source = readFileSync(full, 'utf8');
        if (/from '(?:\.\.\/)*db'|from '@\/lib\/db'|@prisma\/client/.test(source)) out.push(full);
      }
    }
  };
  recurse(join(ROOT, 'src'));
  const seed = join(ROOT, 'prisma/seed.ts');
  if (statSync(seed).isFile()) out.push(seed);
  return out;
}

/** Recorta el objeto literal que empieza en `start` siguiendo las llaves. */
function sliceObject(source: string, start: number): string | null {
  if (source[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** Claves del primer nivel de un objeto literal, con la posicion de su valor. */
function topLevelKeys(objectSource: string): Array<{ key: string; valueAt: number }> {
  const keys: Array<{ key: string; valueAt: number }> = [];
  let depth = 0;
  for (let i = 0; i < objectSource.length; i += 1) {
    const char = objectSource[i];
    if (char === '{' || char === '[' || char === '(') depth += 1;
    else if (char === '}' || char === ']' || char === ')') depth -= 1;
    else if (depth === 1) {
      const rest = objectSource.slice(i);
      const key = /^(\w+)\s*:/.exec(rest);
      if (key) {
        const valueStart = i + key[0].length;
        let cursor = valueStart;
        while (cursor < objectSource.length && /\s/.test(objectSource[cursor])) cursor += 1;
        keys.push({ key: key[1], valueAt: cursor });
        i += key[0].length - 1;
      }
    }
  }
  return keys;
}

interface Call {
  file: string;
  model: string;
  operation: string;
  argument: string | null;
}

function findCalls(): { calls: Call[]; unknownModels: string[] } {
  const calls: Call[] = [];
  const unknownModels: string[] = [];

  for (const file of prismaFiles()) {
    const source = readFileSync(file, 'utf8');
    const pattern = /\b(?:prisma|tx)\.(\w+)\.(\w+)\(/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
      const [, accessor, operation] = match;
      if (accessor.startsWith('$')) continue;

      const model = modelByAccessor.get(accessor);
      if (!model) {
        unknownModels.push(`${relative(ROOT, file)}: prisma.${accessor}.${operation}()`);
        continue;
      }

      let cursor = match.index + match[0].length;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      calls.push({
        file: relative(ROOT, file),
        model,
        operation,
        argument: sliceObject(source, cursor),
      });
    }
  }

  return { calls, unknownModels };
}

const { calls, unknownModels } = findCalls();

describe('el esquema se analiza bien', () => {
  test('tiene los modelos y enums que se esperan', () => {
    assert.equal(schema.models.size, 20, `${schema.models.size} modelos`);
    assert.ok(schema.enumValues.size > 30, `solo ${schema.enumValues.size} valores de enum`);
    assert.ok(schema.models.get('User')?.has('passwordHash'));
    assert.ok(schema.compoundKeys.has('scorecardId_holeNumber'));
  });

  test('se han encontrado llamadas a Prisma que comprobar', () => {
    assert.ok(calls.length > 30, `solo ${calls.length} llamadas encontradas`);
  });
});

describe('modelos', () => {
  test('todo prisma.<modelo> existe en el esquema', () => {
    assert.deepEqual(unknownModels, []);
  });
});

describe('claves compuestas', () => {
  test('toda clave compuesta usada coincide con un @@unique del esquema', () => {
    const problems: string[] = [];
    for (const file of prismaFiles()) {
      const source = readFileSync(file, 'utf8');
      const pattern = /where:\s*\{\s*(\w+_\w+):\s*\{/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        if (!schema.compoundKeys.has(match[1])) {
          problems.push(`${relative(ROOT, file)}: "${match[1]}"`);
        }
      }
    }
    assert.deepEqual(problems, []);
  });
});

describe('campos del primer nivel', () => {
  /**
   * Se comprueban las claves de `select` e `include` del primer nivel del
   * argumento. Mas adentro no se puede saber a que modelo pertenecen sin
   * resolver las relaciones, y por eso no se comprueba: un falso positivo en un
   * guardian es peor que un hueco conocido.
   */
  test('las claves de select e include existen en el modelo', () => {
    const problems: string[] = [];

    for (const call of calls) {
      if (!call.argument) continue;
      const fields = schema.models.get(call.model);
      if (!fields) continue;

      for (const entry of topLevelKeys(call.argument)) {
        if (entry.key !== 'select' && entry.key !== 'include') continue;
        const nested = sliceObject(call.argument, entry.valueAt);
        if (!nested) continue;
        for (const inner of topLevelKeys(nested)) {
          if (!fields.has(inner.key)) {
            problems.push(
              `${call.file}: ${call.model}.${entry.key}.${inner.key} no existe (${call.operation})`,
            );
          }
        }
      }
    }

    assert.deepEqual([...new Set(problems)], []);
  });

  test('las claves de orderBy existen en el modelo', () => {
    const problems: string[] = [];
    for (const call of calls) {
      if (!call.argument) continue;
      const fields = schema.models.get(call.model);
      if (!fields) continue;
      for (const entry of topLevelKeys(call.argument)) {
        if (entry.key !== 'orderBy') continue;
        const nested = sliceObject(call.argument, entry.valueAt);
        if (!nested) continue;
        for (const inner of topLevelKeys(nested)) {
          if (!fields.has(inner.key)) {
            problems.push(`${call.file}: ${call.model}.orderBy.${inner.key} no existe`);
          }
        }
      }
    }
    assert.deepEqual([...new Set(problems)], []);
  });
});

/**
 * Campos de `data` y de `where`.
 *
 * ---------------------------------------------------------------------------
 * Por que se anadio esto
 * ---------------------------------------------------------------------------
 * En la v1.2.0 una edicion del esquema **borro `Competition.handicapRuleVersion`**
 * sin querer, y este archivo no lo detecto: comprobaba `select`, `include` y
 * `orderBy`, pero no `data` ni `where`, que es justo donde se escribia el campo.
 * El fallo aparecio en el `tsc` del despliegue, con un mensaje que hablaba de
 * `CompetitionUpdateInput` y no de un campo borrado.
 *
 * Las claves del primer nivel de `data` y de `where` pertenecen al MISMO modelo
 * de la llamada, asi que se pueden comprobar sin resolver relaciones. Las de
 * `update`, `create` y `data` dentro de un `upsert` tambien: son el mismo
 * modelo.
 *
 * Los operadores de Prisma no son campos y se excluyen por nombre. La lista es
 * explicita a proposito: si Prisma anade uno nuevo, este test falla y hay que
 * mirarlo, que es preferible a un filtro laxo que deje pasar una errata.
 */
const PRISMA_OPERATORS = new Set([
  'AND',
  'OR',
  'NOT',
  'connect',
  'connectOrCreate',
  'disconnect',
  'set',
  'update',
  'updateMany',
  'upsert',
  'create',
  'createMany',
  'delete',
  'deleteMany',
  'increment',
  'decrement',
  'multiply',
  'divide',
  'push',
]);

/**
 * Claves de un objeto literal, ignorando lo que solo LO PARECE.
 *
 * `topLevelKeys` basta para `select` e `include`, donde los valores son `true`.
 * Para `data` y `where` no: ahi hay cadenas, plantillas, comentarios y
 * ternarios, y los cuatro producen falsos positivos.
 *
 *   identifier: `ip:${ip}`                  ->  "ip" parecia una clave
 *   confirmedAt: isClear ? null : new Date() ->  "null" parecia una clave
 *   // Un hoyo vacio NO esta confirmado: ... ->  "confirmado" parecia una clave
 *
 * Los tres salieron en la primera version de este guardian. Un falso positivo
 * en un guardian es peor que un hueco conocido: se acaba ignorando el test
 * entero.
 *
 * Asi que primero se borran comentarios y contenido de literales, y despues solo
 * cuenta como clave lo que va precedido de `{` o de `,`, que es como se escribe
 * una clave de verdad y no como aparece la rama de un ternario.
 */
function objectFieldKeys(objectSource: string): string[] {
  // 1. Fuera los comentarios.
  let clean = objectSource.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  // 2. Fuera el contenido de cadenas y plantillas, conservando la longitud para
  //    no desplazar nada.
  clean = clean.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, (literal) => ' '.repeat(literal.length));

  const keys: string[] = [];
  let depth = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (char === '{' || char === '[' || char === '(') {
      depth += 1;
      continue;
    }
    if (char === '}' || char === ']' || char === ')') {
      depth -= 1;
      continue;
    }
    if (depth !== 1) continue;

    const key = /^(\w+)\s*:/.exec(clean.slice(i));
    if (!key) continue;

    // 3. Una clave va detras de `{` o de `,`. La rama de un ternario, detras de
    //    `?`, y por eso no cuenta.
    let back = i - 1;
    while (back >= 0 && /\s/.test(clean[back])) back -= 1;
    const previous = back >= 0 ? clean[back] : '{';

    if (previous === '{' || previous === ',') keys.push(key[1]);
    i += key[0].length - 1;
  }

  return keys;
}

describe('campos de data y where', () => {
  /** Objetos que llevan campos del modelo de la llamada, y nada mas. */
  const FIELD_HOLDERS = new Set(['data', 'where', 'create', 'update']);

  test('toda clave de data, where, create y update existe en el modelo', () => {
    const problems: string[] = [];

    for (const call of calls) {
      if (!call.argument) continue;
      const fields = schema.models.get(call.model);
      if (!fields) continue;

      for (const entry of topLevelKeys(call.argument)) {
        if (!FIELD_HOLDERS.has(entry.key)) continue;

        const nested = sliceObject(call.argument, entry.valueAt);
        if (!nested) continue;

        for (const inner of objectFieldKeys(nested)) {
          // Una clave compuesta dentro de un `where` no es un campo: es el
          // nombre que Prisma da a un @@unique de varias columnas.
          if (schema.compoundKeys.has(inner)) continue;
          if (PRISMA_OPERATORS.has(inner)) continue;
          if (fields.has(inner)) continue;

          problems.push(
            `${call.file}: ${call.model}.${entry.key}.${inner} no existe (${call.operation})`,
          );
        }
      }
    }

    assert.deepEqual(
      [...new Set(problems)],
      [],
      'estos campos se escriben y no estan en el esquema: el build fallara en tsc',
    );
  });

  test('se han encontrado objetos data o where que comprobar', () => {
    // Sin esto, un fallo del analisis dejaria el guardian pasando en vacio, que
    // es la forma mas silenciosa que tiene un test de no servir para nada.
    let found = 0;
    for (const call of calls) {
      if (!call.argument) continue;
      for (const entry of topLevelKeys(call.argument)) {
        if (FIELD_HOLDERS.has(entry.key)) found += 1;
      }
    }
    assert.ok(found > 30, `solo ${found} objetos de campos encontrados`);
  });
});

describe('valores de enum', () => {
  test('todo literal en mayusculas asignado a un campo de enum existe', () => {
    // Solo en archivos que hablan con Prisma, y solo en los campos que el
    // esquema declara como enum. Las uniones de tipos del dominio usan valores
    // parecidos (IN_FLIGHT, RECOVERED) y no tienen nada que ver.
    const enumFields = [
      'role',
      'teeColor',
      'category',
      'modality',
      'sourceType',
      'handicapRoundingPolicy',
      'classificationStatus',
    ];
    const problems: string[] = [];

    for (const file of prismaFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const field of enumFields) {
        const pattern = new RegExp(`\\b${field}:\\s*'([A-Z][A-Z_]+)'`, 'g');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
          if (!schema.enumValues.has(match[1])) {
            problems.push(`${relative(ROOT, file)}: ${field}: '${match[1]}'`);
          }
        }
      }
    }

    assert.deepEqual([...new Set(problems)], []);
  });
});
