import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { canExport, ExportNotAllowedError, type ExportRequest } from '../guards';
import {
  escapeXml,
  formatDate,
  formatHandicap,
  isLossless,
  REPLACEMENT_CHARACTER,
  sanitizeForPdf,
  truncate,
} from '../text';
import {
  buildLeaderboardPdf,
  buildScorecardPdf,
  type CompetitionHeader,
  type LeaderboardExportRow,
} from '../pdf';
import { buildLeaderboardSvg, rasterizeSvgToPng } from '../svg';

import { ULZAMA_HOLES } from '../../golf/course';
import { allocateStrokes } from '../../golf/strokes';
import { computeTotals, resolveScorecard, type HoleScoreInput } from '../../golf/stableford';

/** Extrae todo el texto de un PDF con pdfjs, para comprobar lo que se genero. */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    chunks.push(
      content.items
        .map((item) => ('str' in item ? (item as { str: string }).str : ''))
        .join(' '),
    );
  }
  await doc.destroy();
  return chunks.join('\n');
}

const HEADER: CompetitionHeader = {
  name: 'Peñita Golf Championship',
  edition: 'I Peñita Golf Championship – Ulzama-Bariain 2026',
  courseName: 'Club de Golf Ulzama',
  routeName: 'Ulzama',
  teeColor: 'AMARILLAS',
  category: 'CABALLEROS',
  modality: 'INDIVIDUAL_STABLEFORD',
  date: '2026-06-13T07:00:00Z',
  slopeRating: 139,
  courseRatingTenths: 726,
  parTotal: 72,
  handicapAllowancePercent: 95,
  handicapRuleVersion: 'WHS-ES;allowance=95;rounding=ROUND_TWICE',
};

const ROWS: LeaderboardExportRow[] = [
  { position: 1, isSharedPosition: false, displayName: 'Gonzalo Suárez', handicapIndexTenths: 118, playingHandicap: 14, points: 39, numericStrokes: 86, adjustedStrokes: 86, pickups: 0 },
  { position: 2, isSharedPosition: false, displayName: 'Pacho Rodríguez-Rey', handicapIndexTenths: 207, playingHandicap: 25, points: 37, numericStrokes: 95, adjustedStrokes: 102, pickups: 1 },
  { position: 3, isSharedPosition: true, displayName: 'Tomás Molina', handicapIndexTenths: 240, playingHandicap: 29, points: 34, numericStrokes: 99, adjustedStrokes: 99, pickups: 0 },
  { position: 3, isSharedPosition: true, displayName: 'Alfonso Zabala', handicapIndexTenths: 240, playingHandicap: 29, points: 34, numericStrokes: 99, adjustedStrokes: 99, pickups: 0 },
];

const PUBLISHED: ExportRequest = {
  kind: 'LEADERBOARD_FINAL',
  role: 'PLAYER',
  classificationStatus: 'PUBLISHED',
};

describe('saneado de texto para PDF', () => {
  test('respeta acentos, enye y guiones de los nombres reales', () => {
    for (const name of ['Gonzalo Suárez', 'Pacho Rodríguez-Rey', 'Tomás Molina', 'Peñita']) {
      assert.equal(sanitizeForPdf(name), name);
      assert.equal(isLossless(name), true);
    }
  });

  test('la raya larga de la edicion sobrevive', () => {
    assert.match(sanitizeForPdf(HEADER.edition), /– Ulzama-Bariain 2026$/);
  });

  test('un emoji en una observacion no tumba la exportacion', () => {
    // Este es el caso real: alguien escribe el motivo de una correccion desde el
    // movil y mete un pulgar arriba.
    const nota = 'Confirmado con el partido 👍';
    const sanitized = sanitizeForPdf(nota);
    assert.equal(sanitized.includes('👍'), false);
    assert.match(sanitized, new RegExp(`Confirmado con el partido \\${REPLACEMENT_CHARACTER}`));
    assert.equal(isLossless(nota), false);
  });

  test('translitera lo frecuente en vez de tirarlo', () => {
    assert.equal(sanitizeForPdf('resultado → 5'), 'resultado -> 5');
    assert.equal(sanitizeForPdf('revisado ✓'), 'revisado OK');
    assert.equal(sanitizeForPdf('hcp ≥ 20'), 'hcp >= 20');
  });

  test('nunca lanza, con cualquier entrada', () => {
    const entradas = ['', '   ', 'α β γ', '🏌️‍♂️⛳', '\u0000\u001f', 'a'.repeat(5000), '\n\t\r'];
    for (const entrada of entradas) {
      assert.doesNotThrow(() => sanitizeForPdf(entrada));
    }
    assert.equal(sanitizeForPdf(null as unknown as string), '');
  });

  test('colapsa saltos de linea y espacios dobles', () => {
    assert.equal(sanitizeForPdf('linea uno\nlinea dos'), 'linea uno linea dos');
    assert.equal(sanitizeForPdf('  doble   espacio  '), 'doble espacio');
  });

  test('recorta apellidos largos sin romper la columna', () => {
    assert.equal(truncate('Pacho Rodríguez-Rey', 30), 'Pacho Rodríguez-Rey');
    assert.equal(truncate('Pacho Rodríguez-Rey', 10).length, 10);
    assert.match(truncate('Pacho Rodríguez-Rey', 10), /\.$/);
    assert.throws(() => truncate('x', 1));
  });

  test('escapa XML en el orden correcto', () => {
    assert.equal(escapeXml('a & b'), 'a &amp; b');
    assert.equal(escapeXml('<script>'), '&lt;script&gt;');
    assert.equal(escapeXml('"x" & \'y\''), '&quot;x&quot; &amp; &apos;y&apos;');
    // El ampersand primero: si no, se escaparia el de &lt;
    assert.equal(escapeXml('&lt;'), '&amp;lt;');
  });

  test('formatea hándicaps con la convencion espanola', () => {
    assert.equal(formatHandicap(207), '20,7');
    assert.equal(formatHandicap(0), '0,0');
    assert.equal(formatHandicap(-24), '+2,4');
  });

  test('la fecha no depende de la zona del servidor', () => {
    assert.equal(formatDate('2026-06-13T07:00:00Z'), '13 de junio de 2026');
    assert.equal(formatDate(null), 'Fecha sin definir');
    assert.equal(formatDate('manana'), 'Fecha no valida');
  });
});

describe('permisos de exportacion', () => {
  test('la clasificacion completa NO se exporta antes de publicar, ni siendo admin', () => {
    for (const status of ['HIDDEN', 'REVEALING'] as const) {
      for (const role of ['PLAYER', 'ADMIN'] as const) {
        const decision = canExport({ kind: 'LEADERBOARD_FINAL', role, classificationStatus: status });
        assert.equal(decision.allowed, false, `${role} / ${status} deberia estar bloqueado`);
      }
    }
  });

  test('publicada, cualquiera la exporta', () => {
    const decision = canExport(PUBLISHED);
    assert.equal(decision.allowed, true);
    assert.equal(decision.allowed && decision.requiresProvisionalMark, false);
  });

  test('el provisional es solo del admin y sale marcado obligatoriamente', () => {
    const admin = canExport({
      kind: 'LEADERBOARD_PROVISIONAL',
      role: 'ADMIN',
      classificationStatus: 'HIDDEN',
    });
    assert.equal(admin.allowed, true);
    assert.equal(admin.allowed && admin.requiresProvisionalMark, true);

    const jugador = canExport({
      kind: 'LEADERBOARD_PROVISIONAL',
      role: 'PLAYER',
      classificationStatus: 'HIDDEN',
    });
    assert.equal(jugador.allowed, false);
  });

  test('una vez publicada no se exporta el provisional: hay version definitiva', () => {
    const decision = canExport({
      kind: 'LEADERBOARD_PROVISIONAL',
      role: 'ADMIN',
      classificationStatus: 'PUBLISHED',
    });
    assert.equal(decision.allowed, false);
  });

  test('la tarjeta propia siempre; la de otro partido solo tras publicar', () => {
    const base = {
      kind: 'SCORECARD' as const,
      role: 'PLAYER' as const,
      requesterPlayerId: 'p1',
      requesterFlightId: 'f1',
    };
    assert.equal(
      canExport({ ...base, classificationStatus: 'HIDDEN', targetPlayerId: 'p1', targetFlightId: 'f1' }).allowed,
      true,
    );
    assert.equal(
      canExport({ ...base, classificationStatus: 'HIDDEN', targetPlayerId: 'p2', targetFlightId: 'f1' }).allowed,
      true,
    );
    assert.equal(
      canExport({ ...base, classificationStatus: 'HIDDEN', targetPlayerId: 'p9', targetFlightId: 'f3' }).allowed,
      false,
    );
    assert.equal(
      canExport({ ...base, classificationStatus: 'PUBLISHED', targetPlayerId: 'p9', targetFlightId: 'f3' }).allowed,
      true,
    );
  });

  test('la auditoria y la configuracion del campo son solo del admin', () => {
    for (const kind of ['AUDIT_LOG', 'COURSE_CONFIG'] as const) {
      assert.equal(canExport({ kind, role: 'PLAYER', classificationStatus: 'PUBLISHED' }).allowed, false);
      assert.equal(canExport({ kind, role: 'ADMIN', classificationStatus: 'HIDDEN' }).allowed, true);
    }
  });

  test('los partidos y las horas son publicos: todos necesitan saber cuando salen', () => {
    for (const kind of ['FLIGHTS', 'TEE_TIMES'] as const) {
      assert.equal(canExport({ kind, role: 'PLAYER', classificationStatus: 'HIDDEN' }).allowed, true);
    }
  });
});

describe('PDF de clasificacion', () => {
  test('se genera un PDF valido y con el contenido que exige la seccion 63', async () => {
    const bytes = await buildLeaderboardPdf({ header: HEADER, rows: ROWS, request: PUBLISHED });

    // Cabecera de archivo PDF.
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('latin1'), '%PDF-');
    assert.ok(bytes.length > 1000);

    const text = await extractPdfText(bytes);
    assert.match(text, /Peñita Golf Championship/);
    assert.match(text, /Ulzama-Bariain 2026/);
    assert.match(text, /Club de Golf Ulzama/);
    assert.match(text, /amarillas/);
    assert.match(text, /caballeros/);
    assert.match(text, /individual stableford/);
    assert.match(text, /13 de junio de 2026/);
    assert.match(text, /Slope 139/);
    assert.match(text, /Par 72/);
    assert.match(text, /95 %/);
    assert.match(text, /Clasificacion final/);
  });

  test('incluye posicion, nombre, hándicap, HJ, puntos y golpes de cada jugador', async () => {
    const bytes = await buildLeaderboardPdf({ header: HEADER, rows: ROWS, request: PUBLISHED });
    const text = await extractPdfText(bytes);

    for (const row of ROWS) {
      assert.match(text, new RegExp(row.displayName.replace(/[-]/g, '\\-')));
      assert.match(text, new RegExp(formatHandicap(row.handicapIndexTenths).replace(',', ',')));
    }
    assert.match(text, /39/);
    assert.match(text, /Pos/);
    assert.match(text, /Puntos/);
  });

  test('marca las posiciones compartidas con el signo igual', async () => {
    const bytes = await buildLeaderboardPdf({ header: HEADER, rows: ROWS, request: PUBLISHED });
    const text = await extractPdfText(bytes);
    assert.match(text, /=3/);
  });

  test('el provisional lleva la marca dentro del documento, no como opcion', async () => {
    const bytes = await buildLeaderboardPdf({
      header: HEADER,
      rows: ROWS,
      request: { kind: 'LEADERBOARD_PROVISIONAL', role: 'ADMIN', classificationStatus: 'HIDDEN' },
    });
    const text = await extractPdfText(bytes);
    assert.match(text, /PROVISIONAL/);
    assert.match(text, /NO ES LA CLASIFICACION DEFINITIVA/);
    assert.match(text, /Clasificacion provisional/);
  });

  test('el definitivo NO lleva la marca de provisional', async () => {
    const bytes = await buildLeaderboardPdf({ header: HEADER, rows: ROWS, request: PUBLISHED });
    const text = await extractPdfText(bytes);
    assert.equal(text.includes('PROVISIONAL'), false);
  });

  test('sin permiso no se genera ningun byte', async () => {
    await assert.rejects(
      () =>
        buildLeaderboardPdf({
          header: HEADER,
          rows: ROWS,
          request: { kind: 'LEADERBOARD_FINAL', role: 'ADMIN', classificationStatus: 'HIDDEN' },
        }),
      ExportNotAllowedError,
    );
  });

  test('una observacion con emoji no impide generar el PDF', async () => {
    const conEmoji: LeaderboardExportRow[] = [
      { ...ROWS[0], displayName: 'Gonzalo 👍 Suárez' },
    ];
    const bytes = await buildLeaderboardPdf({
      header: { ...HEADER, edition: 'Edición 🏌️ 2026' },
      rows: conEmoji,
      request: PUBLISHED,
    });
    assert.ok(bytes.length > 1000);
    const text = await extractPdfText(bytes);
    assert.match(text, /Gonzalo/);
    assert.match(text, /Suárez/);
  });

  test('13 jugadores caben y la paginacion no pierde a nadie', async () => {
    const muchos: LeaderboardExportRow[] = Array.from({ length: 13 }, (_, i) => ({
      position: i + 1,
      isSharedPosition: false,
      displayName: `Jugador Numero ${i + 1}`,
      handicapIndexTenths: 100 + i * 10,
      playingHandicap: 12 + i,
      points: 40 - i,
      numericStrokes: 85 + i,
      adjustedStrokes: 85 + i,
      pickups: 0,
    }));
    const bytes = await buildLeaderboardPdf({ header: HEADER, rows: muchos, request: PUBLISHED });
    const text = await extractPdfText(bytes);
    for (const row of muchos) {
      assert.match(text, new RegExp(row.displayName), `falta ${row.displayName}`);
    }
  });
});

describe('PDF de tarjeta', () => {
  const strokes = new Map(allocateStrokes(25, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]));
  const distances = new Map(ULZAMA_HOLES.map((h) => [h.holeNumber, h.distance]));

  const build = (played: Record<number, number | 'RAYA'>) => {
    const inputs = new Map<number, HoleScoreInput>(
      Object.entries(played).map(([h, value]) => [
        Number(h),
        value === 'RAYA'
          ? { holeNumber: Number(h), grossStrokes: null, isPickup: true }
          : { holeNumber: Number(h), grossStrokes: value, isPickup: false },
      ]),
    );
    const results = resolveScorecard(ULZAMA_HOLES, strokes, inputs);
    return { results, totals: computeTotals(results) };
  };

  const player = {
    displayName: 'Pacho Rodríguez-Rey',
    handicapIndexTenths: 207,
    playingHandicap: 25,
    flightName: 'Partido 2',
    teeTime: '2026-06-13T07:10:00Z',
  };

  const request: ExportRequest = {
    kind: 'SCORECARD',
    role: 'PLAYER',
    classificationStatus: 'HIDDEN',
    requesterPlayerId: 'p1',
    targetPlayerId: 'p1',
  };

  test('incluye los 18 hoyos con par, SI, distancia, recibidos, bruto, neto y puntos', async () => {
    const played: Record<number, number> = {};
    for (const h of ULZAMA_HOLES) played[h.holeNumber] = h.par + 1;
    const { results, totals } = build(played);

    const bytes = await buildScorecardPdf({
      header: HEADER,
      player,
      results,
      distances,
      totals,
      request,
    });
    const text = await extractPdfText(bytes);

    assert.match(text, /Pacho Rodríguez-Rey/);
    assert.match(text, /Hándicap exacto 20,7/);
    assert.match(text, /Hándicap de juego 25/);
    assert.match(text, /Partido: Partido 2/);
    assert.match(text, /Hoyo/);
    assert.match(text, /Metros/);
    assert.match(text, /Recibe/);
    assert.match(text, /Puntos/);
    assert.match(text, /523/); // distancia del hoyo 5
    assert.match(text, /Ida:/);
    assert.match(text, /Vuelta:/);
    assert.match(text, /TOTAL/);
  });

  test('vuelta limpia: imprime el resultado bruto respecto al par', async () => {
    const played: Record<number, number> = {};
    for (const h of ULZAMA_HOLES) played[h.holeNumber] = h.par;
    const { results, totals } = build(played);
    const bytes = await buildScorecardPdf({ header: HEADER, player, results, distances, totals, request });
    const text = await extractPdfText(bytes);
    assert.match(text, /Resultado bruto: Par del campo/);
    assert.equal(text.includes('incompleto'), false);
  });

  test('con una raya el PDF NO imprime un bruto: en papel es peor que en pantalla', async () => {
    const played: Record<number, number | 'RAYA'> = {};
    for (const h of ULZAMA_HOLES) played[h.holeNumber] = h.par;
    played[7] = 'RAYA';
    const { results, totals } = build(played);
    const bytes = await buildScorecardPdf({ header: HEADER, player, results, distances, totals, request });
    const text = await extractPdfText(bytes);

    assert.match(text, /Resultado bruto incompleto/);
    // El test original decia /1 rayas/: codificaba el propio error de plural.
    assert.match(text, /1 raya\b/);
    assert.equal(/1 rayas/.test(text), false);
    assert.equal(text.includes('Resultado bruto: '), false);
    assert.match(text, /Raya/);
  });

  test('no se exporta la tarjeta de otro partido antes de publicar', async () => {
    const { results, totals } = build({ 1: 5 });
    await assert.rejects(
      () =>
        buildScorecardPdf({
          header: HEADER,
          player,
          results,
          distances,
          totals,
          request: {
            kind: 'SCORECARD',
            role: 'PLAYER',
            classificationStatus: 'HIDDEN',
            requesterPlayerId: 'p1',
            requesterFlightId: 'f1',
            targetPlayerId: 'p9',
            targetFlightId: 'f3',
          },
        }),
      ExportNotAllowedError,
    );
  });
});

describe('imagen de la clasificacion', () => {
  test('el plural de las rayas se escribe bien en la imagen', () => {
    const conUnaRaya = buildLeaderboardSvg({
      header: HEADER,
      rows: [{ ...ROWS[0], pickups: 1, adjustedStrokes: ROWS[0].numericStrokes + 7 }],
      request: PUBLISHED,
    });
    assert.match(conUnaRaya, /1 raya\b/);
    assert.equal(/1 rayas/.test(conUnaRaya), false);

    const conVarias = buildLeaderboardSvg({
      header: HEADER,
      rows: [{ ...ROWS[0], pickups: 3, adjustedStrokes: ROWS[0].numericStrokes + 21 }],
      request: PUBLISHED,
    });
    assert.match(conVarias, /3 rayas\b/);
  });

  test('la imagen muestra el ajustado solo cuando hay rayas', () => {
    const conRayas = buildLeaderboardSvg({
      header: HEADER,
      rows: [{ ...ROWS[0], pickups: 2, adjustedStrokes: 100 }],
      request: PUBLISHED,
    });
    assert.match(conRayas, /aj\. 100/);

    const sinRayas = buildLeaderboardSvg({
      header: HEADER,
      rows: [{ ...ROWS[0], pickups: 0 }],
      request: PUBLISHED,
    });
    assert.equal(sinRayas.includes('aj.'), false);
  });

  test('la barra de progreso no se solapa con la linea del hándicap', () => {
    // Defecto real detectado mirando el PNG: la barra caia sobre el texto y
    // parecia un subrayado. Se comprueba la separacion vertical.
    const svg = buildLeaderboardSvg({ header: HEADER, rows: ROWS, request: PUBLISHED });
    const metaY = Number(/<text x="150" y="(\d+)" font-size="18"/.exec(svg)?.[1]);
    const barY = Number(/<rect x="150" y="(\d+)" width="\d+" height="6"/.exec(svg)?.[1]);
    assert.ok(metaY > 0 && barY > 0, 'no se encuentran los elementos');
    assert.ok(barY - metaY >= 10, `solo ${barY - metaY} px entre el texto y la barra`);
  });

  test('el SVG se genera sin dependencias y es XML bien formado', () => {
    const svg = buildLeaderboardSvg({ header: HEADER, rows: ROWS, request: PUBLISHED });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<\/svg>$/);
    // Etiquetas abiertas y cerradas cuadran para los elementos con contenido.
    assert.equal((svg.match(/<text/g) ?? []).length, (svg.match(/<\/text>/g) ?? []).length);
    assert.match(svg, /width="1080"/);
  });

  test('escapa el contenido: un nombre con & no rompe el XML', () => {
    const svg = buildLeaderboardSvg({
      header: { ...HEADER, name: 'Peña & Golf <Club>' },
      rows: ROWS,
      request: PUBLISHED,
    });
    assert.match(svg, /Peña &amp; Golf &lt;Club&gt;/);
    assert.equal(svg.includes('<Club>'), false);
  });

  test('incluye a todos los jugadores y el podio va marcado', () => {
    const svg = buildLeaderboardSvg({ header: HEADER, rows: ROWS, request: PUBLISHED });
    for (const row of ROWS) {
      assert.ok(svg.includes(row.displayName), `falta ${row.displayName}`);
    }
    assert.match(svg, /#d4af37/); // oro
    assert.match(svg, /#aeb6bf/); // plata
    assert.match(svg, /#cd7f32/); // bronce
  });

  test('respeta los mismos permisos que el PDF', () => {
    assert.throws(
      () =>
        buildLeaderboardSvg({
          header: HEADER,
          rows: ROWS,
          request: { kind: 'LEADERBOARD_FINAL', role: 'ADMIN', classificationStatus: 'REVEALING' },
        }),
      ExportNotAllowedError,
    );
  });

  test('el provisional lleva la marca tambien en la imagen', () => {
    const svg = buildLeaderboardSvg({
      header: HEADER,
      rows: ROWS,
      request: { kind: 'LEADERBOARD_PROVISIONAL', role: 'ADMIN', classificationStatus: 'HIDDEN' },
    });
    assert.match(svg, /PROVISIONAL/);
  });

  test('crece con el numero de jugadores sin recortar a nadie', () => {
    const muchos: LeaderboardExportRow[] = Array.from({ length: 24 }, (_, i) => ({
      ...ROWS[0],
      position: i + 1,
      displayName: `Jugador ${i + 1}`,
    }));
    const svg = buildLeaderboardSvg({ header: HEADER, rows: muchos, request: PUBLISHED });
    const height = Number(/height="(\d+)"/.exec(svg)?.[1]);
    assert.ok(height >= 300 + 24 * 104, `alto insuficiente: ${height}`);
  });

  test('el SVG se rasteriza a un PNG valido de 1080 de ancho', async () => {
    const svg = buildLeaderboardSvg({ header: HEADER, rows: ROWS, request: PUBLISHED });
    const png = await rasterizeSvgToPng(svg);

    // Firma PNG.
    assert.deepEqual([...png.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

    const sharpModule = await import('sharp');
    const sharp = (sharpModule.default ?? sharpModule) as unknown as (
      b: Buffer,
    ) => { metadata: () => Promise<{ width?: number; height?: number; format?: string }> };
    const metadata = await sharp(Buffer.from(png)).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 1080);
    // El alto se ajusta al contenido: 4 filas caben en el minimo.
    assert.equal(metadata.height, 800);
  });
});
