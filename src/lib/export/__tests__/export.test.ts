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
  buildCompletePdf,
  buildFlightDrawPdf,
  buildIndividualScorecardsPdf,
  buildLeaderboardPdf,
  buildPairDrawPdf,
  buildPairLeaderboardPdf,
  buildPairScorecardsPdf,
  buildScorecardPdf,
  type CompetitionHeader,
  type FlightDrawDocument,
  type LeaderboardExportRow,
  type PairLeaderboardExportRow,
  type PairScorecardDocument,
  type ScorecardDocument,
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

async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: false }).promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
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

const PAIR_ROWS: PairLeaderboardExportRow[] = [
  {
    pairNumber: 1,
    position: 1,
    isSharedPosition: false,
    displayName: 'Gonzalo Suárez / Pacho Rodríguez-Rey',
    colors: ['#2D4767', '#1F7A4D'],
    scoringMode: 'BEST_BALL',
    isSolo: false,
    handicapIndexTenths: 325,
    playingHandicap: 39,
    points: 44,
    numericStrokes: 79,
    adjustedStrokes: 79,
    pickups: 0,
    holesCompleted: 18,
    holesAvailable: 18,
    progressPercent: 100,
  },
  {
    pairNumber: 2,
    position: 2,
    isSharedPosition: false,
    displayName: 'Tomás Molina / Alfonso Zabala',
    colors: ['#A85F00', '#C8322C'],
    scoringMode: 'BEST_BALL',
    isSolo: false,
    handicapIndexTenths: 480,
    playingHandicap: 58,
    points: 39,
    numericStrokes: 84,
    adjustedStrokes: 91,
    pickups: 1,
    holesCompleted: 18,
    holesAvailable: 18,
    progressPercent: 89,
  },
];

const FLIGHTS: FlightDrawDocument[] = [
  {
    id: 'flight-1',
    name: 'Partido 1',
    order: 1,
    teeTime: '2026-06-13T07:00:00Z',
    status: 'CONFIRMED',
    members: [
      {
        competitionPlayerId: 'p1',
        displayName: 'Gonzalo Suárez',
        color: '#2D4767',
        handicapIndexTenths: 118,
        playingHandicap: 14,
        knowsCourse: true,
      },
      {
        competitionPlayerId: 'p3',
        displayName: 'Tomás Molina',
        color: '#A85F00',
        handicapIndexTenths: 240,
        playingHandicap: 29,
        knowsCourse: false,
      },
    ],
  },
  {
    id: 'flight-2',
    name: 'Partido 2',
    order: 2,
    teeTime: '2026-06-13T07:10:00Z',
    status: 'CONFIRMED',
    members: [
      {
        competitionPlayerId: 'p2',
        displayName: 'Pacho Rodríguez-Rey',
        color: '#1F7A4D',
        handicapIndexTenths: 207,
        playingHandicap: 25,
        knowsCourse: false,
      },
      {
        competitionPlayerId: 'p4',
        displayName: 'Alfonso Zabala',
        color: '#C8322C',
        handicapIndexTenths: 240,
        playingHandicap: 29,
        knowsCourse: true,
      },
    ],
  },
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
    assert.match(text, /individual stableford/i);
    assert.match(text, /13 de junio de 2026/);
    assert.match(text, /Slope 139/);
    assert.match(text, /Par 72/);
    assert.match(text, /95 %/);
    assert.match(text, /Clasificación individual final/);
  });

  test('incluye posicion, nombre, hándicap, HJ, puntos y golpes de cada jugador', async () => {
    const bytes = await buildLeaderboardPdf({ header: HEADER, rows: ROWS, request: PUBLISHED });
    const text = await extractPdfText(bytes);

    for (const row of ROWS) {
      assert.match(text, new RegExp(row.displayName.replace(/[-]/g, '\\-')));
      assert.match(text, new RegExp(formatHandicap(row.handicapIndexTenths).replace(',', ',')));
    }
    assert.match(text, /39/);
    assert.match(text, /Clasificación individual final/);
    assert.match(text, /pts/);
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
    assert.match(text, /Clasificación individual provisional/);
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

  test('incluye de forma discreta la seed confirmada del sorteo de partidos', async () => {
    const seed = 'partidos-oficiales-2026';
    const bytes = await buildLeaderboardPdf({
      header: HEADER,
      rows: ROWS,
      request: PUBLISHED,
      flightDrawSeed: seed,
    });
    const text = await extractPdfText(bytes);
    assert.match(text, /Semilla de los partidos de esta clasificación/);
    assert.match(text, new RegExp(seed));
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

  function officialDocuments(): {
    cards: ScorecardDocument[];
    pairs: PairScorecardDocument[];
  } {
    const firstPlayed: Record<number, number> = {};
    const secondPlayed: Record<number, number> = {};
    for (const hole of ULZAMA_HOLES) {
      firstPlayed[hole.holeNumber] = hole.par;
      secondPlayed[hole.holeNumber] = hole.par + 1;
    }
    const first = build(firstPlayed);
    const second = build(secondPlayed);
    const cards: ScorecardDocument[] = [
      {
        player: {
          displayName: 'Gonzalo Suárez',
          color: '#2D4767',
          handicapIndexTenths: 118,
          playingHandicap: 14,
          flightName: 'Partido 1',
          teeTime: '2026-06-13T07:00:00Z',
          status: 'LOCKED',
        },
        results: first.results,
        totals: first.totals,
      },
      {
        player: {
          displayName: 'Pacho Rodríguez-Rey',
          color: '#1F7A4D',
          handicapIndexTenths: 207,
          playingHandicap: 25,
          flightName: 'Partido 2',
          teeTime: '2026-06-13T07:10:00Z',
          status: 'LOCKED',
        },
        results: second.results,
        totals: second.totals,
      },
    ];
    const pair: PairScorecardDocument = {
      pairNumber: 1,
      displayName: 'Gonzalo Suárez / Pacho Rodríguez-Rey',
      colors: ['#2D4767', '#1F7A4D'],
      scoringMode: 'BEST_BALL',
      isSolo: false,
      handicapIndexTenths: 325,
      playingHandicap: 39,
      points: first.totals.total.points,
      members: [
        {
          competitionPlayerId: 'p1',
          displayName: 'Gonzalo Suárez',
          color: '#2D4767',
          handicapIndexTenths: 118,
          playingHandicap: 14,
          flightName: 'Partido 1',
          status: 'LOCKED',
          results: first.results,
          totals: first.totals,
        },
        {
          competitionPlayerId: 'p2',
          displayName: 'Pacho Rodríguez-Rey',
          color: '#1F7A4D',
          handicapIndexTenths: 207,
          playingHandicap: 25,
          flightName: 'Partido 2',
          status: 'LOCKED',
          results: second.results,
          totals: second.totals,
        },
      ],
      results: first.results,
      totals: first.totals,
      sources: first.results.map((result) => ({
        holeNumber: result.holeNumber,
        competitionPlayerId: 'p1',
        displayName: 'Gonzalo Suárez',
        shortLabel: 'GS',
        color: '#2D4767',
      })),
    };
    return { cards, pairs: [pair] };
  }

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
    assert.match(text, /Puntos|puntos/);
    assert.match(text, /523/); // distancia del hoyo 5
    assert.match(text, /IDA/);
    assert.match(text, /VUELTA/);
    assert.match(text, /18\/18/);
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
    assert.match(text, /raya/i);
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

  test('las tarjetas individuales se maquetan una por pagina A4', async () => {
    const { cards } = officialDocuments();
    const bytes = await buildIndividualScorecardsPdf({
      header: HEADER,
      cards,
      distances,
      generatedAt: new Date('2026-06-13T18:00:00Z'),
    });
    assert.equal(await countPdfPages(bytes), cards.length);
    const text = await extractPdfText(bytes);
    assert.match(text, /Gonzalo Suárez/);
    assert.match(text, /Pacho Rodríguez-Rey/);
  });

  test('la tarjeta de mejor bola es unica e identifica quien aporta cada hoyo', async () => {
    const { pairs } = officialDocuments();
    const bytes = await buildPairScorecardsPdf({
      header: HEADER,
      pairs,
      distances,
      generatedAt: new Date('2026-06-13T18:00:00Z'),
    });
    assert.equal(await countPdfPages(bytes), 1);
    const text = await extractPdfText(bytes);
    assert.match(text, /Pareja 1 · mejor bola/);
    assert.match(text, /Jugador/);
    assert.match(text, /GS/);
  });

  test('la modalidad por suma conserva las dos tarjetas, una por pagina', async () => {
    const { pairs } = officialDocuments();
    const combined: PairScorecardDocument = {
      ...pairs[0],
      scoringMode: 'COMBINED_POINTS',
      points: pairs[0].members.reduce((sum, member) => sum + member.totals.total.points, 0),
      results: null,
      totals: null,
      sources: [],
    };
    const bytes = await buildPairScorecardsPdf({
      header: HEADER,
      pairs: [combined],
      distances,
      generatedAt: new Date('2026-06-13T18:00:00Z'),
    });
    assert.equal(await countPdfPages(bytes), 2);
    const text = await extractPdfText(bytes);
    assert.match(text, /Pareja 1 · integrante 1 de 2/);
    assert.match(text, /Pareja 1 · integrante 2 de 2/);
    assert.match(text, /Gonzalo Suárez/);
    assert.match(text, /Pacho Rodríguez-Rey/);
    assert.match(text, /Suma de puntos individuales/);
  });

  test('el participante individual x2 genera una unica tarjeta derivada', async () => {
    const { pairs } = officialDocuments();
    const member = pairs[0].members[0];
    const doubledResults = member.results.map((result) => ({
      ...result,
      stablefordPoints: result.stablefordPoints * 2,
    }));
    const doubledTotals = computeTotals(doubledResults);
    const solo: PairScorecardDocument = {
      pairNumber: 7,
      displayName: member.displayName,
      colors: [member.color],
      scoringMode: 'COMBINED_POINTS',
      isSolo: true,
      handicapIndexTenths:
        member.handicapIndexTenths === null ? null : member.handicapIndexTenths * 2,
      playingHandicap: member.playingHandicap === null ? null : member.playingHandicap * 2,
      points: doubledTotals.total.points,
      members: [member],
      results: doubledResults,
      totals: doubledTotals,
      sources: [],
    };
    const bytes = await buildPairScorecardsPdf({
      header: HEADER,
      pairs: [solo],
      distances,
      generatedAt: new Date('2026-06-13T18:00:00Z'),
    });
    assert.equal(await countPdfPages(bytes), 1);
    const text = await extractPdfText(bytes);
    assert.match(text, /Equipo 7 · individual x2/);
    assert.match(text, /puntos x2/);
    assert.match(text, /Suma de puntos individuales/);
  });

  test('el PDF del sorteo de partidos deja la seed despues de todos los partidos', async () => {
    const seed = 'seed-partidos-123';
    const bytes = await buildFlightDrawPdf({ header: HEADER, flights: FLIGHTS, seed });
    const text = await extractPdfText(bytes);
    assert.ok(text.lastIndexOf(seed) > text.lastIndexOf('Partido 2'));
    assert.match(text, /Semilla del sorteo de partidos/);
  });

  test('clasificacion y sorteo de parejas conservan su seed independiente', async () => {
    const seed = 'seed-parejas-456';
    const leaderboard = await buildPairLeaderboardPdf({
      header: HEADER,
      rows: PAIR_ROWS,
      scoringMode: 'BEST_BALL',
      request: PUBLISHED,
      pairDrawSeed: seed,
    });
    const leaderboardText = await extractPdfText(leaderboard);
    assert.match(leaderboardText, /Clasificación por parejas final/);
    assert.match(leaderboardText, /Dobles · mejor bola Stableford/);
    assert.match(leaderboardText, new RegExp(seed));

    const { pairs } = officialDocuments();
    const draw = await buildPairDrawPdf({ header: HEADER, pairs, seed });
    const drawText = await extractPdfText(draw);
    assert.ok(drawText.lastIndexOf(seed) > drawText.lastIndexOf('Pareja 1'));
  });

  test('el dossier completo ordena secciones y coloca cada seed en su sorteo', async () => {
    const { cards, pairs } = officialDocuments();
    const flightSeed = 'flight-seed-complete';
    const pairSeed = 'pair-seed-complete';
    const bytes = await buildCompletePdf({
      header: HEADER,
      request: PUBLISHED,
      individualRows: ROWS,
      individualCards: cards,
      flights: FLIGHTS,
      flightDrawSeed: flightSeed,
      pairRows: PAIR_ROWS,
      pairs,
      pairScoringMode: 'BEST_BALL',
      pairDrawSeed: pairSeed,
      distances,
      generatedAt: new Date('2026-06-13T18:00:00Z'),
    });
    const text = await extractPdfText(bytes);
    assert.match(text, /Dossier oficial del campeonato/);
    assert.match(text, /Sorteo de partidos/);
    assert.match(text, /Clasificación individual final/);
    assert.match(text, /Tarjetas individuales/);
    assert.match(text, /Sorteo de parejas/);
    assert.match(text, /Clasificación por parejas final/);
    assert.match(text, /Tarjetas de parejas/);
    assert.ok(text.indexOf(flightSeed) > text.indexOf('Sorteo de partidos'));
    assert.ok(text.indexOf(pairSeed) > text.indexOf('Sorteo de parejas'));
    assert.ok((await countPdfPages(bytes)) >= 8);
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
