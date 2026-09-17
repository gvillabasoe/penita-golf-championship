import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_SHELL,
  CACHE_VERSION,
  cachesToClearOnLogout,
  decideStrategy,
  isCacheable,
  NEVER_CACHE,
  staleCaches,
} from '../cache-policy';

const get = (path: string, extra: Record<string, unknown> = {}) => ({
  path,
  method: 'GET',
  ...extra,
});

describe('lo que NUNCA se guarda en cache', () => {
  test('ninguna escritura se cachea, sea la ruta que sea', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      assert.equal(decideStrategy({ path: '/api/course/ulzama', method }), 'NEVER_STORE');
      assert.equal(decideStrategy({ path: '/_next/static/chunk.js', method }), 'NEVER_STORE');
    }
  });

  test('autenticacion, sesion y cierre de sesion', () => {
    for (const path of ['/api/auth/login', '/api/session', '/login', '/logout']) {
      assert.equal(decideStrategy(get(path)), 'NEVER_STORE', `se cachearia ${path}`);
    }
  });

  test('todo lo de administracion', () => {
    for (const path of ['/admin', '/admin/jugadores', '/api/admin/partidos']) {
      assert.equal(decideStrategy(get(path)), 'NEVER_STORE', `se cachearia ${path}`);
    }
  });

  test('las tarjetas: ni la propia ni las de los demas', () => {
    // Guardar una tarjeta en la cache del navegador la deja ahi despues de
    // cerrar sesion. La tarjeta propia ya vive en IndexedDB con su cola.
    for (const path of ['/api/scorecards/mia', '/api/scorecards/otro-jugador']) {
      assert.equal(decideStrategy(get(path)), 'NEVER_STORE');
    }
  });

  test('la clasificacion y las exportaciones', () => {
    assert.equal(decideStrategy(get('/api/ranking')), 'NEVER_STORE');
    assert.equal(decideStrategy(get('/api/export/clasificacion.pdf')), 'NEVER_STORE');
  });

  test('una ruta de API nueva que nadie clasifique queda FUERA de la cache', () => {
    // Regla por omision cerrada: lo contrario haria que una ruta futura acabase
    // cacheada por descuido.
    for (const path of ['/api/algo-nuevo', '/api/v2/lo-que-sea', '/api/jugadores/1/privado']) {
      assert.equal(decideStrategy(get(path)), 'NEVER_STORE', `${path} deberia quedar fuera`);
    }
  });

  test('isCacheable coincide con decideStrategy', () => {
    assert.equal(isCacheable(get('/api/auth/login')), false);
    assert.equal(isCacheable(get('/_next/static/a.js')), true);
  });
});

describe('lo que si se guarda', () => {
  test('recursos inmutables: cache primero', () => {
    for (const path of ['/_next/static/chunks/main.js', '/icons/icon-192.png', '/fuentes/inter.woff2']) {
      assert.equal(decideStrategy(get(path)), 'CACHE_FIRST', `${path} deberia ir a cache`);
    }
  });

  test('datos del campo: cache con revalidacion', () => {
    assert.equal(decideStrategy(get('/api/course/ulzama')), 'STALE_WHILE_REVALIDATE');
    assert.equal(decideStrategy(get('/api/competition/config')), 'STALE_WHILE_REVALIDATE');
  });

  test('navegacion: red primero', () => {
    assert.equal(decideStrategy(get('/tarjeta', { isNavigation: true })), 'NETWORK_FIRST');
    assert.equal(decideStrategy(get('/clasificacion', { isNavigation: true })), 'NETWORK_FIRST');
  });

  test('la navegacion a admin o login NO se cachea aunque sea navegacion', () => {
    assert.equal(decideStrategy(get('/admin', { isNavigation: true })), 'NEVER_STORE');
    assert.equal(decideStrategy(get('/login', { isNavigation: true })), 'NEVER_STORE');
  });

  test('estaticos con extension conocida', () => {
    for (const path of ['/estilos.css', '/logo.svg', '/manifest.webmanifest']) {
      assert.equal(decideStrategy(get(path)), 'CACHE_FIRST');
    }
  });

  test('el shell incluye la pantalla sin conexion', () => {
    assert.ok(APP_SHELL.includes('/sin-conexion'));
    assert.ok(APP_SHELL.includes('/tarjeta'));
    // El shell no puede llevar nada privado.
    for (const path of APP_SHELL) {
      assert.notEqual(decideStrategy(get(path, { isNavigation: true })), 'NEVER_STORE', path);
    }
  });
});

describe('limpieza de caches', () => {
  test('al cerrar sesion se borra lo personal y se conserva lo estatico', () => {
    const todas = [
      `${CACHE_VERSION}-shell`,
      `${CACHE_VERSION}-pages`,
      `${CACHE_VERSION}-data`,
      'otra-cosa',
    ];
    const aBorrar = cachesToClearOnLogout(todas);
    assert.deepEqual(aBorrar.sort(), [`${CACHE_VERSION}-data`, `${CACHE_VERSION}-pages`]);
    assert.equal(aBorrar.includes(`${CACHE_VERSION}-shell`), false, 'el shell no es de nadie');
  });

  test('al subir de version se limpian las caches viejas y solo esas', () => {
    const todas = ['pgc-v0-shell', 'pgc-v0-pages', `${CACHE_VERSION}-shell`, 'otra-app-cache'];
    const obsoletas = staleCaches(todas);
    assert.deepEqual(obsoletas.sort(), ['pgc-v0-pages', 'pgc-v0-shell']);
    assert.equal(obsoletas.includes('otra-app-cache'), false, 'no se tocan caches ajenas');
  });
});

describe('sincronia entre el modulo y el service worker', () => {
  const swSource = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

  test('la lista de sw.js no se ha desincronizado', () => {
    // La politica esta duplicada a proposito (un SW no importa TypeScript).
    // Este test es lo que garantiza que las dos copias no divergen.
    const block = /\/\/ INICIO NEVER_CACHE\s*const NEVER_CACHE = \[([\s\S]*?)\];\s*\/\/ FIN NEVER_CACHE/.exec(
      swSource,
    );
    assert.ok(block, 'no se encuentra el bloque NEVER_CACHE en public/sw.js');

    const fromSw = (block[1].match(/\/(.+?)\/,/g) ?? []).map((line) =>
      line.slice(1, -2),
    );
    const fromModule = NEVER_CACHE.map((pattern) => pattern.source);

    assert.deepEqual(
      fromSw,
      fromModule,
      'la lista de public/sw.js y la de cache-policy.ts han divergido',
    );
  });

  test('sw.js usa la misma version de cache que el modulo', () => {
    assert.match(swSource, new RegExp(`const CACHE_VERSION = '${CACHE_VERSION}'`));
  });

  test('sw.js ignora las peticiones de otros origenes', () => {
    assert.match(swSource, /url\.origin !== self\.location\.origin/);
  });

  test('sw.js borra al cerrar sesion solo las caches personales', () => {
    assert.match(swSource, /LOGOUT_CLEAR/);
    assert.match(swSource, /name === PAGES_CACHE \|\| name === DATA_CACHE/);
  });
});

describe('manifest de la PWA', () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'public/manifest.webmanifest'), 'utf8'),
  ) as Record<string, unknown>;

  test('tiene los campos que exige la instalacion', () => {
    for (const field of ['name', 'short_name', 'start_url', 'display', 'icons']) {
      assert.ok(manifest[field], `falta ${field}`);
    }
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.lang, 'es');
  });

  test('trae icono de 192, de 512 y uno enmascarable', () => {
    const icons = manifest.icons as Array<{ sizes: string; purpose?: string }>;
    assert.ok(icons.some((i) => i.sizes === '192x192'));
    assert.ok(icons.some((i) => i.sizes === '512x512'));
    assert.ok(icons.some((i) => i.purpose === 'maskable'), 'Android recorta los iconos sin maskable');
  });

  test('los colores son los de la marca, no los de la interfaz', () => {
    // Comprobacion duplicada a proposito con icons.test.ts: aquella mira el
    // script de iconos, esta mira los tokens. Lo que se cuida es que el manifest
    // no se quede con los colores verdes de la interfaz cuando el icono es navy:
    // al abrir desde la pantalla de inicio se veria una barra de estado que no
    // continua el icono.
    const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    assert.match(tokens, new RegExp(`--color-brand: ${manifest.theme_color}`));
    assert.match(tokens, new RegExp(`--color-brand-ink: ${manifest.background_color}`));
  });

  test('los accesos directos apuntan a rutas del shell', () => {
    const shortcuts = manifest.shortcuts as Array<{ url: string }>;
    for (const shortcut of shortcuts) {
      assert.ok(APP_SHELL.includes(shortcut.url), `${shortcut.url} no esta en el shell`);
    }
  });
});
