/**
 * Guardian de fronteras de empaquetado.
 *
 * Nacio de un build fallido en Vercel:
 *
 *   UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
 *   Import trace: node:crypto <- ./src/lib/auth/session.ts
 *
 * El middleware de Next corre en el runtime EDGE, donde webpack no resuelve los
 * modulos de Node. `src/middleware.ts` importaba el nombre de la cookie de
 * `session.ts`, y con el se arrastraba `node:crypto` al empaquetado. El build
 * revento despues de compilar todo lo demas.
 *
 * Es una clase de error que los tests de unidad NO detectan: cada modulo
 * funciona perfectamente por separado, el problema es DONDE acaba empaquetado.
 * Por eso este archivo no prueba comportamiento: recorre el grafo de
 * importaciones y comprueba fronteras.
 *
 * Dos fronteras:
 *
 *   1. Desde `src/middleware.ts` no se puede alcanzar ningun `node:`, ni Prisma,
 *      ni `next/headers`. El middleware corre en edge.
 *   2. Desde un componente `'use client'` tampoco, con una excepcion: el
 *      recorrido se detiene en los archivos `'use server'`, porque una server
 *      action es una frontera. El cliente recibe una referencia, no el codigo.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** Lo que no puede aparecer en un empaquetado de edge ni de cliente. */
const FORBIDDEN_EXACT = ['@prisma/client', 'next/headers', 'next/cache'];

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // paquete externo: se comprueba por nombre, no se recorre

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specs: string[] = [];

  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g,
    /await import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      specs.push(match[1]);
    }
  }
  return specs;
}

function directiveOf(file: string): 'client' | 'server' | null {
  const head = readFileSync(file, 'utf8').slice(0, 600);
  if (head.includes("'use server'")) return 'server';
  if (head.includes("'use client'")) return 'client';
  return null;
}

interface Finding {
  spec: string;
  trace: string[];
}

function walkGraph(entry: string, stopAtServerActions: boolean): Finding[] {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  const queue: Array<[string, string[]]> = [[entry, [entry]]];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const [file, trace] = next;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const spec of importsOf(file)) {
      if (spec.startsWith('node:') || FORBIDDEN_EXACT.includes(spec)) {
        findings.push({ spec, trace: trace.map((f) => relative(ROOT, f)) });
        continue;
      }
      const target = resolveImport(spec, file);
      if (!target) continue;
      if (stopAtServerActions && directiveOf(target) === 'server') continue;
      queue.push([target, [...trace, target]]);
    }
  }

  return findings;
}

function listFiles(dir: string, accept: (file: string) => boolean): string[] {
  const out: string[] = [];
  const recurse = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) recurse(full);
      else if (accept(full)) out.push(full);
    }
  };
  recurse(dir);
  return out;
}

const describeFinding = (finding: Finding) =>
  `${finding.spec} via ${finding.trace.join(' -> ')}`;

describe('frontera del runtime edge (middleware)', () => {
  const middleware = join(SRC, 'middleware.ts');

  test('el middleware existe', () => {
    assert.ok(existsSync(middleware));
  });

  test('desde el middleware no se alcanza ningun modulo de Node ni Prisma', () => {
    const findings = walkGraph(middleware, false);
    assert.deepEqual(
      findings.map(describeFinding),
      [],
      'el middleware corre en edge: webpack no resuelve estos modulos y el build falla',
    );
  });

  test('el nombre de la cookie se importa del modulo puro, no de session.ts', () => {
    // Regresion del build que fallo: `session.ts` arrastra node:crypto.
    const source = readFileSync(middleware, 'utf8');
    assert.match(source, /from '@\/lib\/auth\/cookie'/);
    assert.equal(
      /from '@\/lib\/auth\/session'/.test(source),
      false,
      'importar de session.ts vuelve a meter node:crypto en el empaquetado de edge',
    );
  });

  test('cookie.ts no importa nada de Node', () => {
    const findings = walkGraph(join(SRC, 'lib/auth/cookie.ts'), false);
    assert.deepEqual(findings.map(describeFinding), []);
  });
});

describe('frontera del cliente', () => {
  const clientFiles = listFiles(
    SRC,
    (file) =>
      (file.endsWith('.ts') || file.endsWith('.tsx')) &&
      !file.includes('__tests__') &&
      readFileSync(file, 'utf8').includes("'use client'"),
  );

  test('hay componentes de cliente que comprobar', () => {
    assert.ok(clientFiles.length > 5, `solo ${clientFiles.length} componentes de cliente`);
  });

  test('ningun componente de cliente arrastra Node, Prisma o next/headers', () => {
    const findings: string[] = [];
    for (const file of clientFiles) {
      for (const finding of walkGraph(file, true)) {
        findings.push(describeFinding(finding));
      }
    }
    assert.deepEqual(
      findings,
      [],
      'estos modulos no existen en el navegador: el build falla o revienta en tiempo de ejecucion',
    );
  });
});

describe('las rutas que usan pdf-lib o sharp declaran runtime nodejs', () => {
  const routeFiles = listFiles(SRC, (file) => file.endsWith('route.ts'));

  test('hay rutas que comprobar', () => {
    assert.ok(routeFiles.length > 5, `solo ${routeFiles.length} rutas`);
  });

  test('toda ruta que exporte un PDF o una imagen corre en Node', () => {
    // pdf-lib y sharp no funcionan en edge. Sin `runtime = 'nodejs'` la ruta
    // falla al desplegar, no al compilar, que es peor.
    const missing: string[] = [];
    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf8');
      const usesNodeOnly = /export\/(pdf|svg)|buildLeaderboardPdf|buildScorecardPdf|rasterizeSvgToPng|getAuditLog/.test(
        source,
      );
      if (usesNodeOnly && !/export const runtime = 'nodejs'/.test(source)) {
        missing.push(relative(ROOT, file));
      }
    }
    assert.deepEqual(missing, [], 'estas rutas necesitan runtime nodejs');
  });
});

/**
 * Variables de entorno declaradas contra variables usadas.
 *
 * Nace de un fallo real: `.env.example` y tres documentos pedian `AUTH_SECRET`,
 * y el codigo no la leia en ningun sitio. Peor: el diagnostico la marcaba como
 * bloqueante, asi que decia que faltaba algo para arrancar cuando no hacia
 * ninguna falta.
 *
 * Una lista de variables con entradas fantasma hace que nadie se fie de la
 * lista, que es justo lo contrario de para lo que existe.
 */
describe('variables de entorno', () => {
  const root = ROOT;

  function declaredInExample(): string[] {
    const example = readFileSync(join(root, '.env.example'), 'utf8');
    return [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
  }

  function readInCode(): Set<string> {
    const found = new Set<string>();
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          scan(full);
          continue;
        }
        if (!full.endsWith('.ts') && !full.endsWith('.tsx')) continue;
        const source = readFileSync(full, 'utf8');
        for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
          found.add(match[1]);
        }
        for (const match of source.matchAll(/env\("([A-Z][A-Z0-9_]*)"\)/g)) {
          found.add(match[1]);
        }
      }
    };
    scan(join(root, 'src'));
    scan(join(root, 'prisma'));
    // El esquema de Prisma tambien declara variables con env("...").
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
    for (const match of schema.matchAll(/env\("([A-Z][A-Z0-9_]*)"\)/g)) found.add(match[1]);
    return found;
  }

  test('hay variables declaradas que comprobar', () => {
    assert.ok(declaredInExample().length >= 3, 'la plantilla de entorno esta vacia');
  });

  test('toda variable de .env.example se lee en el codigo', () => {
    const used = readInCode();
    const phantom = declaredInExample().filter((name) => !used.has(name));
    assert.deepEqual(
      phantom,
      [],
      'estas variables se piden y no se usan: pedirlas hace que nadie se fie de la lista',
    );
  });

  test('AUTH_SECRET no ha vuelto', () => {
    // Las sesiones no firman nada: token opaco aleatorio y SHA-256 en la base.
    assert.equal(readInCode().has('AUTH_SECRET'), false);
    assert.equal(declaredInExample().includes('AUTH_SECRET'), false);
  });
});

/**
 * El diagnostico no puede filtrar credenciales.
 *
 * Es publico, porque se necesita justo cuando la autenticacion no funciona. A
 * cambio, su salida tiene que estar saneada: un mensaje de Prisma puede llevar
 * la cadena de conexion dentro.
 */
describe('saneado del diagnostico', () => {
  test('borra cadenas de conexion, contrasenas y hashes', async () => {
    const { sanitizeErrorDetail } = await import('@/lib/data/sanitize');

    const message = sanitizeErrorDetail(
      new Error(
        'Cannot reach postgresql://usuario:secreto@ep-algo.neon.tech/db?sslmode=require password=abc123',
      ),
    );
    assert.equal(message.includes('secreto'), false);
    assert.equal(message.includes('abc123'), false);
    assert.equal(message.includes('neon.tech'), false);
    assert.match(message, /cadena de conexion oculta/);

    const conHash = sanitizeErrorDetail(
      new Error('duplicate key value: $scrypt$N=32768,r=8,p=1$AAAA$BBBB'),
    );
    assert.equal(conHash.includes('scrypt'), false);
    assert.match(conHash, /hash oculto/);
  });

  test('deja pasar lo que si hace falta para arreglar el problema', async () => {
    const { sanitizeErrorDetail } = await import('@/lib/data/sanitize');
    const message = sanitizeErrorDetail(
      new Error('The column `User.defaultColor` does not exist in the current database.'),
    );
    assert.match(message, /User\.defaultColor/);
    assert.match(message, /does not exist/);
  });

  test('nunca lanza y recorta', async () => {
    const { sanitizeErrorDetail, MAX_DETAIL_LENGTH } = await import('@/lib/data/sanitize');
    for (const input of [null, undefined, 0, '', {}, [], new Error('')]) {
      assert.doesNotThrow(() => sanitizeErrorDetail(input));
    }
    assert.ok(sanitizeErrorDetail(new Error('x'.repeat(5000))).length <= MAX_DETAIL_LENGTH);
  });

  test('el codigo de error de Prisma se extrae sin exponer nada mas', async () => {
    const { errorCode } = await import('@/lib/data/sanitize');
    const prismaError = Object.assign(new Error('...'), { code: 'P2021' });
    assert.equal(errorCode(prismaError), 'P2021');
    assert.equal(errorCode(new Error('sin codigo')), null);
    assert.equal(errorCode(null), null);
  });

  test('la sonda de login aborta su transaccion: no deja filas', () => {
    const source = readFileSync(join(ROOT, 'src/lib/data/health.ts'), 'utf8');
    assert.match(source, /class Rollback extends Error/);
    assert.match(source, /throw new Rollback\(\)/);
    assert.match(source, /if \(!\(error instanceof Rollback\)\)/);
  });

  test('el saneado vive sin Prisma: se puede probar sin base de datos', () => {
    const source = readFileSync(join(ROOT, 'src/lib/data/sanitize.ts'), 'utf8');
    assert.equal(source.includes('@prisma/client'), false);
    assert.equal(source.includes("from '../db'"), false);
  });
});

/**
 * La version que responde tiene que ser visible y no desincronizarse.
 *
 * Nace de una confusion real: el diagnostico decia "ready: true" y la
 * aplicacion seguia fallando, y la unica forma de saber que version estaba
 * desplegada era deducirlo por los campos que traia la respuesta.
 */
describe('version de la aplicacion', () => {
  test('APP_VERSION coincide con package.json', async () => {
    const { APP_VERSION } = await import('@/lib/version');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      version: string;
    };
    assert.equal(
      APP_VERSION,
      pkg.version,
      'src/lib/version.ts se ha desincronizado de package.json',
    );
  });

  test('todos los caminos de diagnose devuelven la version', () => {
    // Si un solo return se la deja, ese es justo el caso en el que hara falta.
    const source = readFileSync(join(ROOT, 'src/lib/data/health.ts'), 'utf8');
    const diagnose = source.slice(source.indexOf('export async function diagnose'));
    const returns = (diagnose.match(/return \{/g) ?? []).length;
    const withVersion = (diagnose.match(/version: APP_VERSION/g) ?? []).length;
    assert.equal(withVersion, returns, `${returns} returns y ${withVersion} con version`);
  });

  test('version.ts no importa nada: es un dato, no un modulo con dependencias', () => {
    const source = readFileSync(join(ROOT, 'src/lib/version.ts'), 'utf8');
    assert.equal(/^\s*import /m.test(source), false);
  });
});

/**
 * La sonda tiene que cubrir lo que la aplicacion hace de verdad.
 *
 * La primera version solo probaba consultas planas y todas pasaban, mientras la
 * aplicacion seguia fallando: usa `include` anidados, que generan un SQL
 * distinto. El hueco existio porque nadie comprobaba que la sonda y la
 * aplicacion hablasen de lo mismo.
 */
describe('cobertura de la sonda de diagnostico', () => {
  const health = readFileSync(join(ROOT, 'src/lib/data/health.ts'), 'utf8');

  test('la sonda del login cubre las cinco operaciones', () => {
    for (const step of ['ATTEMPTS_READ', 'USER_READ', 'SESSION_READ', 'WRITE_PATH', 'HASH']) {
      assert.match(health, new RegExp(`fail\\('${step}'`), `la sonda no prueba ${step}`);
    }
  });

  test('la sonda posterior al login cubre las consultas con include anidado', () => {
    for (const step of [
      'SESSION_WITH_USER',
      'COMPETITION_WITH_COURSE',
      'SCORECARDS',
      'RANKING',
    ]) {
      assert.match(health, new RegExp(`fail\\('${step}'`), `la sonda no prueba ${step}`);
    }
  });

  test('la sonda llama a las funciones reales, no replica sus consultas', () => {
    // Replicarlas dejaria que se desincronizasen: la sonda pasaria mientras la
    // aplicacion falla, que es exactamente lo que ocurrio.
    assert.match(health, /queries\.getCompetition\(\)/);
    assert.match(health, /queries\.getAllScorecards\(context\)/);
    assert.match(health, /queries\.getRanking\(context\)/);
  });

  test('la sonda posterior no escribe nada', () => {
    const probe = health.slice(
      health.indexOf('export async function probeAppPath'),
      health.indexOf('export async function diagnose'),
    );
    for (const write of ['.create(', '.update(', '.delete(', '.upsert(', '.createMany(']) {
      assert.equal(probe.includes(write), false, `la sonda posterior escribe: ${write}`);
    }
  });

  test('todos los caminos de diagnose devuelven las dos sondas', () => {
    const diagnose = health.slice(health.indexOf('export async function diagnose'));
    const returns = (diagnose.match(/return \{/g) ?? []).length;
    assert.equal((diagnose.match(/loginPath/g) ?? []).length >= returns, true);
    assert.equal((diagnose.match(/appPath/g) ?? []).length >= returns, true);
  });
});

/**
 * Props que cruzan de servidor a cliente.
 *
 * ---------------------------------------------------------------------------
 * Por que existe este bloque
 * ---------------------------------------------------------------------------
 * En el rediseno de la v1.2.0, la tarjeta completa paso de ser un componente de
 * servidor a uno de cliente, y tres pantallas le seguian pasando las distancias
 * de los hoyos como `Map<number, number>`. Mientras el componente era de
 * servidor el `Map` nunca cruzaba ninguna frontera; en cuanto dejo de serlo,
 * tuvo que atravesar el serializador de React.
 *
 * Es una clase de error que ningun test de unidad detecta: el componente
 * funciona perfectamente por separado y el `Map` es el tipo correcto para lo que
 * hace. El problema es DONDE se construye.
 *
 * Este guardian recorre las pantallas de servidor y comprueba que ningun
 * componente de cliente recibe un `Map`, un `Set` o una funcion.
 */
describe('frontera de props: servidor -> cliente', () => {
  /** Componentes exportados desde un archivo `'use client'`. */
  function clientComponents(): Map<string, string> {
    const byName = new Map<string, string>();
    for (const file of listFiles(
      SRC,
      (candidate) =>
        (candidate.endsWith('.tsx') || candidate.endsWith('.ts')) &&
        !candidate.includes('__tests__'),
    )) {
      const source = readFileSync(file, 'utf8');
      if (!source.slice(0, 400).includes("'use client'")) continue;
      for (const match of source.matchAll(/export function (\w+)/g)) {
        byName.set(match[1], relative(ROOT, file));
      }
    }
    return byName;
  }

  /** Pantallas y layouts que corren en el servidor. */
  function serverScreens(): string[] {
    return listFiles(
      join(SRC, 'app'),
      (candidate) => candidate.endsWith('page.tsx') || candidate.endsWith('layout.tsx'),
    ).filter((file) => !readFileSync(file, 'utf8').slice(0, 400).includes("'use client'"));
  }

  const clients = clientComponents();

  test('hay componentes de cliente y pantallas de servidor que comprobar', () => {
    assert.ok(clients.size > 8, `solo ${clients.size} componentes de cliente`);
    assert.ok(serverScreens().length > 8, 'no se han encontrado pantallas de servidor');
  });

  test('ningun componente de cliente recibe un Map, un Set ni una funcion', () => {
    const problems: string[] = [];

    for (const screen of serverScreens()) {
      const source = readFileSync(screen, 'utf8');

      for (const name of clients.keys()) {
        // El uso completo del componente, hasta el cierre de su etiqueta.
        const usage = new RegExp(`<${name}\\b([\\s\\S]{0,1200}?)/?>`, 'g');
        let match: RegExpExecArray | null;

        while ((match = usage.exec(source)) !== null) {
          const props = match[1];

          for (const [pattern, kind] of [
            [/new Map\(/, 'un Map construido en linea'],
            [/new Set\(/, 'un Set construido en linea'],
            // `context.distances` es el Map del contexto de la competicion. Se
            // nombra explicitamente porque es el que provoco el fallo.
            [/\bdistances=\{/, 'las distancias como Map (pasa context.snapshot.holes)'],
            [/=\{\s*\([^)]*\)\s*=>/, 'una funcion'],
            [/=\{\s*function\b/, 'una funcion'],
          ] as Array<[RegExp, string]>) {
            if (pattern.test(props)) {
              problems.push(
                `${relative(ROOT, screen)}: <${name}> recibe ${kind}`,
              );
            }
          }
        }
      }
    }

    assert.deepEqual(
      [...new Set(problems)],
      [],
      'estos valores no atraviesan el serializador de React: la pantalla revienta al renderizar',
    );
  });
});
