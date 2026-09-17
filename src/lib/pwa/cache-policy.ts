/**
 * Politica de cache del service worker (seccion 12).
 *
 * Se escribe como funcion pura para poder probarla. El service worker de
 * `public/sw.js` usa la misma lista de patrones, y hay un test que compara las
 * dos y falla si se desincronizan.
 *
 * El motivo de tanto cuidado: "No caches indiscriminadamente" no es un consejo
 * de rendimiento, es seguridad. Una respuesta privada en la cache del navegador
 * sobrevive al cierre de sesion y sigue ahi cuando el movil cambia de manos, y
 * el movil del organizador va a cambiar de manos el dia del torneo.
 */

export type CacheStrategy =
  /** Nunca se guarda. Ni en cache, ni en disco, ni en memoria del SW. */
  | 'NEVER_STORE'
  /** Cache primero: recursos inmutables con nombre versionado. */
  | 'CACHE_FIRST'
  /** Red primero con reserva en cache: navegacion y pantallas. */
  | 'NETWORK_FIRST'
  /** Cache y revalidacion en segundo plano: datos que cambian cada anos. */
  | 'STALE_WHILE_REVALIDATE';

/**
 * Rutas que NUNCA se guardan.
 *
 * Esta lista se duplica literalmente en `public/sw.js`. La duplicacion es
 * deliberada: un service worker no puede importar TypeScript y meter un paso de
 * compilacion solo para esto anadiria mas riesgo del que quita. El test
 * `la lista de sw.js no se ha desincronizado` es lo que garantiza que no
 * divergen.
 */
export const NEVER_CACHE: RegExp[] = [
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

/** Recursos inmutables: el nombre lleva el hash, asi que la cache no caduca. */
export const IMMUTABLE_ASSETS: RegExp[] = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /\.(?:woff2?|ttf|otf)$/,
];

/** Datos del campo: par, stroke index y distancias. Cambian cada varios anos. */
export const LONG_LIVED_DATA: RegExp[] = [/^\/api\/course(\/|$)/, /^\/api\/competition\/config$/];

/** Shell de la aplicacion: lo minimo para que la app abra sin cobertura. */
export const APP_SHELL: string[] = [
  '/',
  '/tarjeta',
  '/clasificacion',
  '/sin-conexion',
  '/manifest.webmanifest',
];

export interface RequestDescriptor {
  /** Ruta con query, sin origen. */
  path: string;
  method: string;
  /** True si es una navegacion de documento (no un fetch de datos). */
  isNavigation?: boolean;
  /** True si la peticion lleva cabecera de autorizacion o cookie de sesion. */
  isCredentialed?: boolean;
}

/**
 * Decide la estrategia. El orden de las comprobaciones es la parte importante:
 * lo que nunca se guarda se comprueba ANTES que cualquier regla que si guarde.
 */
export function decideStrategy(request: RequestDescriptor): CacheStrategy {
  // 1. Solo GET se puede guardar. Un POST es una escritura: nunca se cachea ni
  //    se reproduce desde cache.
  if (request.method.toUpperCase() !== 'GET') return 'NEVER_STORE';

  // 2. Lista negra explicita. Gana a todo lo demas.
  if (NEVER_CACHE.some((pattern) => pattern.test(request.path))) return 'NEVER_STORE';

  // 3. Cualquier cosa bajo /api que no este declarada como cacheable no se
  //    guarda. Regla por omision cerrada: una ruta nueva que nadie clasifique
  //    queda fuera de la cache en vez de acabar dentro por descuido.
  if (request.path.startsWith('/api/')) {
    if (LONG_LIVED_DATA.some((pattern) => pattern.test(request.path))) {
      return 'STALE_WHILE_REVALIDATE';
    }
    return 'NEVER_STORE';
  }

  if (IMMUTABLE_ASSETS.some((pattern) => pattern.test(request.path))) return 'CACHE_FIRST';

  if (request.isNavigation === true) return 'NETWORK_FIRST';

  // 4. Recursos estaticos con extension conocida.
  if (/\.(?:css|js|mjs|png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(request.path)) {
    return 'CACHE_FIRST';
  }

  return 'NETWORK_FIRST';
}

/** True si la respuesta puede guardarse. Atajo legible para el service worker. */
export function isCacheable(request: RequestDescriptor): boolean {
  return decideStrategy(request) !== 'NEVER_STORE';
}

/**
 * Nombre de cache con version. Cambiar la version invalida todo lo anterior en
 * la activacion del service worker, que es la unica forma fiable de desplegar un
 * cambio de politica.
 */
export const CACHE_VERSION = 'pgc-v1';

/**
 * Claves de cache que hay que borrar al cerrar sesion.
 *
 * No se borra todo: los recursos estaticos y los datos del campo no son de
 * nadie y volver a descargarlos con mala cobertura es justo lo que no interesa
 * el dia del torneo. Lo que se borra es lo que pueda llevar datos de una
 * persona.
 */
export function cachesToClearOnLogout(allCacheNames: string[]): string[] {
  return allCacheNames.filter(
    (name) => name.startsWith(`${CACHE_VERSION}-pages`) || name.startsWith(`${CACHE_VERSION}-data`),
  );
}

/** Caches obsoletas al activar una version nueva. */
export function staleCaches(allCacheNames: string[]): string[] {
  return allCacheNames.filter((name) => name.startsWith('pgc-') && !name.startsWith(CACHE_VERSION));
}
