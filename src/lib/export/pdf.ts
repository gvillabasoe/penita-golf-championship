/**
 * Documentos PDF oficiales del torneo.
 *
 * La maquetacion no imprime la interfaz web. Replica el sistema visual
 * "Escudo" en un soporte A4: marino y marfil del logo, amarillo de tee,
 * superficies de porcelana, tarjetas, placas de puntos y jerarquia tipografica
 * compacta. Cada bloque conoce su altura antes de dibujarse para que ninguna
 * tarjeta ni ningun partido quede partido entre paginas.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type Color,
  type PDFImage,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

import { assertCanExport, type ExportRequest } from './guards';
import { formatDate, formatHandicap, sanitizeForPdf } from './text';
import type { BestBallSource, PairScoringMode } from '../golf/pairs';
import { PAIR_SCORING_LABELS } from '../golf/pairs';
import type { HoleResult, ScorecardStatus, ScorecardTotals } from '../golf/types';

const A4 = { width: 595.28, height: 841.89 } as const;
const PAGE_MARGIN = 36;
const CONTENT_WIDTH = A4.width - PAGE_MARGIN * 2;
const HEADER_HEIGHT = 104;
const CONTENT_TOP = A4.height - HEADER_HEIGHT - 24;
const FOOTER_LIMIT = 58;

function color(hex: string): Color {
  const normalized = hex.replace('#', '');
  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  );
}

/** Tokens copiados de src/styles/tokens.css. */
const C = {
  navy950: color('#0D1826'),
  navy900: color('#14233A'),
  navy800: color('#1B2E47'),
  navy700: color('#243C57'),
  navy600: color('#2D4767'),
  navy500: color('#364F6E'),
  navy400: color('#5B7290'),
  navy300: color('#8FA2B9'),
  navy200: color('#C4CFDC'),
  navy100: color('#E3E9F0'),
  navy50: color('#F2F5F9'),
  ivory: color('#F3EBDD'),
  page: color('#EEF1F5'),
  surface: color('#FFFFFF'),
  surface2: color('#F6F8FB'),
  surface3: color('#EBEFF4'),
  ink: color('#121C27'),
  ink2: color('#4C5B6C'),
  ink3: color('#7B8898'),
  line: color('#DDE3EA'),
  lineStrong: color('#B8C2CE'),
  tee: color('#F2C230'),
  teeDeep: color('#A87B00'),
  teeWash: color('#FFF5D1'),
  fairway: color('#1F7A4D'),
  fairwayDeep: color('#145C39'),
  fairwayWash: color('#E3F2E9'),
  birdie: color('#C8322C'),
  birdieDeep: color('#9C201B'),
  birdieWash: color('#FCEBEA'),
  amber: color('#A85F00'),
  amberWash: color('#FFF1DB'),
  medalGold: color('#B8902F'),
  medalGoldHi: color('#F2DC94'),
  medalSilver: color('#8E99A6'),
  medalSilverHi: color('#E8EDF2'),
  medalBronze: color('#A4673A'),
  medalBronzeHi: color('#F0C7A0'),
} as const;

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
  color?: string;
  handicapIndexTenths: number;
  playingHandicap: number;
  points: number;
  /** Golpes escritos. */
  numericStrokes: number;
  /** Golpes con las rayas imputadas como doble bogey neto. Tercer criterio. */
  adjustedStrokes: number;
  pickups: number;
  holesCompleted?: number;
  progressPercent?: number;
}

export interface PairLeaderboardExportRow {
  pairNumber: number;
  position: number;
  isSharedPosition: boolean;
  displayName: string;
  colors: string[];
  scoringMode: PairScoringMode;
  isSolo: boolean;
  handicapIndexTenths: number;
  playingHandicap: number;
  points: number;
  numericStrokes: number;
  adjustedStrokes: number;
  pickups: number;
  holesCompleted: number;
  holesAvailable: number;
  progressPercent: number;
}

export interface ScorecardPdfPlayer {
  displayName: string;
  color?: string;
  handicapIndexTenths: number;
  playingHandicap: number;
  flightName: string | null;
  teeTime: string | null;
  status?: ScorecardStatus;
}

export interface ScorecardDocument {
  player: ScorecardPdfPlayer;
  results: HoleResult[];
  totals: ScorecardTotals;
  sources?: BestBallSource[];
  title?: string;
  subtitle?: string;
}

export interface FlightDrawMember {
  competitionPlayerId: string;
  displayName: string;
  color: string;
  handicapIndexTenths: number | null;
  playingHandicap: number | null;
  knowsCourse: boolean;
}

export interface FlightDrawDocument {
  id: string;
  name: string;
  order: number;
  teeTime: string | null;
  status: string;
  members: FlightDrawMember[];
}

export interface PairDrawMember {
  competitionPlayerId: string;
  displayName: string;
  color: string;
  handicapIndexTenths: number | null;
  playingHandicap: number | null;
  flightName: string | null;
}

export interface PairScorecardDocument {
  pairNumber: number;
  displayName: string;
  colors: string[];
  scoringMode: PairScoringMode;
  isSolo: boolean;
  handicapIndexTenths: number | null;
  playingHandicap: number | null;
  points: number;
  members: Array<
    PairDrawMember & {
      status: ScorecardStatus;
      results: HoleResult[];
      totals: ScorecardTotals;
    }
  >;
  results: HoleResult[] | null;
  totals: ScorecardTotals | null;
  sources: BestBallSource[];
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  oblique: PDFFont;
}

interface SectionIdentity {
  label: string;
  title: string;
  subtitle: string;
}

function safe(value: unknown): string {
  return sanitizeForPdf(typeof value === 'string' ? value : String(value ?? ''));
}

function fromCssColor(value: string | undefined, fallback: Color = C.navy400): Color {
  if (!value) return fallback;
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  return match ? color(`#${match[1]}`) : fallback;
}

function textWidth(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(safe(text), size);
}

function fitText(
  font: PDFFont,
  raw: string,
  size: number,
  maxWidth: number,
  minimumSize = 7,
): { text: string; size: number } {
  const text = safe(raw);
  let current = size;
  while (current > minimumSize && textWidth(font, text, current) > maxWidth) current -= 0.25;
  if (textWidth(font, text, current) <= maxWidth) return { text, size: current };

  let shortened = text;
  while (shortened.length > 2 && textWidth(font, `${shortened}.`, current) > maxWidth) {
    shortened = shortened.slice(0, -1).trimEnd();
  }
  return { text: `${shortened}.`, size: current };
}

function wrapText(font: PDFFont, raw: string, size: number, maxWidth: number): string[] {
  const text = safe(raw);
  if (text === '') return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line === '' ? word : `${line} ${word}`;
    if (textWidth(font, candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line !== '') lines.push(line);
    if (textWidth(font, word, size) <= maxWidth) {
      line = word;
      continue;
    }

    let fragment = '';
    for (const char of word) {
      const candidateFragment = `${fragment}${char}`;
      if (textWidth(font, candidateFragment, size) <= maxWidth) {
        fragment = candidateFragment;
      } else {
        if (fragment !== '') lines.push(fragment);
        fragment = char;
      }
    }
    line = fragment;
  }

  if (line !== '') lines.push(line);
  return lines;
}

function drawRoundedFill(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: Color,
  opacity = 1,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r <= 0.1) {
    page.drawRectangle({ x, y, width, height, color: fill, opacity });
    return;
  }
  page.drawRectangle({ x: x + r, y, width: width - r * 2, height, color: fill, opacity });
  page.drawRectangle({ x, y: y + r, width, height: height - r * 2, color: fill, opacity });
  page.drawCircle({ x: x + r, y: y + r, size: r, color: fill, opacity });
  page.drawCircle({ x: x + width - r, y: y + r, size: r, color: fill, opacity });
  page.drawCircle({ x: x + r, y: y + height - r, size: r, color: fill, opacity });
  page.drawCircle({ x: x + width - r, y: y + height - r, size: r, color: fill, opacity });
}

function drawRoundedBox(
  page: PDFPage,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius?: number;
    fill: Color;
    border?: Color;
    borderWidth?: number;
    opacity?: number;
  },
): void {
  const radius = options.radius ?? 10;
  const borderWidth = options.border && options.borderWidth ? options.borderWidth : 0;
  if (borderWidth > 0 && options.border) {
    drawRoundedFill(
      page,
      options.x,
      options.y,
      options.width,
      options.height,
      radius,
      options.border,
      options.opacity ?? 1,
    );
    drawRoundedFill(
      page,
      options.x + borderWidth,
      options.y + borderWidth,
      options.width - borderWidth * 2,
      options.height - borderWidth * 2,
      Math.max(0, radius - borderWidth),
      options.fill,
      options.opacity ?? 1,
    );
    return;
  }
  drawRoundedFill(
    page,
    options.x,
    options.y,
    options.width,
    options.height,
    radius,
    options.fill,
    options.opacity ?? 1,
  );
}

function drawCard(
  page: PDFPage,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius?: number;
    fill?: Color;
    border?: Color;
  },
): void {
  drawRoundedFill(
    page,
    options.x,
    options.y - 2,
    options.width,
    options.height,
    options.radius ?? 12,
    C.navy950,
    0.08,
  );
  drawRoundedBox(page, {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    radius: options.radius ?? 12,
    fill: options.fill ?? C.surface,
    border: options.border ?? C.line,
    borderWidth: 0.7,
  });
}

function drawPill(
  page: PDFPage,
  fonts: Fonts,
  raw: string,
  options: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    fill?: Color;
    textColor?: Color;
    font?: PDFFont;
    size?: number;
    align?: 'left' | 'center';
    maxWidth?: number;
  },
): number {
  const height = options.height ?? 22;
  const size = options.size ?? 8.5;
  const font = options.font ?? fonts.bold;
  const text = safe(raw);
  const naturalWidth = Math.max(height, textWidth(font, text, size) + 18);
  const requestedWidth = options.width ?? naturalWidth;
  const width = Math.max(height, Math.min(requestedWidth, options.maxWidth ?? requestedWidth));
  const fitted = fitText(font, text, size, Math.max(4, width - 18), Math.min(size, 5.5));
  drawRoundedFill(page, options.x, options.y, width, height, height / 2, options.fill ?? C.navy700);
  const tx =
    options.align === 'left'
      ? options.x + 9
      : options.x + (width - textWidth(font, fitted.text, fitted.size)) / 2;
  page.drawText(fitted.text, {
    x: tx,
    y: options.y + (height - fitted.size) / 2 + 1.5,
    font,
    size: fitted.size,
    color: options.textColor ?? C.ivory,
  });
  return width;
}

function formatTeeTime(iso: string | null): string {
  if (!iso) return 'Hora pendiente';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Hora no valida';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

function formatGenerated(date: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

function statusLabel(status: ScorecardStatus | undefined): string {
  switch (status) {
    case 'NOT_STARTED':
      return 'Sin empezar';
    case 'IN_PLAY':
      return 'En juego';
    case 'FINISHED':
      return 'Finalizada';
    case 'REVIEWED':
      return 'Revisada';
    case 'LOCKED':
      return 'Cerrada';
    default:
      return 'Tarjeta';
  }
}

async function loadLogo(): Promise<Uint8Array | null> {
  try {
    return await readFile(join(process.cwd(), 'public/icons/icon-512.png'));
  } catch {
    return null;
  }
}

class OfficialPdf {
  readonly doc: PDFDocument;
  readonly fonts: Fonts;
  readonly logo: PDFImage | null;
  readonly header: CompetitionHeader;
  readonly generatedAt: Date;
  readonly provisional: boolean;

  private page: PDFPage | null = null;
  private y = CONTENT_TOP;
  private section: SectionIdentity = { label: 'Documento oficial', title: '', subtitle: '' };

  private constructor(
    doc: PDFDocument,
    fonts: Fonts,
    logo: PDFImage | null,
    header: CompetitionHeader,
    generatedAt: Date,
    provisional: boolean,
  ) {
    this.doc = doc;
    this.fonts = fonts;
    this.logo = logo;
    this.header = header;
    this.generatedAt = generatedAt;
    this.provisional = provisional;
  }

  static async create(
    header: CompetitionHeader,
    options: { generatedAt?: Date; provisional?: boolean } = {},
  ): Promise<OfficialPdf> {
    const doc = await PDFDocument.create();
    doc.setTitle(safe(`${header.name} - documentos oficiales`));
    doc.setCreator(safe(header.name));
    doc.setProducer('penita-golf-championship');
    doc.setSubject(safe(header.edition));

    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);
    const logoBytes = await loadLogo();
    const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

    return new OfficialPdf(
      doc,
      { regular, bold, oblique },
      logo,
      header,
      options.generatedAt ?? new Date(),
      options.provisional ?? false,
    );
  }

  get currentPage(): PDFPage {
    if (!this.page) throw new Error('No hay una pagina activa.');
    return this.page;
  }

  get cursorY(): number {
    return this.y;
  }

  set cursorY(value: number) {
    this.y = value;
  }

  addCover(title: string, subtitle: string, sections: string[]): void {
    const page = this.doc.addPage([A4.width, A4.height]);
    page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: C.page });
    page.drawRectangle({ x: 0, y: A4.height - 360, width: A4.width, height: 360, color: C.navy700 });
    page.drawRectangle({ x: 0, y: A4.height - 364, width: A4.width, height: 4, color: C.tee });

    if (this.logo) {
      page.drawImage(this.logo, { x: PAGE_MARGIN, y: A4.height - 204, width: 132, height: 132 });
    } else {
      drawRoundedFill(page, PAGE_MARGIN, A4.height - 204, 132, 132, 28, C.navy600);
    }

    page.drawText(safe(this.header.edition), {
      x: 190,
      y: A4.height - 104,
      font: this.fonts.bold,
      size: 10,
      color: C.ivory,
    });

    const titleLines = wrapText(this.fonts.bold, title, 28, A4.width - 226);
    titleLines.slice(0, 3).forEach((line, index) => {
      page.drawText(line, {
        x: 190,
        y: A4.height - 148 - index * 32,
        font: this.fonts.bold,
        size: 28,
        color: C.surface,
      });
    });

    page.drawText(safe(subtitle), {
      x: 190,
      y: A4.height - 260,
      font: this.fonts.regular,
      size: 11,
      color: C.ivory,
    });

    const rating = (this.header.courseRatingTenths / 10).toFixed(1).replace('.', ',');
    const chips = [
      formatDate(this.header.date),
      `${this.header.courseName} - ${this.header.routeName}`,
      `Vc ${rating} · Slope ${this.header.slopeRating} · Par ${this.header.parTotal}`,
    ];
    let chipY = A4.height - 326;
    for (const chip of chips) {
      drawPill(page, this.fonts, chip, {
        x: 190,
        y: chipY,
        height: 20,
        fill: C.navy600,
        textColor: C.ivory,
        size: 8,
        align: 'left',
      });
      chipY -= 24;
    }

    page.drawText('Contenido', {
      x: PAGE_MARGIN,
      y: 418,
      font: this.fonts.bold,
      size: 17,
      color: C.navy800,
    });

    let y = 384;
    sections.forEach((section, index) => {
      drawRoundedFill(page, PAGE_MARGIN, y - 2, 26, 26, 13, index === 0 ? C.tee : C.navy100);
      const number = String(index + 1);
      page.drawText(number, {
        x: PAGE_MARGIN + (26 - textWidth(this.fonts.bold, number, 9)) / 2,
        y: y + 6,
        font: this.fonts.bold,
        size: 9,
        color: index === 0 ? C.navy900 : C.navy700,
      });
      page.drawText(safe(section), {
        x: PAGE_MARGIN + 38,
        y: y + 5,
        font: this.fonts.bold,
        size: 11,
        color: C.ink,
      });
      y -= 42;
    });

    page.drawText(safe(`Generado el ${formatGenerated(this.generatedAt)}`), {
      x: PAGE_MARGIN,
      y: 44,
      font: this.fonts.regular,
      size: 8,
      color: C.ink3,
    });
    if (this.provisional) {
      drawPill(page, this.fonts, 'PROVISIONAL', {
        x: A4.width - PAGE_MARGIN - 86,
        y: 38,
        width: 86,
        fill: C.amberWash,
        textColor: C.amber,
        size: 8,
      });
    }
  }

  startSection(identity: SectionIdentity): void {
    this.section = identity;
    this.newPage(false);
    this.drawTournamentMeta();
  }

  newStandalonePage(identity: SectionIdentity): void {
    this.section = identity;
    this.newPage(false);
    this.drawTournamentMeta();
  }


  private drawTournamentMeta(): void {
    const page = this.currentPage;
    const height = this.provisional ? 64 : 46;
    const y = this.y - height;
    drawRoundedBox(page, {
      x: PAGE_MARGIN,
      y,
      width: CONTENT_WIDTH,
      height,
      radius: 11,
      fill: C.surface,
      border: C.line,
      borderWidth: 0.7,
    });
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: y + (this.provisional ? 18 : 0),
      width: 4,
      height: this.provisional ? height - 18 : height,
      color: C.tee,
    });

    const course = `${this.header.courseName} - ${this.header.routeName}`;
    const courseFit = fitText(this.fonts.bold, course, 9, 260, 7);
    page.drawText(courseFit.text, {
      x: PAGE_MARGIN + 14,
      y: y + height - 18,
      font: this.fonts.bold,
      size: courseFit.size,
      color: C.navy800,
    });

    const rating = (this.header.courseRatingTenths / 10).toFixed(1).replace('.', ',');
    const configuration = `Barras ${this.header.teeColor.toLocaleLowerCase('es')} · ${this.header.category.toLocaleLowerCase('es')} · Vc ${rating} · Slope ${this.header.slopeRating} · Par ${this.header.parTotal} · HCP ${this.header.handicapAllowancePercent} %`;
    const configFit = fitText(this.fonts.regular, configuration, 7.4, CONTENT_WIDTH - 28, 6.2);
    page.drawText(configFit.text, {
      x: PAGE_MARGIN + 14,
      y: y + height - 34,
      font: this.fonts.regular,
      size: configFit.size,
      color: C.ink2,
    });

    if (this.provisional) {
      page.drawRectangle({
        x: PAGE_MARGIN,
        y,
        width: CONTENT_WIDTH,
        height: 18,
        color: C.amberWash,
      });
      page.drawText('PROVISIONAL - NO ES LA CLASIFICACION DEFINITIVA', {
        x: PAGE_MARGIN + 14,
        y: y + 6,
        font: this.fonts.bold,
        size: 6.8,
        color: C.amber,
      });
    }

    this.y = y - 10;
  }

  ensureSpace(height: number): void {
    if (!this.page) this.newPage(false);
    if (this.y - height < FOOTER_LIMIT) this.newPage(true);
  }

  gap(value: number): void {
    this.y -= value;
  }

  private newPage(continuation: boolean): void {
    const page = this.doc.addPage([A4.width, A4.height]);
    this.page = page;
    this.y = CONTENT_TOP;
    page.drawRectangle({ x: 0, y: 0, width: A4.width, height: A4.height, color: C.page });
    page.drawRectangle({ x: 0, y: A4.height - HEADER_HEIGHT, width: A4.width, height: HEADER_HEIGHT, color: C.navy700 });
    page.drawRectangle({ x: 0, y: A4.height - HEADER_HEIGHT - 3, width: A4.width, height: 3, color: C.tee });

    if (this.logo) {
      page.drawImage(this.logo, {
        x: PAGE_MARGIN,
        y: A4.height - 88,
        width: 62,
        height: 62,
      });
    }

    const titleX = PAGE_MARGIN + 76;
    page.drawText(safe(this.section.label), {
      x: titleX,
      y: A4.height - 35,
      font: this.fonts.bold,
      size: 8,
      color: C.ivory,
    });

    const pageTitle = continuation ? `${this.section.title} - continuacion` : this.section.title;
    const title = fitText(this.fonts.bold, pageTitle, 18, 342, 11);
    page.drawText(title.text, {
      x: titleX,
      y: A4.height - 58,
      font: this.fonts.bold,
      size: title.size,
      color: C.surface,
    });

    const subtitle = fitText(this.fonts.regular, this.section.subtitle, 9, 342, 7);
    page.drawText(subtitle.text, {
      x: titleX,
      y: A4.height - 78,
      font: this.fonts.regular,
      size: subtitle.size,
      color: C.ivory,
    });

    const date = formatDate(this.header.date);
    const meta = fitText(this.fonts.regular, date, 8, 104, 6.5);
    page.drawText(meta.text, {
      x: A4.width - PAGE_MARGIN - textWidth(this.fonts.regular, meta.text, meta.size),
      y: A4.height - 78,
      font: this.fonts.regular,
      size: meta.size,
      color: C.ivory,
    });

    if (this.provisional) {
      drawPill(page, this.fonts, 'PROVISIONAL', {
        x: A4.width - PAGE_MARGIN - 82,
        y: A4.height - 40,
        width: 82,
        height: 20,
        fill: C.tee,
        textColor: C.navy900,
        size: 7.5,
      });
    }
  }

  drawSeed(
    label: string,
    seed: string | null,
    missingText = 'Sin semilla reproducible: la composicion incluye ajustes manuales.',
  ): void {
    this.ensureSpace(62);
    const page = this.currentPage;
    const height = 54;
    const y = this.y - height;
    drawRoundedBox(page, {
      x: PAGE_MARGIN,
      y,
      width: CONTENT_WIDTH,
      height,
      radius: 10,
      fill: C.surface2,
      border: C.line,
      borderWidth: 0.8,
    });
    page.drawRectangle({ x: PAGE_MARGIN, y, width: 4, height, color: C.navy500 });
    page.drawText(safe(label), {
      x: PAGE_MARGIN + 14,
      y: y + 33,
      font: this.fonts.bold,
      size: 8,
      color: C.ink2,
    });
    const value = seed ?? missingText;
    const fitted = fitText(this.fonts.bold, value, seed ? 11 : 8.5, CONTENT_WIDTH - 28, 7);
    page.drawText(fitted.text, {
      x: PAGE_MARGIN + 14,
      y: y + 15,
      font: seed ? this.fonts.bold : this.fonts.oblique,
      size: fitted.size,
      color: seed ? C.navy800 : C.ink3,
    });
    this.y = y - 10;
  }

  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      page.drawLine({
        start: { x: PAGE_MARGIN, y: 38 },
        end: { x: A4.width - PAGE_MARGIN, y: 38 },
        thickness: 0.6,
        color: C.lineStrong,
      });
      page.drawText(safe(`${this.header.name} · ${formatGenerated(this.generatedAt)}`), {
        x: PAGE_MARGIN,
        y: 23,
        font: this.fonts.regular,
        size: 6.8,
        color: C.ink3,
      });
      const pageLabel = `${index + 1} / ${pages.length}`;
      page.drawText(pageLabel, {
        x: A4.width - PAGE_MARGIN - textWidth(this.fonts.bold, pageLabel, 7),
        y: 23,
        font: this.fonts.bold,
        size: 7,
        color: C.navy500,
      });
    });
    return this.doc.save();
  }
}

function drawSectionIntro(
  pdf: OfficialPdf,
  options: {
    primary: string;
    secondary: string;
    tertiary?: string;
  },
): void {
  pdf.ensureSpace(54);
  const page = pdf.currentPage;
  const y = pdf.cursorY - 42;
  drawCard(page, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_WIDTH,
    height: 42,
    radius: 12,
    fill: C.surface,
  });
  let x = PAGE_MARGIN + 14;
  const items = [options.primary, options.secondary, options.tertiary].filter(
    (item): item is string => Boolean(item),
  );
  const gap = 8;
  const maximumItemWidth =
    items.length === 0 ? CONTENT_WIDTH - 28 : (CONTENT_WIDTH - 28 - gap * (items.length - 1)) / items.length;
  items.forEach((item, index) => {
    const fill = index === 0 ? C.navy700 : index === 1 ? C.navy100 : C.fairwayWash;
    const textColor = index === 0 ? C.ivory : index === 1 ? C.navy700 : C.fairwayDeep;
    const width = drawPill(page, pdf.fonts, item, {
      x,
      y: y + 10,
      fill,
      textColor,
      size: 8,
      maxWidth: maximumItemWidth,
    });
    x += width + gap;
  });
  pdf.cursorY = y - 10;
}

function drawEmptyState(pdf: OfficialPdf, title: string, description: string): void {
  const height = 72;
  pdf.ensureSpace(height + 10);
  const page = pdf.currentPage;
  const y = pdf.cursorY - height;
  drawCard(page, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_WIDTH,
    height,
    radius: 13,
    fill: C.surface,
  });
  drawRoundedFill(page, PAGE_MARGIN + 14, y + 20, 32, 32, 16, C.navy100);
  page.drawText('-', {
    x: PAGE_MARGIN + 27 - textWidth(pdf.fonts.bold, '-', 10) / 2,
    y: y + 31,
    font: pdf.fonts.bold,
    size: 10,
    color: C.navy600,
  });
  page.drawText(safe(title), {
    x: PAGE_MARGIN + 58,
    y: y + 43,
    font: pdf.fonts.bold,
    size: 10,
    color: C.ink,
  });
  const lines = wrapText(pdf.fonts.regular, description, 7.8, CONTENT_WIDTH - 76);
  lines.slice(0, 2).forEach((line, index) => {
    page.drawText(line, {
      x: PAGE_MARGIN + 58,
      y: y + 27 - index * 10,
      font: pdf.fonts.regular,
      size: 7.8,
      color: C.ink2,
    });
  });
  pdf.cursorY = y - 10;
}

function drawLeaderboardRow(pdf: OfficialPdf, row: LeaderboardExportRow, leaderPoints: number): void {
  const height = 58;
  pdf.ensureSpace(height + 7);
  const page = pdf.currentPage;
  const y = pdf.cursorY - height;
  const swatch = fromCssColor(row.color, C.navy400);

  drawCard(page, { x: PAGE_MARGIN, y, width: CONTENT_WIDTH, height, radius: 12 });
  page.drawRectangle({ x: PAGE_MARGIN, y: y + 10, width: 4, height: height - 20, color: swatch });

  const rankX = PAGE_MARGIN + 13;
  const rankY = y + 12;
  const podium = row.position <= 3;
  const medalFill =
    row.position === 1
      ? C.medalGoldHi
      : row.position === 2
        ? C.medalSilverHi
        : row.position === 3
          ? C.medalBronzeHi
          : C.navy100;
  const medalInk =
    row.position === 1
      ? C.medalGold
      : row.position === 2
        ? C.medalSilver
        : row.position === 3
          ? C.medalBronze
          : C.navy700;
  drawRoundedFill(page, rankX, rankY, 34, 34, 17, medalFill);
  if (podium) page.drawCircle({ x: rankX + 17, y: rankY + 17, size: 13, borderColor: medalInk, borderWidth: 0.8 });
  const rankText = `${row.isSharedPosition ? '=' : ''}${row.position}`;
  page.drawText(rankText, {
    x: rankX + (34 - textWidth(pdf.fonts.bold, rankText, 10)) / 2,
    y: rankY + 12,
    font: pdf.fonts.bold,
    size: 10,
    color: medalInk,
  });

  const scoreWidth = 56;
  const scoreX = A4.width - PAGE_MARGIN - scoreWidth - 10;
  drawRoundedFill(page, scoreX, y + 12, scoreWidth, 34, 11, C.navy700);
  const pointText = String(row.points);
  page.drawText(pointText, {
    x: scoreX + (scoreWidth - textWidth(pdf.fonts.bold, pointText, 17)) / 2,
    y: y + 25,
    font: pdf.fonts.bold,
    size: 17,
    color: C.surface,
  });
  page.drawText('pts', {
    x: scoreX + (scoreWidth - textWidth(pdf.fonts.regular, 'pts', 6.5)) / 2,
    y: y + 16,
    font: pdf.fonts.regular,
    size: 6.5,
    color: C.ivory,
  });

  const contentX = PAGE_MARGIN + 58;
  const maxNameWidth = scoreX - contentX - 12;
  const name = fitText(pdf.fonts.bold, row.displayName, 11.5, maxNameWidth, 8.5);
  page.drawText(name.text, {
    x: contentX,
    y: y + 37,
    font: pdf.fonts.bold,
    size: name.size,
    color: C.ink,
  });

  const strokes = row.pickups > 0
    ? `${row.numericStrokes} golpes · ${row.pickups}R · aj. ${row.adjustedStrokes}`
    : `${row.numericStrokes} golpes`;
  const meta = `HCP ${formatHandicap(row.handicapIndexTenths)} · HJ ${row.playingHandicap} · ${strokes}`;
  const metaFit = fitText(pdf.fonts.regular, meta, 8, maxNameWidth, 6.8);
  page.drawText(metaFit.text, {
    x: contentX,
    y: y + 20,
    font: pdf.fonts.regular,
    size: metaFit.size,
    color: C.ink2,
  });

  const barWidth = maxNameWidth;
  page.drawRectangle({ x: contentX, y: y + 9, width: barWidth, height: 3, color: C.surface3 });
  const ratio = row.progressPercent ?? (leaderPoints > 0 ? Math.round((row.points / leaderPoints) * 100) : 0);
  page.drawRectangle({
    x: contentX,
    y: y + 9,
    width: Math.max(0, Math.min(barWidth, (barWidth * ratio) / 100)),
    height: 3,
    color: swatch,
  });

  pdf.cursorY = y - 7;
}

function drawPairLeaderboardRow(pdf: OfficialPdf, row: PairLeaderboardExportRow): void {
  const height = 60;
  pdf.ensureSpace(height + 5);
  const page = pdf.currentPage;
  const y = pdf.cursorY - height;

  drawCard(page, { x: PAGE_MARGIN, y, width: CONTENT_WIDTH, height, radius: 12 });

  const rankX = PAGE_MARGIN + 12;
  const rankY = y + 15;
  const medalFill =
    row.position === 1
      ? C.medalGoldHi
      : row.position === 2
        ? C.medalSilverHi
        : row.position === 3
          ? C.medalBronzeHi
          : C.navy100;
  const medalInk =
    row.position === 1
      ? C.medalGold
      : row.position === 2
        ? C.medalSilver
        : row.position === 3
          ? C.medalBronze
          : C.navy700;
  drawRoundedFill(page, rankX, rankY, 34, 34, 17, medalFill);
  const rankText = `${row.isSharedPosition ? '=' : ''}${row.position}`;
  page.drawText(rankText, {
    x: rankX + (34 - textWidth(pdf.fonts.bold, rankText, 10)) / 2,
    y: rankY + 12,
    font: pdf.fonts.bold,
    size: 10,
    color: medalInk,
  });

  const swatchX = PAGE_MARGIN + 54;
  row.colors.slice(0, 2).forEach((hex, index) => {
    drawRoundedFill(page, swatchX + index * 10, y + 21, 8, 26, 4, fromCssColor(hex));
  });

  const scoreWidth = 56;
  const scoreX = A4.width - PAGE_MARGIN - scoreWidth - 10;
  drawRoundedFill(page, scoreX, y + 15, scoreWidth, 34, 11, C.navy700);
  const points = String(row.points);
  page.drawText(points, {
    x: scoreX + (scoreWidth - textWidth(pdf.fonts.bold, points, 17)) / 2,
    y: y + 28,
    font: pdf.fonts.bold,
    size: 17,
    color: C.surface,
  });
  page.drawText('pts', {
    x: scoreX + (scoreWidth - textWidth(pdf.fonts.regular, 'pts', 6.5)) / 2,
    y: y + 19,
    font: pdf.fonts.regular,
    size: 6.5,
    color: C.ivory,
  });

  const contentX = PAGE_MARGIN + 80;
  const maxWidth = scoreX - contentX - 12;
  const name = fitText(pdf.fonts.bold, row.displayName, 10.8, maxWidth, 7.8);
  page.drawText(name.text, {
    x: contentX,
    y: y + 43,
    font: pdf.fonts.bold,
    size: name.size,
    color: C.ink,
  });
  const hcp = formatHandicap(row.handicapIndexTenths);
  const meta = `${row.isSolo ? 'Individual x2' : `Pareja ${row.pairNumber}`} · HCP ${hcp} · HJ ${row.playingHandicap} · ${row.holesCompleted}/${row.holesAvailable} resultados`;
  const fittedMeta = fitText(pdf.fonts.regular, meta, 7.6, maxWidth, 6.5);
  page.drawText(fittedMeta.text, {
    x: contentX,
    y: y + 26,
    font: pdf.fonts.regular,
    size: fittedMeta.size,
    color: C.ink2,
  });
  page.drawRectangle({ x: contentX, y: y + 11, width: maxWidth, height: 3, color: C.surface3 });
  page.drawRectangle({
    x: contentX,
    y: y + 11,
    width: Math.max(0, Math.min(maxWidth, (maxWidth * row.progressPercent) / 100)),
    height: 3,
    color: C.fairway,
  });

  pdf.cursorY = y - 5;
}

function averageHandicap(members: FlightDrawMember[]): number | null {
  const values = members
    .map((member) => member.handicapIndexTenths)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function drawFlightCard(pdf: OfficialPdf, flight: FlightDrawDocument): void {
  const rowHeight = 27;
  const headerHeight = 43;
  const height = headerHeight + Math.max(1, flight.members.length) * rowHeight + 8;
  pdf.ensureSpace(height + 10);
  const page = pdf.currentPage;
  const y = pdf.cursorY - height;

  drawCard(page, { x: PAGE_MARGIN, y, width: CONTENT_WIDTH, height, radius: 14 });
  drawRoundedFill(page, PAGE_MARGIN, y + height - headerHeight, CONTENT_WIDTH, headerHeight, 14, C.navy50);
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: y + height - headerHeight,
    width: CONTENT_WIDTH,
    height: headerHeight - 14,
    color: C.navy50,
  });

  page.drawText(safe(flight.name), {
    x: PAGE_MARGIN + 14,
    y: y + height - 26,
    font: pdf.fonts.bold,
    size: 12,
    color: C.navy800,
  });
  const average = averageHandicap(flight.members);
  const guideCount = flight.members.filter((member) => member.knowsCourse).length;
  const meta = [
    formatTeeTime(flight.teeTime),
    average === null ? 'HCP medio -' : `HCP medio ${formatHandicap(average)}`,
    guideCount === 0 ? 'Sin conocedor del campo' : `${guideCount} conoce${guideCount === 1 ? '' : 'n'} el campo`,
  ].join(' · ');
  const fitted = fitText(pdf.fonts.regular, meta, 8, 300, 6.5);
  page.drawText(fitted.text, {
    x: PAGE_MARGIN + 14,
    y: y + height - 39,
    font: pdf.fonts.regular,
    size: fitted.size,
    color: C.ink2,
  });
  drawPill(page, pdf.fonts, flight.status === 'CONFIRMED' ? 'Confirmado' : 'Borrador', {
    x: A4.width - PAGE_MARGIN - 84,
    y: y + height - 32,
    width: 74,
    height: 20,
    fill: flight.status === 'CONFIRMED' ? C.fairwayWash : C.amberWash,
    textColor: flight.status === 'CONFIRMED' ? C.fairwayDeep : C.amber,
    size: 7.2,
  });

  if (flight.members.length === 0) {
    page.drawText('Sin jugadores', {
      x: PAGE_MARGIN + 14,
      y: y + 17,
      font: pdf.fonts.oblique,
      size: 8,
      color: C.ink3,
    });
  } else {
    flight.members.forEach((member, index) => {
      const rowTop = y + height - headerHeight - index * rowHeight;
      if (index > 0) {
        page.drawLine({
          start: { x: PAGE_MARGIN + 14, y: rowTop },
          end: { x: A4.width - PAGE_MARGIN - 14, y: rowTop },
          thickness: 0.5,
          color: C.line,
        });
      }
      drawRoundedFill(page, PAGE_MARGIN + 14, rowTop - 19, 6, 18, 3, fromCssColor(member.color));
      const name = fitText(pdf.fonts.bold, member.displayName, 8.8, 230, 7);
      page.drawText(name.text, {
        x: PAGE_MARGIN + 30,
        y: rowTop - 14,
        font: pdf.fonts.bold,
        size: name.size,
        color: C.ink,
      });
      const hcp = member.handicapIndexTenths === null ? '-' : formatHandicap(member.handicapIndexTenths);
      page.drawText(`HCP ${hcp}`, {
        x: PAGE_MARGIN + 290,
        y: rowTop - 14,
        font: pdf.fonts.regular,
        size: 8,
        color: C.ink2,
      });
      page.drawText(`HJ ${member.playingHandicap ?? '-'}`, {
        x: PAGE_MARGIN + 355,
        y: rowTop - 14,
        font: pdf.fonts.regular,
        size: 8,
        color: C.ink2,
      });
      if (member.knowsCourse) {
        drawPill(page, pdf.fonts, 'Conoce el campo', {
          x: A4.width - PAGE_MARGIN - 98,
          y: rowTop - 22,
          width: 88,
          height: 18,
          fill: C.fairwayWash,
          textColor: C.fairwayDeep,
          size: 6.5,
        });
      }
    });
  }

  pdf.cursorY = y - 10;
}

function drawPairAssignmentCard(pdf: OfficialPdf, pair: PairScorecardDocument): void {
  const rowHeight = 28;
  const headerHeight = 48;
  const height = headerHeight + Math.max(1, pair.members.length) * rowHeight + 8;
  pdf.ensureSpace(height + 10);
  const page = pdf.currentPage;
  const y = pdf.cursorY - height;
  drawCard(page, { x: PAGE_MARGIN, y, width: CONTENT_WIDTH, height, radius: 14 });

  page.drawText(safe(pair.isSolo ? `Equipo ${pair.pairNumber} · individual x2` : `Pareja ${pair.pairNumber}`), {
    x: PAGE_MARGIN + 14,
    y: y + height - 24,
    font: pdf.fonts.bold,
    size: 11.5,
    color: C.navy800,
  });
  const mode = pair.isSolo ? 'Puntos Stableford x2' : PAIR_SCORING_LABELS[pair.scoringMode];
  const modeFit = fitText(pdf.fonts.regular, mode, 8, 260, 6.5);
  page.drawText(modeFit.text, {
    x: PAGE_MARGIN + 14,
    y: y + height - 39,
    font: pdf.fonts.regular,
    size: modeFit.size,
    color: C.ink2,
  });
  drawPill(page, pdf.fonts, `${pair.points} pts`, {
    x: A4.width - PAGE_MARGIN - 72,
    y: y + height - 34,
    width: 62,
    height: 23,
    fill: C.navy700,
    textColor: C.surface,
    size: 8.5,
  });

  pair.members.forEach((member, index) => {
    const rowTop = y + height - headerHeight - index * rowHeight;
    if (index > 0) {
      page.drawLine({
        start: { x: PAGE_MARGIN + 14, y: rowTop },
        end: { x: A4.width - PAGE_MARGIN - 14, y: rowTop },
        thickness: 0.5,
        color: C.line,
      });
    }
    drawRoundedFill(page, PAGE_MARGIN + 14, rowTop - 20, 7, 19, 3.5, fromCssColor(member.color));
    const name = fitText(pdf.fonts.bold, member.displayName, 8.8, 230, 7);
    page.drawText(name.text, {
      x: PAGE_MARGIN + 32,
      y: rowTop - 15,
      font: pdf.fonts.bold,
      size: name.size,
      color: C.ink,
    });
    const hcp = member.handicapIndexTenths === null ? '-' : formatHandicap(member.handicapIndexTenths);
    page.drawText(`HCP ${hcp} · HJ ${member.playingHandicap ?? '-'}`, {
      x: PAGE_MARGIN + 290,
      y: rowTop - 15,
      font: pdf.fonts.regular,
      size: 8,
      color: C.ink2,
    });
    const flight = fitText(pdf.fonts.regular, member.flightName ?? 'Sin partido', 7.5, 95, 6.2);
    page.drawText(flight.text, {
      x: A4.width - PAGE_MARGIN - 105,
      y: rowTop - 15,
      font: pdf.fonts.regular,
      size: flight.size,
      color: C.ink3,
    });
  });

  pdf.cursorY = y - 10;
}

function drawScoreShape(
  page: PDFPage,
  font: PDFFont,
  result: HoleResult,
  centerX: number,
  centerY: number,
): void {
  if (result.isPickup) {
    page.drawText('-', {
      x: centerX - textWidth(font, '-', 9) / 2,
      y: centerY - 3,
      font,
      size: 9,
      color: C.birdie,
    });
    return;
  }
  if (result.grossStrokes === null) {
    page.drawText('·', {
      x: centerX - textWidth(font, '·', 8) / 2,
      y: centerY - 2,
      font,
      size: 8,
      color: C.ink3,
    });
    return;
  }

  const text = String(result.grossStrokes);
  const toPar = result.grossToPar ?? 0;
  if (toPar < 0) {
    page.drawCircle({ x: centerX, y: centerY + 1, size: 7, borderColor: C.birdie, borderWidth: 0.8 });
    if (toPar <= -2) {
      page.drawCircle({ x: centerX, y: centerY + 1, size: 9, borderColor: C.birdie, borderWidth: 0.6 });
    }
  } else if (toPar > 0) {
    page.drawRectangle({
      x: centerX - 7,
      y: centerY - 6,
      width: 14,
      height: 14,
      borderColor: C.navy500,
      borderWidth: 0.8,
    });
    if (toPar >= 2) {
      page.drawRectangle({
        x: centerX - 9,
        y: centerY - 8,
        width: 18,
        height: 18,
        borderColor: C.navy500,
        borderWidth: 0.6,
      });
    }
  }
  page.drawText(text, {
    x: centerX - textWidth(font, text, 7.5) / 2,
    y: centerY - 2.5,
    font,
    size: 7.5,
    color: toPar < 0 ? C.birdieDeep : C.ink,
  });
}

function pointPalette(points: number): { fill: Color; ink: Color } {
  if (points <= 0) return { fill: C.surface3, ink: C.ink3 };
  if (points === 1) return { fill: C.navy100, ink: C.navy700 };
  if (points === 2) return { fill: C.navy300, ink: C.navy900 };
  if (points === 3) return { fill: C.fairwayWash, ink: C.fairwayDeep };
  if (points === 4) return { fill: C.fairway, ink: C.surface };
  return { fill: C.medalGoldHi, ink: C.navy900 };
}

function drawPointCell(
  page: PDFPage,
  font: PDFFont,
  result: HoleResult,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (result.grossStrokes === null && !result.isPickup) {
    page.drawText('·', {
      x: x + width / 2 - textWidth(font, '·', 8) / 2,
      y: y + height / 2 - 3,
      font,
      size: 8,
      color: C.ink3,
    });
    return;
  }
  const palette = pointPalette(result.stablefordPoints);
  drawRoundedFill(page, x + 2, y + 3, width - 4, height - 6, 4, palette.fill);
  const text = String(result.stablefordPoints);
  page.drawText(text, {
    x: x + width / 2 - textWidth(font, text, 7.5) / 2,
    y: y + height / 2 - 2.5,
    font,
    size: 7.5,
    color: palette.ink,
  });
  if (result.isPickup) {
    page.drawLine({
      start: { x: x + 3, y: y + 4 },
      end: { x: x + width - 3, y: y + height - 4 },
      thickness: 1,
      color: C.birdie,
    });
  }
}

interface GridRow {
  key: 'par' | 'si' | 'distance' | 'received' | 'source' | 'gross' | 'net' | 'points';
  label: string;
}

function drawNineGrid(
  pdf: OfficialPdf,
  options: {
    x: number;
    top: number;
    width: number;
    results: HoleResult[];
    distances: Map<number, number>;
    label: 'IDA' | 'VUELTA';
    summary: ScorecardTotals['out'];
    sources?: BestBallSource[];
  },
): number {
  const page = pdf.currentPage;
  const rows: GridRow[] = [
    { key: 'par', label: 'Par' },
    { key: 'si', label: 'SI' },
    { key: 'distance', label: 'Metros' },
    { key: 'received', label: 'Recibe' },
    ...(options.sources && options.sources.length > 0
      ? ([{ key: 'source', label: 'Jugador' }] as GridRow[])
      : []),
    { key: 'gross', label: 'Bruto' },
    { key: 'net', label: 'Neto' },
    { key: 'points', label: 'Puntos' },
  ];
  const headerHeight = 28;
  const rowHeight = options.sources && options.sources.length > 0 ? 27 : 29;
  const height = headerHeight + rows.length * rowHeight;
  const y = options.top - height;
  const padding = 6;
  const labelWidth = 40;
  const totalWidth = 28;
  const holeWidth = (options.width - padding * 2 - labelWidth - totalWidth) / 9;
  const sourceByHole = new Map((options.sources ?? []).map((source) => [source.holeNumber, source]));

  drawRoundedBox(page, {
    x: options.x,
    y,
    width: options.width,
    height,
    radius: 10,
    fill: C.surface,
    border: C.lineStrong,
    borderWidth: 0.8,
  });
  drawRoundedFill(page, options.x, options.top - headerHeight, options.width, headerHeight, 10, C.navy700);
  page.drawRectangle({
    x: options.x,
    y: options.top - headerHeight,
    width: options.width,
    height: headerHeight - 10,
    color: C.navy700,
  });

  const innerX = options.x + padding;
  page.drawText('Hoyo', {
    x: innerX + 4,
    y: options.top - 19,
    font: pdf.fonts.bold,
    size: 7.4,
    color: C.ivory,
  });
  options.results.forEach((result, index) => {
    const centerX = innerX + labelWidth + index * holeWidth + holeWidth / 2;
    const number = String(result.holeNumber);
    page.drawText(number, {
      x: centerX - textWidth(pdf.fonts.bold, number, 7.2) / 2,
      y: options.top - 19,
      font: pdf.fonts.bold,
      size: 7.6,
      color: C.surface,
    });
  });
  page.drawText(options.label, {
    x: innerX + labelWidth + 9 * holeWidth + 3,
    y: options.top - 19,
    font: pdf.fonts.bold,
    size: 6.8,
    color: C.ivory,
  });

  const netTotal = options.results.reduce((sum, result) => sum + (result.netStrokes ?? 0), 0);
  const parTotal = options.results.reduce((sum, result) => sum + result.par, 0);
  const distanceTotal = options.results.reduce(
    (sum, result) => sum + (options.distances.get(result.holeNumber) ?? 0),
    0,
  );
  const receivedTotal = options.results.reduce((sum, result) => sum + result.strokesReceived, 0);

  rows.forEach((row, rowIndex) => {
    const rowTop = options.top - headerHeight - rowIndex * rowHeight;
    const rowY = rowTop - rowHeight;
    if (rowIndex % 2 === 1) {
      page.drawRectangle({
        x: options.x + 1,
        y: rowY,
        width: options.width - 2,
        height: rowHeight,
        color: C.surface2,
      });
    }
    page.drawLine({
      start: { x: options.x + 1, y: rowY },
      end: { x: options.x + options.width - 1, y: rowY },
      thickness: 0.35,
      color: C.line,
    });
    page.drawText(row.label, {
      x: innerX + 3,
      y: rowY + rowHeight / 2 - 2.5,
      font: pdf.fonts.bold,
      size: row.label.length > 6 ? 6.5 : 7.1,
      color: row.key === 'points' ? C.fairwayDeep : C.ink2,
    });

    options.results.forEach((result, index) => {
      const cellX = innerX + labelWidth + index * holeWidth;
      const centerX = cellX + holeWidth / 2;
      const centerY = rowY + rowHeight / 2;
      let value = '';
      switch (row.key) {
        case 'par':
          value = String(result.par);
          break;
        case 'si':
          value = String(result.strokeIndex);
          break;
        case 'distance':
          value = String(options.distances.get(result.holeNumber) ?? '·');
          break;
        case 'received':
          value = result.strokesReceived === 0 ? '·' : String(result.strokesReceived);
          break;
        case 'net':
          value = result.netStrokes === null ? '·' : String(result.netStrokes);
          break;
        case 'source': {
          const source = sourceByHole.get(result.holeNumber);
          if (source) {
            drawRoundedFill(page, cellX + 2, rowY + 4, holeWidth - 4, rowHeight - 8, 4, fromCssColor(source.color), 0.18);
            const label = fitText(pdf.fonts.bold, source.shortLabel, 6.4, holeWidth - 5, 5.2);
            page.drawText(label.text, {
              x: centerX - textWidth(pdf.fonts.bold, label.text, label.size) / 2,
              y: centerY - 2,
              font: pdf.fonts.bold,
              size: label.size,
              color: C.navy800,
            });
          } else {
            value = '·';
          }
          break;
        }
        case 'gross':
          drawScoreShape(page, pdf.fonts.bold, result, centerX, centerY);
          return;
        case 'points':
          drawPointCell(page, pdf.fonts.bold, result, cellX, rowY, holeWidth, rowHeight);
          return;
      }
      if (value !== '') {
        const size = row.key === 'distance' ? 6.1 : 7.4;
        page.drawText(value, {
          x: centerX - textWidth(pdf.fonts.regular, value, size) / 2,
          y: centerY - 2.5,
          font: row.key === 'received' ? pdf.fonts.bold : pdf.fonts.regular,
          size,
          color: C.ink,
        });
      }
    });

    let total = '';
    switch (row.key) {
      case 'par':
        total = String(parTotal);
        break;
      case 'distance':
        total = String(distanceTotal);
        break;
      case 'received':
        total = String(receivedTotal);
        break;
      case 'gross':
        total = String(options.summary.numericStrokes);
        break;
      case 'net':
        total = String(netTotal);
        break;
      case 'points':
        total = String(options.summary.points);
        break;
      default:
        total = '';
    }
    if (total !== '') {
      const centerX = innerX + labelWidth + 9 * holeWidth + totalWidth / 2;
      if (row.key === 'points') {
        drawRoundedFill(page, centerX - 10, rowY + 4, 20, rowHeight - 8, 5, C.navy700);
        page.drawText(total, {
          x: centerX - textWidth(pdf.fonts.bold, total, 7.5) / 2,
          y: rowY + rowHeight / 2 - 2.5,
          font: pdf.fonts.bold,
          size: 7.5,
          color: C.surface,
        });
      } else {
        const size = row.key === 'distance' ? 6.1 : 7.4;
        page.drawText(total, {
          x: centerX - textWidth(pdf.fonts.bold, total, size) / 2,
          y: rowY + rowHeight / 2 - 2.5,
          font: pdf.fonts.bold,
          size,
          color: C.navy700,
        });
      }
    }
  });

  return height;
}

function drawScorecardIdentity(
  pdf: OfficialPdf,
  document: ScorecardDocument,
  options: { pointsMultiplierLabel?: string } = {},
): void {
  const page = pdf.currentPage;
  const height = 86;
  const y = pdf.cursorY - height;
  drawCard(page, { x: PAGE_MARGIN, y, width: CONTENT_WIDTH, height, radius: 15, fill: C.surface });
  page.drawRectangle({ x: PAGE_MARGIN, y: y + 12, width: 5, height: height - 24, color: fromCssColor(document.player.color, C.navy500) });

  const name = fitText(pdf.fonts.bold, document.player.displayName, 16, 315, 10);
  page.drawText(name.text, {
    x: PAGE_MARGIN + 18,
    y: y + 57,
    font: pdf.fonts.bold,
    size: name.size,
    color: C.ink,
  });
  const meta = [
    `Hándicap exacto ${formatHandicap(document.player.handicapIndexTenths)}`,
    `Hándicap de juego ${document.player.playingHandicap}`,
    document.player.flightName ? `Partido: ${document.player.flightName}` : 'Sin partido',
    document.player.teeTime ? formatTeeTime(document.player.teeTime) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const metaFit = fitText(pdf.fonts.regular, meta, 8.5, 350, 6.8);
  page.drawText(metaFit.text, {
    x: PAGE_MARGIN + 18,
    y: y + 36,
    font: pdf.fonts.regular,
    size: metaFit.size,
    color: C.ink2,
  });
  drawPill(page, pdf.fonts, statusLabel(document.player.status), {
    x: PAGE_MARGIN + 18,
    y: y + 11,
    fill: C.navy100,
    textColor: C.navy700,
    height: 18,
    size: 6.7,
  });

  const points = String(document.totals.total.points);
  drawRoundedFill(page, A4.width - PAGE_MARGIN - 90, y + 17, 80, 54, 14, C.navy700);
  page.drawText(points, {
    x: A4.width - PAGE_MARGIN - 50 - textWidth(pdf.fonts.bold, points, 24) / 2,
    y: y + 41,
    font: pdf.fonts.bold,
    size: 24,
    color: C.surface,
  });
  page.drawText(options.pointsMultiplierLabel ?? 'puntos', {
    x:
      A4.width -
      PAGE_MARGIN -
      50 -
      textWidth(pdf.fonts.regular, options.pointsMultiplierLabel ?? 'puntos', 7) / 2,
    y: y + 27,
    font: pdf.fonts.regular,
    size: 7,
    color: C.ivory,
  });

  pdf.cursorY = y - 16;
}

function drawScorecardSummary(pdf: OfficialPdf, document: ScorecardDocument): void {
  const page = pdf.currentPage;
  const total = document.totals.total;
  const height = 100;
  const y = pdf.cursorY - height;
  drawCard(page, { x: PAGE_MARGIN, y, width: CONTENT_WIDTH, height, radius: 13, fill: C.surface });

  const stats = [
    { label: 'Puntos', value: String(total.points), fill: C.fairwayWash, ink: C.fairwayDeep },
    { label: 'Hoyos', value: `${total.holesPlayed}/18`, fill: C.navy100, ink: C.navy700 },
    { label: 'Golpes escritos', value: String(total.numericStrokes), fill: C.surface3, ink: C.ink },
    { label: 'Rayas', value: String(total.pickups), fill: total.pickups > 0 ? C.birdieWash : C.surface3, ink: total.pickups > 0 ? C.birdieDeep : C.ink2 },
  ];
  const gap = 8;
  const width = (CONTENT_WIDTH - 28 - gap * (stats.length - 1)) / stats.length;
  stats.forEach((stat, index) => {
    const x = PAGE_MARGIN + 14 + index * (width + gap);
    drawRoundedFill(page, x, y + 42, width, 44, 10, stat.fill);
    page.drawText(stat.label, {
      x: x + 8,
      y: y + 69,
      font: pdf.fonts.regular,
      size: 6.5,
      color: stat.ink,
    });
    const fitted = fitText(pdf.fonts.bold, stat.value, 13, width - 16, 9);
    page.drawText(fitted.text, {
      x: x + 8,
      y: y + 50,
      font: pdf.fonts.bold,
      size: fitted.size,
      color: stat.ink,
    });
  });

  let note: string;
  let noteColor: Color;
  if (total.isGrossComplete && total.grossToPar !== null) {
    const toPar =
      total.grossToPar === 0
        ? 'Resultado bruto: Par del campo.'
        : total.grossToPar > 0
          ? `Resultado bruto: ${total.grossToPar} sobre par.`
          : `Resultado bruto: ${Math.abs(total.grossToPar)} bajo par.`;
    note = toPar;
    noteColor = C.ink2;
  } else {
    note = `Resultado bruto incompleto${total.pickups > 0 ? ` · ${total.pickups} ${total.pickups === 1 ? 'raya' : 'rayas'}` : ''}. Golpes ajustados para desempate: ${total.adjustedStrokes}.`;
    noteColor = C.birdieDeep;
  }
  const lines = wrapText(pdf.fonts.regular, note, 7.8, CONTENT_WIDTH - 28);
  lines.slice(0, 2).forEach((line, index) => {
    page.drawText(line, {
      x: PAGE_MARGIN + 14,
      y: y + 26 - index * 11,
      font: index === 0 ? pdf.fonts.bold : pdf.fonts.regular,
      size: 7.8,
      color: noteColor,
    });
  });

  pdf.cursorY = y - 8;
}

function drawScorecardPage(
  pdf: OfficialPdf,
  document: ScorecardDocument,
  options: {
    label: string;
    title: string;
    subtitle: string;
    distances: Map<number, number>;
    pointsMultiplierLabel?: string;
  },
): void {
  pdf.newStandalonePage({ label: options.label, title: options.title, subtitle: options.subtitle });
  drawScorecardIdentity(pdf, document, { pointsMultiplierLabel: options.pointsMultiplierLabel });

  const out = document.results.filter((result) => result.holeNumber <= 9);
  const inside = document.results.filter((result) => result.holeNumber >= 10);
  const gap = 10;
  const width = (CONTENT_WIDTH - gap) / 2;
  const top = pdf.cursorY;
  const outHeight = drawNineGrid(pdf, {
    x: PAGE_MARGIN,
    top,
    width,
    results: out,
    distances: options.distances,
    label: 'IDA',
    summary: document.totals.out,
    sources: document.sources,
  });
  const inHeight = drawNineGrid(pdf, {
    x: PAGE_MARGIN + width + gap,
    top,
    width,
    results: inside,
    distances: options.distances,
    label: 'VUELTA',
    summary: document.totals.in,
    sources: document.sources,
  });
  pdf.cursorY = top - Math.max(outHeight, inHeight) - 14;
  drawScorecardSummary(pdf, document);
}

function drawFlightsSection(
  pdf: OfficialPdf,
  flights: FlightDrawDocument[],
  seed: string | null,
): void {
  pdf.startSection({
    label: 'Fase 1',
    title: 'Sorteo de partidos',
    subtitle: 'Composición confirmada y trazabilidad del sorteo',
  });
  drawSectionIntro(pdf, {
    primary: `${flights.length} partidos`,
    secondary: `${flights.reduce((sum, flight) => sum + flight.members.length, 0)} participantes`,
    tertiary: flights.length > 0 ? 'Partidos confirmados' : 'Pendiente de confirmación',
  });
  if (flights.length === 0) {
    drawEmptyState(
      pdf,
      'Aun no hay partidos confirmados',
      'El documento conservara esta seccion preparada hasta que se complete y confirme el sorteo de partidos.',
    );
  } else {
    flights.forEach((flight) => drawFlightCard(pdf, flight));
  }
  pdf.drawSeed(
    'Semilla del sorteo de partidos',
    seed,
    flights.length === 0
      ? 'Pendiente: todavia no hay partidos confirmados.'
      : 'Sin semilla guardada para esta composicion confirmada.',
  );
}

function drawPairsSection(
  pdf: OfficialPdf,
  pairs: PairScorecardDocument[],
  seed: string | null,
): void {
  pdf.startSection({
    label: 'Fase 2',
    title: 'Sorteo de parejas',
    subtitle: 'Equipos calculados sobre los partidos confirmados',
  });
  const solo = pairs.find((pair) => pair.isSolo);
  drawSectionIntro(pdf, {
    primary: `${pairs.length} equipos`,
    secondary: solo ? 'Incluye individual x2' : 'Todas son parejas',
    tertiary: pairs[0] ? PAIR_SCORING_LABELS[pairs[0].scoringMode] : 'Modalidad de parejas',
  });
  pairs.forEach((pair) => drawPairAssignmentCard(pdf, pair));
  pdf.drawSeed(
    'Semilla del sorteo de parejas',
    seed,
    pairs.length === 0
      ? 'Pendiente: todavia no hay parejas sorteadas.'
      : 'Sin semilla reproducible: la composicion incluye ajustes manuales o procede de una version anterior.',
  );
}

function drawIndividualLeaderboardSection(
  pdf: OfficialPdf,
  rows: LeaderboardExportRow[],
  seed: string | null | undefined,
): void {
  pdf.startSection({
    label: 'Resultados',
    title: pdf.provisional ? 'Clasificación individual provisional' : 'Clasificación individual final',
    subtitle: 'Individual Stableford · clasificación oficial del torneo',
  });
  drawSectionIntro(pdf, {
    primary: `${rows.length} jugadores`,
    secondary: 'Individual Stableford',
    tertiary: pdf.provisional ? 'Documento provisional' : 'Documento definitivo',
  });
  const leaderPoints = rows[0]?.points ?? 0;
  if (rows.length === 0) {
    drawEmptyState(
      pdf,
      'Clasificacion pendiente',
      'Todavia no hay resultados elegibles para construir la clasificacion individual.',
    );
  } else {
    rows.forEach((row) => drawLeaderboardRow(pdf, row, leaderPoints));
  }
  pdf.ensureSpace(38);
  const noteY = pdf.cursorY - 28;
  drawRoundedFill(pdf.currentPage, PAGE_MARGIN, noteY, CONTENT_WIDTH, 28, 9, C.navy50);
  pdf.currentPage.drawText(
    safe('Desempates: más puntos, menor HCP exacto y menor suma de golpes ajustados.'),
    {
      x: PAGE_MARGIN + 12,
      y: noteY + 10,
      font: pdf.fonts.regular,
      size: 7.5,
      color: C.ink2,
    },
  );
  pdf.cursorY = noteY - 9;
  if (seed !== undefined) {
    pdf.drawSeed(
      'Semilla de los partidos de esta clasificación',
      seed,
      'Sin semilla guardada para los partidos confirmados.',
    );
  }
}

function drawPairLeaderboardSection(
  pdf: OfficialPdf,
  rows: PairLeaderboardExportRow[],
  scoringMode: PairScoringMode,
  seed: string | null | undefined,
): void {
  pdf.startSection({
    label: 'Resultados',
    title: pdf.provisional ? 'Clasificación por parejas provisional' : 'Clasificación por parejas final',
    subtitle: PAIR_SCORING_LABELS[scoringMode],
  });
  drawSectionIntro(pdf, {
    primary: `${rows.length} equipos`,
    secondary: PAIR_SCORING_LABELS[scoringMode],
    tertiary: pdf.provisional ? 'Documento provisional' : 'Documento definitivo',
  });
  if (rows.length === 0) {
    drawEmptyState(
      pdf,
      'Clasificacion de parejas pendiente',
      'Las parejas existen, pero todavia no hay resultados elegibles para ordenarlas.',
    );
  } else {
    rows.forEach((row) => drawPairLeaderboardRow(pdf, row));
  }
  pdf.ensureSpace(38);
  const noteY = pdf.cursorY - 28;
  drawRoundedFill(pdf.currentPage, PAGE_MARGIN, noteY, CONTENT_WIDTH, 28, 9, C.navy50);
  pdf.currentPage.drawText(
    safe('Desempates: más puntos, menor HCP total y menor suma de golpes ajustados.'),
    {
      x: PAGE_MARGIN + 12,
      y: noteY + 10,
      font: pdf.fonts.regular,
      size: 7.5,
      color: C.ink2,
    },
  );
  pdf.cursorY = noteY - 9;
  if (seed !== undefined) {
    pdf.drawSeed(
      'Semilla de las parejas de esta clasificación',
      seed,
      'Sin semilla reproducible: la composición incluye ajustes manuales o procede de una versión anterior.',
    );
  }
}

function memberToScorecard(member: PairScorecardDocument['members'][number]): ScorecardDocument {
  return {
    player: {
      displayName: member.displayName,
      color: member.color,
      handicapIndexTenths: member.handicapIndexTenths ?? 0,
      playingHandicap: member.playingHandicap ?? 0,
      flightName: member.flightName,
      teeTime: null,
      status: member.status,
    },
    results: member.results,
    totals: member.totals,
  };
}

function drawIndividualScorecards(
  pdf: OfficialPdf,
  cards: ScorecardDocument[],
  distances: Map<number, number>,
): void {
  cards.forEach((card, index) => {
    drawScorecardPage(pdf, card, {
      label: 'Tarjetas individuales',
      title: `Tarjeta ${index + 1} de ${cards.length}`,
      subtitle: card.player.displayName,
      distances,
    });
  });
}

function drawPairScorecards(
  pdf: OfficialPdf,
  pairs: PairScorecardDocument[],
  distances: Map<number, number>,
): void {
  pairs.forEach((pair) => {
    if (pair.results && pair.totals) {
      const title = pair.isSolo
        ? `Equipo ${pair.pairNumber} · individual x2`
        : `Pareja ${pair.pairNumber} · mejor bola`;
      const document: ScorecardDocument = {
        player: {
          displayName: pair.displayName,
          color: pair.colors[0],
          handicapIndexTenths: pair.handicapIndexTenths ?? 0,
          playingHandicap: pair.playingHandicap ?? 0,
          flightName: pair.isSolo ? pair.members[0]?.flightName ?? null : 'Jugadores de partidos distintos',
          teeTime: null,
          status: pair.members.every((member) => member.status === 'LOCKED') ? 'LOCKED' : 'IN_PLAY',
        },
        results: pair.results,
        totals: pair.totals,
        sources: pair.sources,
      };
      drawScorecardPage(pdf, document, {
        label: 'Tarjetas de parejas',
        title,
        subtitle: PAIR_SCORING_LABELS[pair.scoringMode],
        distances,
        pointsMultiplierLabel: pair.isSolo ? 'puntos x2' : 'puntos',
      });
      return;
    }

    pair.members.forEach((member, index) => {
      drawScorecardPage(pdf, memberToScorecard(member), {
        label: 'Tarjetas de parejas',
        title: `Pareja ${pair.pairNumber} · integrante ${index + 1} de ${pair.members.length}`,
        subtitle: `${pair.displayName} · ${PAIR_SCORING_LABELS[pair.scoringMode]}`,
        distances,
      });
    });
  });
}

export interface LeaderboardPdfInput {
  header: CompetitionHeader;
  rows: LeaderboardExportRow[];
  request: ExportRequest;
  flightDrawSeed?: string | null;
  generatedAt?: Date;
}

/** Clasificación individual, maquetada como el leaderboard de la app. */
export async function buildLeaderboardPdf(input: LeaderboardPdfInput): Promise<Uint8Array> {
  const { requiresProvisionalMark } = assertCanExport(input.request);
  const pdf = await OfficialPdf.create(input.header, {
    generatedAt: input.generatedAt,
    provisional: requiresProvisionalMark,
  });
  drawIndividualLeaderboardSection(pdf, input.rows, input.flightDrawSeed);
  return pdf.save();
}

export interface PairLeaderboardPdfInput {
  header: CompetitionHeader;
  rows: PairLeaderboardExportRow[];
  scoringMode: PairScoringMode;
  request: ExportRequest;
  pairDrawSeed?: string | null;
  generatedAt?: Date;
}

export async function buildPairLeaderboardPdf(
  input: PairLeaderboardPdfInput,
): Promise<Uint8Array> {
  const { requiresProvisionalMark } = assertCanExport(input.request);
  const pdf = await OfficialPdf.create(input.header, {
    generatedAt: input.generatedAt,
    provisional: requiresProvisionalMark,
  });
  drawPairLeaderboardSection(pdf, input.rows, input.scoringMode, input.pairDrawSeed);
  return pdf.save();
}

export interface ScorecardPdfInput {
  header: CompetitionHeader;
  player: ScorecardPdfPlayer;
  results: HoleResult[];
  distances: Map<number, number>;
  totals: ScorecardTotals;
  request: ExportRequest;
  generatedAt?: Date;
}

/** PDF de una tarjeta individual, siempre completa en una sola pagina A4. */
export async function buildScorecardPdf(input: ScorecardPdfInput): Promise<Uint8Array> {
  const { requiresProvisionalMark } = assertCanExport(input.request);
  const pdf = await OfficialPdf.create(input.header, {
    generatedAt: input.generatedAt,
    provisional: requiresProvisionalMark,
  });
  drawScorecardPage(
    pdf,
    { player: input.player, results: input.results, totals: input.totals },
    {
      label: 'Tarjeta individual',
      title: input.player.displayName,
      subtitle: '18 hoyos · Individual Stableford',
      distances: input.distances,
    },
  );
  return pdf.save();
}

export interface FlightDrawPdfInput {
  header: CompetitionHeader;
  flights: FlightDrawDocument[];
  seed: string | null;
  generatedAt?: Date;
}

export async function buildFlightDrawPdf(input: FlightDrawPdfInput): Promise<Uint8Array> {
  const pdf = await OfficialPdf.create(input.header, { generatedAt: input.generatedAt });
  drawFlightsSection(pdf, input.flights, input.seed);
  return pdf.save();
}

export interface PairDrawPdfInput {
  header: CompetitionHeader;
  pairs: PairScorecardDocument[];
  seed: string | null;
  generatedAt?: Date;
}

export async function buildPairDrawPdf(input: PairDrawPdfInput): Promise<Uint8Array> {
  const pdf = await OfficialPdf.create(input.header, { generatedAt: input.generatedAt });
  drawPairsSection(pdf, input.pairs, input.seed);
  return pdf.save();
}

export interface IndividualScorecardsPdfInput {
  header: CompetitionHeader;
  cards: ScorecardDocument[];
  distances: Map<number, number>;
  generatedAt?: Date;
}

export async function buildIndividualScorecardsPdf(
  input: IndividualScorecardsPdfInput,
): Promise<Uint8Array> {
  const pdf = await OfficialPdf.create(input.header, { generatedAt: input.generatedAt });
  drawIndividualScorecards(pdf, input.cards, input.distances);
  return pdf.save();
}

export interface PairScorecardsPdfInput {
  header: CompetitionHeader;
  pairs: PairScorecardDocument[];
  distances: Map<number, number>;
  generatedAt?: Date;
}

export async function buildPairScorecardsPdf(
  input: PairScorecardsPdfInput,
): Promise<Uint8Array> {
  const pdf = await OfficialPdf.create(input.header, { generatedAt: input.generatedAt });
  drawPairScorecards(pdf, input.pairs, input.distances);
  return pdf.save();
}

export interface CompletePdfInput {
  header: CompetitionHeader;
  request: ExportRequest;
  individualRows: LeaderboardExportRow[];
  individualCards: ScorecardDocument[];
  flights: FlightDrawDocument[];
  flightDrawSeed: string | null;
  pairRows: PairLeaderboardExportRow[];
  pairs: PairScorecardDocument[];
  pairScoringMode: PairScoringMode;
  pairDrawSeed: string | null;
  distances: Map<number, number>;
  generatedAt?: Date;
}

/** Documento integral: sorteos, clasificaciones y todas las tarjetas. */
export async function buildCompletePdf(input: CompletePdfInput): Promise<Uint8Array> {
  const { requiresProvisionalMark } = assertCanExport(input.request);
  const pdf = await OfficialPdf.create(input.header, {
    generatedAt: input.generatedAt,
    provisional: requiresProvisionalMark,
  });
  const sections = [
    'Sorteo de partidos',
    'Clasificación individual',
    'Tarjetas individuales',
    ...(input.pairs.length > 0
      ? ['Sorteo de parejas', 'Clasificación por parejas', 'Tarjetas de parejas']
      : []),
  ];
  pdf.addCover(
    'Dossier oficial del campeonato',
    'Partidos, clasificaciones y tarjetas en un único documento A4',
    sections,
  );

  drawFlightsSection(pdf, input.flights, input.flightDrawSeed);
  drawIndividualLeaderboardSection(pdf, input.individualRows, undefined);
  drawIndividualScorecards(pdf, input.individualCards, input.distances);

  if (input.pairs.length > 0) {
    drawPairsSection(pdf, input.pairs, input.pairDrawSeed);
    drawPairLeaderboardSection(pdf, input.pairRows, input.pairScoringMode, undefined);
    drawPairScorecards(pdf, input.pairs, input.distances);
  }

  return pdf.save();
}
