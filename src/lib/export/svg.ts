/**
 * Exportacion a imagen (seccion 63).
 *
 * Se genera SVG con concatenacion de cadenas: **cero dependencias**. Eso lo hace
 * funcionar en cualquier sitio, incluida una funcion serverless de Vercel, sin
 * navegador sin cabeza ni binarios nativos.
 *
 * El SVG se puede rasterizar a PNG despues (ver docs/exports.md). Se mantiene el
 * SVG como formato canonico porque el PNG depende de que haya fuentes instaladas
 * en el entorno, y las fuentes de una funcion serverless no son las de un
 * portatil. El SVG lleva una pila de fuentes con reservas y se ve igual en
 * cualquier navegador.
 */

import { escapeXml, formatDate, formatHandicap, truncate } from './text';
import { assertCanExport, type ExportRequest } from './guards';
import type { CompetitionHeader, LeaderboardExportRow } from './pdf';

const PALETTE = {
  background: '#f2f6f1',
  card: '#ffffff',
  ink: '#1c2620',
  muted: '#55655c',
  accent: '#2f6b46',
  line: '#d3ded4',
  warning: '#b4443c',
  gold: '#d4af37',
  silver: '#aeb6bf',
  bronze: '#cd7f32',
} as const;

const PODIUM_COLOR: Record<number, string> = {
  1: PALETTE.gold,
  2: PALETTE.silver,
  3: PALETTE.bronze,
};

/**
 * Formato vertical 1080x1350: es la proporcion que no recorta WhatsApp ni
 * Instagram, que es donde va a acabar esta imagen.
 */
const WIDTH = 1080;
/**
 * 104 y no 92: con 92 la barra de progreso caia justo sobre la linea del
 * hándicap y parecia un subrayado. Detectado mirando el PNG generado, no por
 * los tests: el marcado era correcto y la maqueta estaba mal.
 */
const ROW_HEIGHT = 104;
const HEADER_HEIGHT = 300;
const FOOTER_HEIGHT = 80;
/** Alto minimo para que con pocos jugadores no salga una tira. */
const MIN_HEIGHT = 800;

export interface LeaderboardSvgInput {
  header: CompetitionHeader;
  rows: LeaderboardExportRow[];
  playerColors?: Map<string, string>;
  request: ExportRequest;
  generatedAt?: Date;
}

export function buildLeaderboardSvg(input: LeaderboardSvgInput): string {
  const { requiresProvisionalMark } = assertCanExport(input.request);
  const rows = input.rows;
  /**
   * El alto se ajusta al contenido. Antes estaba fijado en 1350 para respetar la
   * proporcion 4:5 de WhatsApp, y con cinco jugadores dejaba media imagen en
   * blanco. Se prefiere una imagen ajustada a una imagen con hueco.
   */
  const height = Math.max(
    MIN_HEIGHT,
    HEADER_HEIGHT + rows.length * ROW_HEIGHT + FOOTER_HEIGHT + (requiresProvisionalMark ? 70 : 0),
  );

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeXml(
      `Clasificacion de ${input.header.edition}`,
    )}">`,
  );
  parts.push(
    `<style>text{font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;fill:${PALETTE.ink}}` +
      `.muted{fill:${PALETTE.muted}}.num{font-variant-numeric:tabular-nums}</style>`,
  );
  parts.push(`<rect width="${WIDTH}" height="${height}" fill="${PALETTE.background}"/>`);

  let y = 88;

  parts.push(
    `<text x="64" y="${y}" font-size="46" font-weight="700" fill="${PALETTE.accent}">${escapeXml(
      input.header.name,
    )}</text>`,
  );
  y += 44;
  parts.push(
    `<text x="64" y="${y}" font-size="24" class="muted">${escapeXml(input.header.edition)}</text>`,
  );
  y += 40;
  parts.push(
    `<text x="64" y="${y}" font-size="20" class="muted">${escapeXml(
      `${input.header.courseName} - barras ${input.header.teeColor.toLowerCase()} - ${formatDate(
        input.header.date,
      )}`,
    )}</text>`,
  );
  y += 36;
  parts.push(
    `<text x="64" y="${y}" font-size="20" class="muted">${escapeXml(
      `${input.header.modality.replace(/_/g, ' ').toLowerCase()} - asignacion ${input.header.handicapAllowancePercent} %`,
    )}</text>`,
  );
  y += 44;

  if (requiresProvisionalMark) {
    parts.push(
      `<rect x="64" y="${y - 30}" width="${WIDTH - 128}" height="52" rx="12" fill="#f5ecd2" stroke="${PALETTE.warning}" stroke-width="2"/>`,
    );
    parts.push(
      `<text x="88" y="${y + 4}" font-size="24" font-weight="700" fill="${PALETTE.warning}">PROVISIONAL - no es la clasificacion definitiva</text>`,
    );
    y += 70;
  }

  parts.push(
    `<line x1="64" y1="${y}" x2="${WIDTH - 64}" y2="${y}" stroke="${PALETTE.line}" stroke-width="2"/>`,
  );
  y += 30;

  const leaderPoints = rows.length > 0 ? Math.max(...rows.map((r) => r.points)) : 0;

  for (const row of rows) {
    const podium = PODIUM_COLOR[row.position];
    const playerColor = input.playerColors?.get(row.displayName) ?? PALETTE.accent;

    parts.push(
      `<rect x="64" y="${y}" width="${WIDTH - 128}" height="${ROW_HEIGHT - 12}" rx="16" fill="${PALETTE.card}"${
        podium ? ` stroke="${podium}" stroke-width="3"` : ''
      }/>`,
    );

    const nameY = y + 40;
    parts.push(
      `<text x="96" y="${nameY}" font-size="${row.position === 1 ? 40 : 32}" font-weight="700" class="num" text-anchor="middle">${escapeXml(
        `${row.isSharedPosition ? '=' : ''}${row.position}`,
      )}</text>`,
    );
    parts.push(
      `<rect x="122" y="${y + 16}" width="8" height="${ROW_HEIGHT - 52}" rx="4" fill="${playerColor}"/>`,
    );
    parts.push(
      `<text x="150" y="${nameY}" font-size="${row.position === 1 ? 34 : 28}" font-weight="600">${escapeXml(
        truncate(row.displayName, 26),
      )}</text>`,
    );
    parts.push(
      `<text x="150" y="${nameY + 24}" font-size="18" class="muted num">${escapeXml(
        `Hcp ${formatHandicap(row.handicapIndexTenths)} - HJ ${row.playingHandicap}${
          row.pickups > 0
            ? ` - ${row.pickups} ${row.pickups === 1 ? 'raya' : 'rayas'} - aj. ${row.adjustedStrokes}`
            : ''
        }`,
      )}</text>`,
    );
    parts.push(
      `<text x="${WIDTH - 96}" y="${nameY + 10}" font-size="${row.position === 1 ? 46 : 38}" font-weight="700" text-anchor="end" class="num">${row.points}</text>`,
    );

    // Barra decorativa relativa al lider. No afecta a la clasificacion.
    const barWidth = leaderPoints > 0 ? Math.round(((WIDTH - 260) * row.points) / leaderPoints) : 0;
    parts.push(
      `<rect x="150" y="${nameY + 36}" width="${barWidth}" height="6" rx="3" fill="${playerColor}" opacity="0.45"/>`,
    );

    y += ROW_HEIGHT;
  }

  const generatedAt = input.generatedAt ?? new Date();
  parts.push(
    `<text x="64" y="${height - 36}" font-size="16" class="muted">${escapeXml(
      `Generado el ${formatDate(generatedAt.toISOString())} - ${input.header.handicapRuleVersion}`,
    )}</text>`,
  );

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Rasteriza el SVG a PNG con sharp, si esta disponible.
 *
 * Import dinamico a proposito: sharp es una dependencia nativa y no debe romper
 * el arranque de la aplicacion si no esta instalada. El SVG sigue siendo el
 * formato canonico; esto es una comodidad para compartir por WhatsApp.
 *
 * Aviso: el texto se rasteriza con las fuentes del sistema. En Vercel no estan
 * las mismas que en un portatil, asi que el PNG puede verse distinto. Para algo
 * que tenga que ser fiel, usar el PDF.
 */
export async function rasterizeSvgToPng(svg: string): Promise<Uint8Array> {
  let sharp: (input: Buffer) => { png: () => { toBuffer: () => Promise<Buffer> } };
  try {
    const moduleName = 'sharp';
    const mod = (await import(/* webpackIgnore: true */ moduleName)) as unknown as {
      default?: typeof sharp;
    };
    sharp = (mod.default ?? mod) as typeof sharp;
  } catch {
    throw new Error(
      'El rasterizado a PNG necesita sharp instalado. El SVG se genera sin dependencias.',
    );
  }

  const buffer = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  return new Uint8Array(buffer);
}
