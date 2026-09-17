import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BRAND, ICON_SIZES, MASKABLE_SCALE } from '../../../../scripts/generate-icons';

const root = process.cwd();
const iconsDir = join(root, 'public/icons');

const manifest = JSON.parse(
  readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'),
) as {
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
  theme_color: string;
  background_color: string;
};

interface Pixels {
  data: Buffer;
  size: number;
  channels: number;
}

async function readPixels(file: string): Promise<Pixels> {
  const mod = (await import('sharp')) as unknown as { default?: (i: string) => unknown };
  const sharp = (mod.default ?? mod) as (input: string) => {
    raw(): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; channels: number } }> };
    metadata(): Promise<{ width?: number; height?: number; format?: string }>;
  };
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { data, size: info.width, channels: info.channels };
}

async function metadataOf(file: string) {
  const mod = (await import('sharp')) as unknown as { default?: (i: string) => unknown };
  const sharp = (mod.default ?? mod) as (input: string) => {
    metadata(): Promise<{ width?: number; height?: number; format?: string }>;
  };
  return sharp(file).metadata();
}

const pixel = ({ data, size, channels }: Pixels, x: number, y: number) => {
  const i = (y * size + x) * channels;
  return [data[i], data[i + 1], data[i + 2]] as const;
};

const isNavy = ([r, , b]: readonly number[]) => b > r + 30 && b < 160;
const isCream = ([r, g, b]: readonly number[]) => r > 200 && g > 195 && b > 175;

describe('el logo fuente esta en el repositorio', () => {
  test('assets/logo.png existe: los PNG se regeneran de el, no se editan', () => {
    assert.ok(existsSync(join(root, 'assets/logo.png')));
  });
});

describe('iconos declarados en el manifest', () => {
  test('existen todos', () => {
    for (const icon of manifest.icons) {
      assert.ok(
        existsSync(join(root, 'public', icon.src.replace(/^\//, ''))),
        `el manifest declara ${icon.src} y no existe`,
      );
    }
  });

  test('cada uno mide lo que dice el manifest', async () => {
    for (const icon of manifest.icons) {
      const metadata = await metadataOf(join(root, 'public', icon.src.replace(/^\//, '')));
      const [declared] = icon.sizes.split('x').map(Number);
      assert.equal(metadata.format, 'png', `${icon.src} no es PNG`);
      assert.equal(metadata.width, declared, `${icon.src} mide ${metadata.width}`);
      assert.equal(metadata.height, declared);
    }
  });

  test('hay icono de 192, de 512, de 180 para iOS y uno maskable', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    assert.ok(sizes.includes('192x192'));
    assert.ok(sizes.includes('512x512'));
    assert.ok(sizes.includes('180x180'), 'iOS pide 180 para apple-touch-icon');
    assert.ok(
      manifest.icons.some((icon) => icon.purpose === 'maskable'),
      'sin maskable, Android recorta el icono en circulo y se come el borde',
    );
  });
});

describe('iconos a sangre: el sistema aplica su propia mascara', () => {
  /**
   * El logo original viene con las esquinas redondeadas. Si se entrega asi, iOS
   * y Android lo redondean OTRA VEZ y queda un marco claro alrededor de un
   * cuadrado mas pequeno. Las esquinas tienen que ser navy opaco.
   */
  for (const file of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
    test(`${file}: las cuatro esquinas son navy`, async () => {
      const pixels = await readPixels(join(iconsDir, file));
      const last = pixels.size - 1;
      for (const [x, y] of [
        [0, 0],
        [last, 0],
        [0, last],
        [last, last],
      ]) {
        const corner = pixel(pixels, x, y);
        assert.ok(
          isNavy(corner),
          `esquina ${x},${y} de ${file} no es navy: ${corner.join(',')}`,
        );
      }
    });
  }

  test('no queda el halo del borde original', async () => {
    // El logo lleva un borde mas claro en su perimetro. Sin recortarlo asomaba
    // como un contorno redondeado fantasma dentro del icono. Se comprueba que
    // la diagonal desde la esquina no tiene un salto de brillo.
    const pixels = await readPixels(join(iconsDir, 'icon-512.png'));
    const blues: number[] = [];
    for (let t = 0; t < 40; t += 2) blues.push(pixel(pixels, t, t)[2]);
    const max = Math.max(...blues);
    const min = Math.min(...blues);
    assert.ok(max - min < 12, `salto de brillo de ${max - min} en la esquina: hay halo`);
  });

  test('el navy del icono es el de la marca', async () => {
    const pixels = await readPixels(join(iconsDir, 'icon-512.png'));
    const [r, g, b] = pixel(pixels, 0, 0);
    const expected = [
      Number.parseInt(BRAND.navy.slice(1, 3), 16),
      Number.parseInt(BRAND.navy.slice(3, 5), 16),
      Number.parseInt(BRAND.navy.slice(5, 7), 16),
    ];
    assert.deepEqual([r, g, b], expected);
  });
});

describe('zona segura del icono maskable', () => {
  test('Android recorta al circulo del 80 % y no se pierde nada del escudo', async () => {
    const pixels = await readPixels(join(iconsDir, 'icon-maskable-512.png'));
    const radius = pixels.size * 0.4;
    const centre = pixels.size / 2;
    let inside = 0;
    let outside = 0;

    for (let y = 0; y < pixels.size; y += 1) {
      for (let x = 0; x < pixels.size; x += 1) {
        if (!isCream(pixel(pixels, x, y))) continue;
        if ((x - centre) ** 2 + (y - centre) ** 2 <= radius ** 2) inside += 1;
        else outside += 1;
      }
    }

    assert.ok(inside > 3000, `el escudo casi no se ve: solo ${inside} pixeles`);
    assert.equal(outside, 0, `${outside} pixeles del escudo se recortarian en Android`);
  });

  test('el maskable sangra hasta el borde, sin esquinas claras ni transparentes', async () => {
    const pixels = await readPixels(join(iconsDir, 'icon-maskable-512.png'));
    const last = pixels.size - 1;
    for (const [x, y] of [
      [0, 0],
      [last, 0],
      [0, last],
      [last, last],
    ]) {
      assert.ok(isNavy(pixel(pixels, x, y)), `esquina ${x},${y} del maskable no es navy`);
    }
  });

  test('el escudo NO llena el lienzo: el maskable necesita margen', async () => {
    // Si ocupase el 100 %, "PEÑITA" y "ULZAMA-BARIAIN" quedarian fuera del
    // circulo. El escalado esta declarado y este test lo fija.
    assert.ok(MASKABLE_SCALE <= 0.75, `escala ${MASKABLE_SCALE}: demasiado grande para el recorte`);
    assert.ok(MASKABLE_SCALE >= 0.6, `escala ${MASKABLE_SCALE}: el escudo quedaria diminuto`);
  });

  test('en el maskable no se cuelan los vertices blancos del logo original', async () => {
    // Los vertices del logo son blancos y, al separar el escudo por luminancia,
    // pasarian el umbral y apareceran como cuatro cunas de crema.
    const pixels = await readPixels(join(iconsDir, 'icon-maskable-512.png'));
    const inner = Math.round(pixels.size * MASKABLE_SCALE);
    const offset = Math.round((pixels.size - inner) / 2);
    // Justo dentro de cada vertice del escudo reducido.
    const nudge = Math.round(inner * 0.04);
    for (const [x, y] of [
      [offset + nudge, offset + nudge],
      [offset + inner - nudge, offset + nudge],
      [offset + nudge, offset + inner - nudge],
      [offset + inner - nudge, offset + inner - nudge],
    ]) {
      assert.ok(
        isNavy(pixel(pixels, x, y)),
        `el vertice ${x},${y} del escudo no es navy: se ha colado el blanco del original`,
      );
    }
  });
});

describe('coherencia de colores', () => {
  test('el manifest usa los colores de la marca, no los de la interfaz', () => {
    assert.equal(manifest.theme_color, BRAND.navy);
    assert.equal(manifest.background_color, BRAND.cream);
  });

  test('los colores de la marca estan en los tokens y no se han desincronizado', () => {
    const tokens = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
    assert.match(tokens, new RegExp(`--color-brand: ${BRAND.navy}`));
    assert.match(tokens, new RegExp(`--color-brand-ink: ${BRAND.cream}`));
  });

  test('la barra de estado del layout usa el navy de la marca', () => {
    const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
    assert.match(layout, new RegExp(`themeColor: '${BRAND.navy}'`));
    assert.match(layout, /apple-touch-icon\.png/);
  });

  test('los tamanos declarados en el script son los que usa el manifest', () => {
    const sizes = manifest.icons.map((icon) => Number(icon.sizes.split('x')[0]));
    for (const size of ICON_SIZES.standard) assert.ok(sizes.includes(size));
    assert.ok(sizes.includes(ICON_SIZES.apple));
    assert.ok(sizes.includes(ICON_SIZES.maskable));
  });
});

describe('accesos directos del manifest', () => {
  test('apuntan a rutas reales de la aplicacion', () => {
    const shortcuts = (manifest as unknown as { shortcuts: Array<{ url: string }> }).shortcuts;
    for (const shortcut of shortcuts) {
      assert.ok(
        existsSync(join(root, 'src/app', shortcut.url.replace(/^\//, ''), 'page.tsx')),
        `el acceso directo ${shortcut.url} no tiene pagina`,
      );
    }
  });
});
