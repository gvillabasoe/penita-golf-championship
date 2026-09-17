/**
 * Exportacion a PDF (seccion 63).
 *
 * Se usa pdf-lib y sus fuentes estandar: JavaScript puro, sin dependencias
 * nativas y sin descargar fuentes en tiempo de ejecucion. Eso importa para
 * Vercel, donde una funcion serverless tiene el disco de solo lectura y un
 * limite de tamano. Nada de navegador sin cabeza ni de rasterizado.
 *
 * Todo el texto pasa por `sanitizeForPdf` antes de dibujarse. Sin eso, un emoji
 * en una observacion lanza una excepcion y tumba la exportacion entera.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { assertCanExport, type ExportRequest } from './guards';
import { formatDate, formatHandicap, sanitizeForPdf, truncate } from './text';
import type { HoleResult, ScorecardTotals } from '../golf/types';

const A4 = { width: 595.28, height: 841.89 } as const;
const MARGIN = 48;

const INK = rgb(0.11, 0.15, 0.13);
const MUTED = rgb(0.33, 0.4, 0.36);
const ACCENT = rgb(0.18, 0.42, 0.27);
const LINE = rgb(0.83, 0.87, 0.83);
const WARNING = rgb(0.71, 0.27, 0.24);

export interface CompetitionHeader {
  name: string;
  edition: string;
  courseName: string;
  routeName: string;
  teeColor: string;
  category: string;
  modality: string;
  /** ISO o null si el administrador aun no la ha fijado. */
  date: string | null;
  slopeRating: number;
  courseRatingTenths: number;
  parTotal: number;
  handicapAllowancePercent: number;
  handicapRuleVersion: string;
}

export interface LeaderboardExportRow {
  position: number;
  isSharedPosition: boolean;
  displayName: string;
  handicapIndexTenths: number;
  playingHandicap: number;
  points: number;
  /** Golpes escritos. */
  numericStrokes: number;
  /** Golpes con las rayas imputadas como doble bogey neto. Tercer criterio. */
  adjustedStrokes: number;
  pickups: number;
}

interface Cursor {
  y: number;
}

function drawHeader(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  header: CompetitionHeader,
  title: string,
  provisional: boolean,
  cursor: Cursor,
): void {
  const { regular, bold } = fonts;

  if (provisional) {
    // Marca obligatoria, no decorativa: este documento no es el definitivo.
    page.drawRectangle({
      x: MARGIN,
      y: cursor.y - 20,
      width: A4.width - MARGIN * 2,
      height: 26,
      color: rgb(0.96, 0.93, 0.82),
      borderColor: WARNING,
      borderWidth: 1,
    });
    page.drawText(sanitizeForPdf('PROVISIONAL - NO ES LA CLASIFICACION DEFINITIVA'), {
      x: MARGIN + 10,
      y: cursor.y - 13,
      font: bold,
      size: 10,
      color: WARNING,
    });
    cursor.y -= 40;
  }

  page.drawText(sanitizeForPdf(header.name), {
    x: MARGIN,
    y: cursor.y,
    font: bold,
    size: 18,
    color: ACCENT,
  });
  cursor.y -= 20;

  page.drawText(sanitizeForPdf(header.edition), {
    x: MARGIN,
    y: cursor.y,
    font: regular,
    size: 11,
    color: MUTED,
  });
  cursor.y -= 24;

  page.drawText(sanitizeForPdf(title), { x: MARGIN, y: cursor.y, font: bold, size: 13, color: INK });
  cursor.y -= 18;

  const rating = `${(header.courseRatingTenths / 10).toFixed(1).replace('.', ',')}`;
  const meta = [
    `${header.courseName} - ${header.routeName}`,
    `Barras ${header.teeColor.toLowerCase()} - ${header.category.toLowerCase()}`,
    header.modality.replace(/_/g, ' ').toLowerCase(),
    formatDate(header.date, 'Europe/Madrid'),
    `Vc ${rating} / Slope ${header.slopeRating} / Par ${header.parTotal}`,
    `Asignacion ${header.handicapAllowancePercent} %`,
  ];

  for (const line of meta) {
    page.drawText(sanitizeForPdf(line), {
      x: MARGIN,
      y: cursor.y,
      font: regular,
      size: 9,
      color: MUTED,
    });
    cursor.y -= 12;
  }

  cursor.y -= 6;
  page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: A4.width - MARGIN, y: cursor.y },
    thickness: 1,
    color: LINE,
  });
  cursor.y -= 18;
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  header: CompetitionHeader,
  generatedAt: Date,
): void {
  const stamp = `Generado el ${generatedAt.toISOString()} - reglas: ${header.handicapRuleVersion}`;
  page.drawText(sanitizeForPdf(stamp), {
    x: MARGIN,
    y: 28,
    font,
    size: 7,
    color: MUTED,
  });
}

export interface LeaderboardPdfInput {
  header: CompetitionHeader;
  rows: LeaderboardExportRow[];
  request: ExportRequest;
  generatedAt?: Date;
}

/**
 * PDF de la clasificacion. Comprueba los permisos ANTES de generar nada: no se
 * construye un documento que luego no se pueda entregar.
 */
export async function buildLeaderboardPdf(input: LeaderboardPdfInput): Promise<Uint8Array> {
  const { requiresProvisionalMark } = assertCanExport(input.request);
  const generatedAt = input.generatedAt ?? new Date();

  const doc = await PDFDocument.create();
  doc.setTitle(sanitizeForPdf(`${input.header.name} - Clasificacion`));
  doc.setCreator(sanitizeForPdf(input.header.name));
  doc.setProducer('penita-golf-championship');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([A4.width, A4.height]);
  const cursor: Cursor = { y: A4.height - MARGIN };

  drawHeader(
    page,
    { regular, bold },
    input.header,
    requiresProvisionalMark ? 'Clasificacion provisional' : 'Clasificacion final',
    requiresProvisionalMark,
    cursor,
  );

  const columns = [
    { label: 'Pos', x: MARGIN, width: 34 },
    { label: 'Jugador', x: MARGIN + 34, width: 170 },
    { label: 'Hcp', x: MARGIN + 204, width: 44 },
    { label: 'HJ', x: MARGIN + 248, width: 34 },
    { label: 'Puntos', x: MARGIN + 282, width: 48 },
    { label: 'Golpes', x: MARGIN + 330, width: 44 },
    { label: 'Rayas', x: MARGIN + 374, width: 38 },
    { label: 'Ajust.', x: MARGIN + 412, width: 44 },
  ];

  for (const column of columns) {
    page.drawText(column.label, { x: column.x, y: cursor.y, font: bold, size: 9, color: MUTED });
  }
  cursor.y -= 14;

  for (const row of input.rows) {
    if (cursor.y < 70) {
      drawFooter(page, regular, input.header, generatedAt);
      page = doc.addPage([A4.width, A4.height]);
      cursor.y = A4.height - MARGIN;
    }

    const isPodium = row.position <= 3;
    const values = [
      `${row.isSharedPosition ? '=' : ''}${row.position}`,
      truncate(sanitizeForPdf(row.displayName), 30),
      formatHandicap(row.handicapIndexTenths),
      String(row.playingHandicap),
      String(row.points),
      String(row.numericStrokes),
      row.pickups > 0 ? String(row.pickups) : '-',
      String(row.adjustedStrokes),
    ];

    values.forEach((value, index) => {
      page.drawText(value, {
        x: columns[index].x,
        y: cursor.y,
        font: isPodium ? bold : regular,
        size: 10,
        color: INK,
      });
    });

    cursor.y -= 16;
  }

  /**
   * Nota al pie cuando alguien levanto la bola. Sin ella, la columna "Ajust."
   * es un numero sin explicar, y un desempate que nadie entiende es un
   * desempate que alguien va a discutir.
   */
  if (input.rows.some((row) => row.pickups > 0)) {
    cursor.y -= 8;
    page.drawText(
      sanitizeForPdf(
        'Ajust.: golpes con las rayas contadas como doble bogey neto. Es el tercer criterio de desempate.',
      ),
      { x: MARGIN, y: cursor.y, font: regular, size: 8, color: MUTED },
    );
  }

  drawFooter(page, regular, input.header, generatedAt);
  return doc.save();
}

export interface ScorecardPdfInput {
  header: CompetitionHeader;
  player: {
    displayName: string;
    handicapIndexTenths: number;
    playingHandicap: number;
    flightName: string | null;
    teeTime: string | null;
  };
  results: HoleResult[];
  distances: Map<number, number>;
  totals: ScorecardTotals;
  request: ExportRequest;
  generatedAt?: Date;
}

/** PDF de una tarjeta, hoyo a hoyo. */
export async function buildScorecardPdf(input: ScorecardPdfInput): Promise<Uint8Array> {
  const { requiresProvisionalMark } = assertCanExport(input.request);
  const generatedAt = input.generatedAt ?? new Date();

  const doc = await PDFDocument.create();
  doc.setTitle(sanitizeForPdf(`Tarjeta - ${input.player.displayName}`));
  doc.setProducer('penita-golf-championship');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4.width, A4.height]);
  const cursor: Cursor = { y: A4.height - MARGIN };

  drawHeader(
    page,
    { regular, bold },
    input.header,
    `Tarjeta de ${input.player.displayName}`,
    requiresProvisionalMark,
    cursor,
  );

  const playerMeta = [
    `Hándicap exacto ${formatHandicap(input.player.handicapIndexTenths)}`,
    `Hándicap de juego ${input.player.playingHandicap}`,
    input.player.flightName ? `Partido: ${input.player.flightName}` : 'Sin partido asignado',
  ];
  page.drawText(sanitizeForPdf(playerMeta.join('   |   ')), {
    x: MARGIN,
    y: cursor.y,
    font: regular,
    size: 10,
    color: INK,
  });
  cursor.y -= 22;

  const columns = [
    { label: 'Hoyo', x: MARGIN, align: 'left' as const },
    { label: 'Par', x: MARGIN + 46 },
    { label: 'SI', x: MARGIN + 80 },
    { label: 'Metros', x: MARGIN + 110 },
    { label: 'Recibe', x: MARGIN + 160 },
    { label: 'Bruto', x: MARGIN + 208 },
    { label: 'Neto', x: MARGIN + 248 },
    { label: 'Puntos', x: MARGIN + 288 },
  ];

  const drawColumnHeaders = () => {
    for (const column of columns) {
      page.drawText(column.label, { x: column.x, y: cursor.y, font: bold, size: 9, color: MUTED });
    }
    cursor.y -= 13;
  };

  const drawNineSummary = (label: string, summary: ScorecardTotals['out']) => {
    page.drawLine({
      start: { x: MARGIN, y: cursor.y + 9 },
      end: { x: MARGIN + 330, y: cursor.y + 9 },
      thickness: 0.7,
      color: LINE,
    });
    const text = `${label}: ${summary.numericStrokes} golpes, ${summary.points} puntos${
      summary.pickups > 0
        ? `, ${summary.pickups} ${summary.pickups === 1 ? 'raya' : 'rayas'}`
        : ''
    }`;
    page.drawText(sanitizeForPdf(text), {
      x: MARGIN,
      y: cursor.y,
      font: bold,
      size: 9,
      color: INK,
    });
    cursor.y -= 20;
  };

  const drawHoles = (from: number, to: number) => {
    for (const result of input.results.filter(
      (r) => r.holeNumber >= from && r.holeNumber <= to,
    )) {
      const values = [
        String(result.holeNumber),
        String(result.par),
        String(result.strokeIndex),
        String(input.distances.get(result.holeNumber) ?? '-'),
        result.strokesReceived === 0 ? '-' : String(result.strokesReceived),
        result.isPickup ? 'Raya' : result.grossStrokes === null ? '-' : String(result.grossStrokes),
        result.netStrokes === null ? '-' : String(result.netStrokes),
        result.grossStrokes === null && !result.isPickup ? '-' : String(result.stablefordPoints),
      ];

      values.forEach((value, index) => {
        page.drawText(value, {
          x: columns[index].x,
          y: cursor.y,
          font: regular,
          size: 9.5,
          color: result.isPickup ? WARNING : INK,
        });
      });

      cursor.y -= 14;
    }
  };

  drawColumnHeaders();
  drawHoles(1, 9);
  drawNineSummary('Ida', input.totals.out);
  drawColumnHeaders();
  drawHoles(10, 18);
  drawNineSummary('Vuelta', input.totals.in);

  const { total } = input.totals;
  page.drawText(
    sanitizeForPdf(
      `TOTAL: ${total.numericStrokes} golpes numericos, ${total.points} puntos, ${total.holesPlayed}/18 hoyos`,
    ),
    { x: MARGIN, y: cursor.y, font: bold, size: 11, color: ACCENT },
  );
  cursor.y -= 16;

  if (total.imputedHoles > 0) {
    page.drawText(
      sanitizeForPdf(
        `Golpes ajustados para desempate: ${total.adjustedStrokes} (${total.imputedHoles} ${total.imputedHoles === 1 ? 'hoyo imputado' : 'hoyos imputados'})`,
      ),
      { x: MARGIN, y: cursor.y, font: regular, size: 9, color: MUTED },
    );
    cursor.y -= 14;
  }

  /**
   * Aqui se aplica la misma regla que en pantalla: si hay una raya o falta un
   * hoyo, NO se imprime un resultado bruto respecto al par. Un PDF circula, se
   * imprime y se compara; un bruto falso en papel es peor que en pantalla.
   */
  if (total.isGrossComplete && total.grossToPar !== null) {
    const toPar =
      total.grossToPar === 0
        ? 'Par del campo'
        : total.grossToPar > 0
          ? `${total.grossToPar} sobre par`
          : `${Math.abs(total.grossToPar)} bajo par`;
    page.drawText(sanitizeForPdf(`Resultado bruto: ${toPar}`), {
      x: MARGIN,
      y: cursor.y,
      font: regular,
      size: 10,
      color: INK,
    });
  } else {
    page.drawText(
      sanitizeForPdf(
        `Resultado bruto incompleto${
          total.pickups > 0
            ? ` (${total.pickups} ${total.pickups === 1 ? 'raya' : 'rayas'})`
            : ''
        }`,
      ),
      { x: MARGIN, y: cursor.y, font: bold, size: 10, color: WARNING },
    );
  }

  drawFooter(page, regular, input.header, generatedAt);
  return doc.save();
}
