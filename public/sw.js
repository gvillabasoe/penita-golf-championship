/*
 * Service worker de Peñita Golf Championship.
 *
 * La politica de cache esta duplicada a proposito desde
 * src/lib/pwa/cache-policy.ts: un service worker no puede importar TypeScript, y
 * meter un paso de compilacion solo para esto anadiria mas riesgo del que quita.
 *
 * La duplicacion NO queda al azar: el test
 * "la lista de sw.js no se ha desincronizado" lee este archivo, extrae la lista
 * NEVER_CACHE y la compara con la del modulo. Si alguien cambia una y no la
 * otra, la suite falla.
 */

const CACHE_VERSION = 'pgc-v1';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const PAGES_CACHE = CACHE_VERSION + '-pages';
const DATA_CACHE = CACHE_VERSION + '-data';

const APP_SHELL = [
  '/',
  '/tarjeta',
  '/clasificacion',
  '/sin-conexion',
  '/manifest.webmanifest',
];

// INICIO NEVER_CACHE
const NEVER_CACHE = [
  /^\/api\/auth\//,
  /^\/api\/session/,
  /^\/api\/admin\//,
  /^\/api\/sync\//,
  /^\/api\/export\//,
  /^\/api\/scorecards\//,
  /^\/api\/ranking/,
  /^\/admin(\/|$)/,
  /^\/login(\/|$)/,
  /^\/logout(\/|$)/,
];
// FIN NEVER_CACHE

const IMMUTABLE_ASSETS = [/^\/_next\/static\//, /^\/icons\//, /\.(?:woff2?|ttf|otf)$/];
const LONG_LIVED_DATA = [/^\/api\/course(\/|$)/, /^\/api\/competition\/config$/];

function decideStrategy(path, method, isNavigation) {
  if (method.toUpperCase() !== 'GET') return 'NEVER_STORE';
  if (NEVER_CACHE.some((pattern) => pattern.test(path))) return 'NEVER_STORE';
  if (path.startsWith('/api/')) {
    if (LONG_LIVED_DATA.some((pattern) => pattern.test(path))) return 'STALE_WHILE_REVALIDATE';
    return 'NEVER_STORE';
  }
  if (IMMUTABLE_ASSETS.some((pattern) => pattern.test(path))) return 'CACHE_FIRST';
  if (isNavigation) return 'NETWORK_FIRST';
  if (/\.(?:css|js|mjs|png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(path)) return 'CACHE_FIRST';
  return 'NETWORK_FIRST';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('pgc-') && !name.startsWith(CACHE_VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Nada de otros origenes pasa por aqui.
  if (url.origin !== self.location.origin) return;

  const path = url.pathname + url.search;
  const isNavigation = request.mode === 'navigate';
  const strategy = decideStrategy(path, request.method, isNavigation);

  if (strategy === 'NEVER_STORE') {
    // Se deja pasar a la red sin tocar la cache. Si falla y es una navegacion,
    // se muestra la pantalla sin conexion.
    if (isNavigation) {
      event.respondWith(
        fetch(request).catch(() => caches.match('/sin-conexion').then((r) => r || Response.error())),
      );
    }
    return;
  }

  if (strategy === 'CACHE_FIRST') {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (strategy === 'STALE_WHILE_REVALIDATE') {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        cache.match(request).then((hit) => {
          const network = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => hit || Response.error());
          return hit || network;
        }),
      ),
    );
    return;
  }

  // NETWORK_FIRST
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && isNavigation) {
          const copy = response.clone();
          caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit || caches.match('/sin-conexion'))
          .then((hit) => hit || Response.error()),
      ),
  );
});

/*
 * Limpieza al cerrar sesion. La pagina manda este mensaje antes de redirigir.
 * Se borran solo las caches que pueden llevar datos de una persona: los
 * recursos estaticos y los datos del campo no son de nadie, y volver a
 * descargarlos con mala cobertura es justo lo que no interesa el dia del torneo.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'LOGOUT_CLEAR') {
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name === PAGES_CACHE || name === DATA_CACHE)
              .map((name) => caches.delete(name)),
          ),
        ),
    );
  }
});
