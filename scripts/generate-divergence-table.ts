import { roundingPolicyDivergences, calculateHandicap } from '../src/lib/golf/handicap';
import { ULZAMA_AMARILLAS_CABALLEROS as C } from '../src/lib/golf/course';
import { writeFileSync } from 'node:fs';

const d = roundingPolicyDivergences(C, 95, 0, 540);
const fmt = (t: number) => (t / 10).toFixed(1).replace('.', ',');

// Agrupa tramos contiguos con el mismo par (once, twice) para una tabla legible.
type Band = { from: number; to: number; once: number; twice: number };
const bands: Band[] = [];
for (const row of d) {
  const last = bands[bands.length - 1];
  if (last && last.to === row.handicapIndexTenths - 1 && last.once === row.roundOnce && last.twice === row.roundTwice) {
    last.to = row.handicapIndexTenths;
  } else {
    bands.push({ from: row.handicapIndexTenths, to: row.handicapIndexTenths, once: row.roundOnce, twice: row.roundTwice });
  }
}

const lines = ['| Hándicap exacto | ROUND_ONCE | ROUND_TWICE | Diferencia |', '|---|---|---|---|'];
for (const b of bands) {
  const range = b.from === b.to ? fmt(b.from) : `${fmt(b.from)} – ${fmt(b.to)}`;
  lines.push(`| ${range} | ${b.once} | ${b.twice} | ${b.twice > b.once ? '+1 golpe con WHS' : '−1 golpe con WHS'} |`);
}

writeFileSync('docs/rounding-divergence-table.md',
`# Divergencia entre políticas de redondeo

Campo: Ulzama, amarillas caballeros, Slope 139 / Vc 72,6 / Par 72. Asignación 95 %.
Generado por \`scripts/generate-divergence-table.ts\` a partir del motor, no a mano.

**${d.length} de 541 hándicaps exactos** (0,0 – 54,0) reciben un hándicap de juego
distinto según la política. Agrupados en ${bands.length} tramos contiguos:

${lines.join('\n')}

Siempre un solo golpe de diferencia. ROUND_TWICE (WHS literal) da ${d.filter(x=>x.roundTwice>x.roundOnce).length} veces
un golpe más y ${d.filter(x=>x.roundTwice<x.roundOnce).length} veces un golpe menos.
`);

console.log(`tramos: ${bands.length}, hándicaps afectados: ${d.length}`);
console.log(`WHS da mas golpes en ${d.filter(x=>x.roundTwice>x.roundOnce).length} casos, menos en ${d.filter(x=>x.roundTwice<x.roundOnce).length}`);
// Muestra los tramos que caen en el rango realista de la peña (0 a 36)
const realistas = bands.filter(b => b.from <= 360);
console.log(`tramos dentro de 0,0-36,0: ${realistas.length}`);
