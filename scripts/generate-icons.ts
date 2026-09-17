/**
 * Genera los iconos de la aplicacion desde el logo de la marca.
 *
 *   npm run gen:icons
 *
 * Fuente: `assets/logo.png`, el escudo de la Peñita recortado al cuadrado. Los
 * PNG de `public/icons/` se regeneran, no se editan a mano.
 *
 * ---------------------------------------------------------------------------
 * Dos cosas hay que arreglar del logo antes de que sirva como icono
 * ---------------------------------------------------------------------------
 *
 * 1. LAS ESQUINAS. El logo viene con las esquinas ya redondeadas. iOS y Android
 *    aplican SU PROPIA mascara, asi que un icono que ya viene redondeado se
 *    redondea dos veces: queda un marco claro alrededor de un cuadrado mas
 *    pequeno, con aspecto de pegatina mal recortada.
 *
 *    Solucion: rellenar las cuatro esquinas con el navy del borde. El icono pasa
 *    a ser un cuadrado a sangre y el sistema lo redondea una sola vez.
 *
 * 2. EL TEXTO DEL BORDE. "PEÑITA" arriba y "ULZAMA-BARIAIN" abajo van pegados al
 *    borde. Android recorta el icono maskable a un circulo que se come alrededor
 *    de un 10 % por cada lado: ese texto desapareceria.
 *
 *    Solucion: la version maskable lleva el escudo al 70 % y centrado, con navy
 *    a sangre por detras. Hay un test que cuenta pixeles de crema fuera del
 *    circulo seguro y exige que sean cero.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Colores de la marca, medidos sobre el logo.
 *
 * El navy del BORDE, no el del centro: el logo tiene un degradado suave y es
 * mas claro en los bordes. Rellenar las esquinas con el navy del centro dejaria
 * una costura visible.
 */
export const BRAND = {
  navy: '#364f6e',
  cream: '#f4edde',
} as const;

/** Radio de las esquinas del logo original, medido: 22 % del lado. */
const CORNER_RADIUS_RATIO = 0.2;

/**
 * Recorte hacia dentro antes de escalar.
 *
 * El logo lleva un borde ligeramente mas claro en todo su perimetro. Sin
 * recortarlo, al rellenar las esquinas de navy ese borde se queda dentro del
 * cuadrado y se ve como un contorno redondeado fantasma, igual que si el icono
 * estuviera pegado encima de otro. Comprobado mirando el PNG generado.
 *
 * Con un 2,5 % por cada lado desaparece y no se pierde nada del escudo.
 */
const SOURCE_INSET_RATIO = 0.025;

/** Proporcion del escudo en la version maskable. */
export const MASKABLE_SCALE = 0.7;

/**
 * Umbral de luminancia para separar el escudo de su fondo.
 *
 * La crema esta en torno a 237 de luminancia y el navy en torno a 75: 150 cae
 * holgadamente en medio y no depende de afinarlo.
 */
const LUMINANCE_THRESHOLD = 150;

export const ICON_SIZES = {
  /** Android e instalacion generica. */
  standard: [192, 512],
  /** iOS: apple-touch-icon. 180 es lo que pide desde el iPhone 6 Plus. */
  apple: 180,
  /** Android adaptativo. */
  maskable: 512,
} as const;

interface SharpInstance {
  resize(options: Record<string, unknown>): SharpInstance;
  extract(options: Record<string, number>): SharpInstance;
  composite(items: Array<Record<string, unknown>>): SharpInstance;
  greyscale(): SharpInstance;
  threshold(value: number): SharpInstance;
  joinChannel(input: Buffer, options: Record<string, unknown>): SharpInstance;
  metadata(): Promise<{ width?: number; height?: number }>;
  png(options?: Record<string, unknown>): SharpInstance;
  raw(): SharpInstance;
  toBuffer(): Promise<Buffer>;
}

type SharpFactory = (input: Buffer | string | { create: Record<string, unknown> }) => SharpInstance;

export async function loadSharp(): Promise<SharpFactory> {
  const mod = (await import('sharp')) as unknown as { default?: SharpFactory };
  return (mod.default ?? mod) as SharpFactory;
}

function hexToRgb(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
    alpha: 1,
  };
}

/** Mascara de esquinas redondeadas, para recortar el redondeo del original. */
function roundedMask(size: number): Buffer {
  const radius = Math.round(size * CORNER_RADIUS_RATIO);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#ffffff"/>` +
      `</svg>`,
    'utf8',
  );
}

/** Recorta el borde claro del logo para que no asome dentro del icono. */
async function insetSource(sharp: SharpFactory, source: Buffer): Promise<Buffer> {
  const metadata = await sharp(source).metadata();
  const side = metadata.width ?? 0;
  if (side === 0) throw new Error('No se puede leer el tamano del logo.');

  const inset = Math.round(side * SOURCE_INSET_RATIO);
  return sharp(source)
    .extract({
      left: inset,
      top: inset,
      width: side - inset * 2,
      height: side - inset * 2,
    })
    .png()
    .toBuffer();
}

function navyCanvas(sharp: SharpFactory, size: number): SharpInstance {
  return sharp({
    create: { width: size, height: size, channels: 4, background: hexToRgb(BRAND.navy) },
  });
}

/** Icono a sangre: el escudo llena el cuadrado y las esquinas son navy. */
export async function buildFullBleedIcon(
  sharp: SharpFactory,
  source: Buffer,
  size: number,
): Promise<Buffer> {
  const scaled = await sharp(await insetSource(sharp, source))
    .resize({ width: size, height: size, fit: 'cover' })
    .composite([{ input: roundedMask(size), blend: 'dest-in' }])
    .png()
    .toBuffer();

  return navyCanvas(sharp, size)
    .composite([{ input: scaled }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Version maskable: el escudo recortado del fondo, al 70 % y sobre navy plano.
 *
 * La primera version pegaba el logo entero reducido, y se veia el cuadrado
 * interior con su degradado como una pegatina encima del icono. Aqui se separa
 * el escudo de su fondo por luminancia —la crema es muy clara y el navy muy
 * oscuro, asi que un umbral basta— y se compone sobre navy plano.
 *
 * El recorte redondeado sigue siendo necesario: los vertices del logo original
 * son blancos y, al ser mas claros que el umbral, se colarian como crema.
 */
export async function buildMaskableIcon(
  sharp: SharpFactory,
  source: Buffer,
  size: number,
): Promise<Buffer> {
  const inner = Math.round(size * MASKABLE_SCALE);
  const offset = Math.round((size - inner) / 2);
  const inset = await insetSource(sharp, source);

  // Mascara de luminancia: crema opaca, navy transparente.
  const luminance = await sharp(inset)
    .resize({ width: inner, height: inner, fit: 'cover' })
    .greyscale()
    .threshold(LUMINANCE_THRESHOLD)
    .raw()
    .toBuffer();

  // Dos pasadas a proposito: sharp no admite `composite` sobre el resultado de
  // `joinChannel` sin materializarlo antes ("images do not have same numbers of
  // bands"). Se escribe a PNG en medio.
  const creamArt = await sharp({
    create: { width: inner, height: inner, channels: 3, background: hexToRgb(BRAND.cream) },
  })
    .joinChannel(luminance, { raw: { width: inner, height: inner, channels: 1 } })
    .png()
    .toBuffer();

  const crest = await sharp(creamArt)
    .composite([{ input: roundedMask(inner), blend: 'dest-in' }])
    .png()
    .toBuffer();

  return navyCanvas(sharp, size)
    .composite([{ input: crest, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  const sharp = await loadSharp();
  const source = await sharp(join(process.cwd(), 'assets/logo.png')).png().toBuffer();

  const outDir = join(process.cwd(), 'public/icons');
  mkdirSync(outDir, { recursive: true });

  for (const size of ICON_SIZES.standard) {
    writeFileSync(join(outDir, `icon-${size}.png`), await buildFullBleedIcon(sharp, source, size));
  }

  writeFileSync(
    join(outDir, 'apple-touch-icon.png'),
    await buildFullBleedIcon(sharp, source, ICON_SIZES.apple),
  );

  writeFileSync(
    join(outDir, 'icon-maskable-512.png'),
    await buildMaskableIcon(sharp, source, ICON_SIZES.maskable),
  );

  console.log('Iconos generados en public/icons desde assets/logo.png:');
  console.log('  icon-192.png, icon-512.png (a sangre, el sistema los redondea)');
  console.log('  apple-touch-icon.png (180, iOS)');
  console.log('  icon-maskable-512.png (escudo al 70 %, zona segura de Android)');
}

if (process.argv[1]?.endsWith('generate-icons.ts')) {
  main().catch((error: unknown) => {
    console.error('Fallo al generar los iconos:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
