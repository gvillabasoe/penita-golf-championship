import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Impide compilar una mezcla de codigo antiguo y esquema nuevo.
 *
 * La migracion 006 elimina las tablas auxiliares de la presentacion progresiva.
 * Si queda una consulta antigua en el codigo, Prisma compila correctamente pero
 * la aplicacion falla en ejecucion con P2021. Este control convierte ese fallo
 * tardio en un error de build claro y accionable.
 */

const root = process.cwd();
const sourceRoots = [
  'src',
  'prisma/schema.prisma',
  'prisma/sql/schema.sql',
  'prisma/sql/constraints.sql',
];

const forbidden = [
  { token: 'classificationReveal', label: 'cliente Prisma heredado' },
  { token: 'ClassificationReveal', label: 'modelo o tabla heredada' },
  { token: 'RankingSnapshot', label: 'snapshot heredado' },
  { token: 'REVEALING', label: 'estado heredado' },
];

async function collect(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const stats = await import('node:fs/promises').then(({ stat }) => stat(absolutePath));

  if (stats.isFile()) return [relativePath];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(child)));
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs|prisma|sql)$/.test(entry.name)) files.push(child);
  }

  return files;
}

const files = (await Promise.all(sourceRoots.map(collect))).flat();
const findings = [];

for (const relativePath of files) {
  const content = await readFile(path.join(root, relativePath), 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const item of forbidden) {
      if (line.includes(item.token)) {
        findings.push(`${relativePath}:${index + 1} - ${item.label}: ${item.token}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error('\nERROR: el repositorio conserva referencias al sistema de publicacion eliminado.');
  console.error('No se debe desplegar esta mezcla de codigo y base de datos.\n');
  findings.forEach((finding) => console.error(`  ${finding}`));
  console.error('\nAplica el hotfix completo, elimina los archivos heredados y vuelve a compilar sin cache.\n');
  process.exit(1);
}

console.log('OK: publicacion directa verificada; no quedan referencias heredadas activas.');
