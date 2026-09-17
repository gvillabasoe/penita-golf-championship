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
