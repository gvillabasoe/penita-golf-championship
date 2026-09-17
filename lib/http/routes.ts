/**
 * Manifiesto de rutas y puerta de autorizacion (secciones 16 y 66).
 *
 * El pliego dice dos cosas que suenan parecidas y no lo son:
 *
 *   "La ruta administrativa debe protegerse en servidor."
 *   "No basta con ocultar la pestana."
 *
 * Ocultar la pestana de admin es maquetacion. Lo que impide entrar es esto.
 *
 * ---------------------------------------------------------------------------
 * Decision central: DENEGAR POR OMISION
 * ---------------------------------------------------------------------------
 * Una ruta sin regla explicita se deniega. No se permite "por defecto abierto
 * salvo lista negra", porque ese modelo falla en silencio: el dia que alguien
 * anada `/admin/exportar-todo` y se olvide del middleware, la ruta queda
 * abierta y nadie se entera hasta que es tarde.
 *
 * Con denegar por omision, el olvido se manifiesta como un 404 en desarrollo, y
 * hay un test que obliga a declarar cada ruta nueva en este archivo.
 */

export type Role = 'PLAYER' | 'ADMIN';

export type Access =
  /** Accesible sin sesion: login, pantalla sin conexion, manifest, iconos. */
  | { kind: 'PUBLIC' }
  /** Cualquier jugador con sesion valida. */
  | { kind: 'AUTHENTICATED' }
  /** Solo administrador. */
  | { kind: 'ADMIN' };

export interface RouteRule {
  pattern: RegExp;
  methods: readonly string[];
  access: Access;
  description: string;
}

const ANY_METHOD = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const READ_ONLY = ['GET'] as const;

/**
 * Manifiesto completo. El orden importa: gana la primera coincidencia, asi que
 * las reglas mas especificas van primero.
 */
export const ROUTES: readonly RouteRule[] = [
  // --- Publico -------------------------------------------------------------
  {
    pattern: /^\/login$/,
    methods: READ_ONLY,
    access: { kind: 'PUBLIC' },
    description: 'Pantalla de acceso',
  },
  {
    pattern: /^\/api\/auth\/login$/,
    methods: ['POST'],
    access: { kind: 'PUBLIC' },
    description: 'Inicio de sesion',
  },
  {
    pattern: /^\/api\/auth\/players$/,
    methods: READ_ONLY,
    access: { kind: 'PUBLIC' },
    description: 'Lista de participantes para el selector del login',
  },
  {
    pattern: /^\/sin-conexion$/,
    methods: READ_ONLY,
    access: { kind: 'PUBLIC' },
    description: 'Pantalla sin conexion de la PWA',
  },
  {
    pattern: /^\/(manifest\.webmanifest|sw\.js|favicon\.ico)$/,
    methods: READ_ONLY,
    access: { kind: 'PUBLIC' },
    description: 'Archivos de la PWA',
  },
  {
    pattern: /^\/icons\//,
    methods: READ_ONLY,
    access: { kind: 'PUBLIC' },
    description: 'Iconos',
  },
  {
    pattern: /^\/_next\//,
    methods: READ_ONLY,
    access: { kind: 'PUBLIC' },
    description: 'Recursos generados por Next',
  },
  {
    /**
     * Publico a proposito: se necesita justo cuando la autenticacion no
     * funciona. No devuelve mensajes de la base de datos ni trazas, solo
     * booleanos, recuentos y el siguiente paso.
     */
    pattern: /^\/api\/diagnostico$/,
    methods: READ_ONLY,
    access: { kind: 'PUBLIC' },
    description: 'Diagnostico de la instalacion, sin datos sensibles',
  },

  // --- Jugador -------------------------------------------------------------
  {
    pattern: /^\/api\/auth\/logout$/,
    methods: ['POST'],
    access: { kind: 'AUTHENTICATED' },
    description: 'Cierre de sesion',
  },
  {
    pattern: /^\/$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Inicio',
  },
  {
    pattern: /^\/tarjeta(\/[0-9]{1,2})?$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Mi tarjeta y el detalle de un hoyo',
  },
  {
    pattern: /^\/partido$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Ver partido',
  },
  {
    pattern: /^\/clasificacion$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Clasificacion',
  },
  {
    // La comprobacion de propiedad NO va aqui: va en el dominio, en
    // `applyMutation` y en `cardAccess`, que ya estan probados. Esta puerta
    // solo decide si hay sesion.
    pattern: /^\/api\/scorecards\/[^/]+$/,
    methods: ANY_METHOD,
    access: { kind: 'AUTHENTICATED' },
    description: 'Lectura y escritura de tarjetas (la propiedad se valida en el dominio)',
  },
  {
    pattern: /^\/api\/sync$/,
    methods: ['POST'],
    access: { kind: 'AUTHENTICATED' },
    description: 'Sincronizacion de la cola offline',
  },
  {
    pattern: /^\/api\/course(\/.*)?$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Datos del campo',
  },
  {
    pattern: /^\/api\/competition\/config$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Configuracion de la competicion',
  },
  {
    pattern: /^\/api\/ranking$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Clasificacion segun el estado de revelacion',
  },
  {
    pattern: /^\/api\/flights$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Partidos y horas de salida',
  },
  {
    pattern: /^\/api\/export\/(scorecard|flights|tee-times)(\/.*)?$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Exportaciones abiertas a jugadores (los permisos finos, en guards.ts)',
  },
  {
    pattern: /^\/api\/export\/leaderboard$/,
    methods: READ_ONLY,
    access: { kind: 'AUTHENTICATED' },
    description: 'Exportacion de clasificacion (solo publicada, ver guards.ts)',
  },
  {
    pattern: /^\/api\/reviews$/,
    methods: ['POST'],
    access: { kind: 'AUTHENTICATED' },
    description: 'Revisar la tarjeta de un companero de partido',
  },

  // --- Administracion ------------------------------------------------------
  {
    pattern: /^\/admin(\/.*)?$/,
    methods: ANY_METHOD,
    access: { kind: 'ADMIN' },
    description: 'Panel de administracion completo',
  },
  {
    pattern: /^\/api\/admin\/.+$/,
    methods: ANY_METHOD,
    access: { kind: 'ADMIN' },
    description: 'API de administracion',
  },
  {
    pattern: /^\/api\/export\/(audit|course-config|leaderboard-provisional)$/,
    methods: READ_ONLY,
    access: { kind: 'ADMIN' },
    description: 'Exportaciones reservadas al administrador',
  },
];

export interface SessionInfo {
  userId: string;
  role: Role;
}

export type AuthorizationResult =
  | { outcome: 'ALLOW'; rule: RouteRule }
  | { outcome: 'REDIRECT_TO_LOGIN'; returnTo: string }
  | { outcome: 'UNAUTHORIZED' }
  | { outcome: 'FORBIDDEN' }
  /** Se responde como si no existiera, para no confirmar rutas privadas. */
  | { outcome: 'NOT_FOUND'; reason: 'NO_RULE' | 'HIDDEN_ADMIN_ROUTE' | 'METHOD_NOT_DECLARED' };

function isApiPath(path: string): boolean {
  return path.startsWith('/api/');
}

/**
 * Decide si una peticion pasa.
 *
 * Detalle que importa: a un jugador que escribe `/admin` a mano se le responde
 * **404, no 403**. Un 403 confirma que la ruta existe, y eso es informacion que
 * no hace falta dar. Con trece jugadores que se conocen, tampoco hace falta
 * invitar a nadie a curiosear.
 */
export function authorizeRequest(params: {
  path: string;
  method: string;
  session: SessionInfo | null;
}): AuthorizationResult {
  const path = params.path.split('?')[0] ?? params.path;
  const method = params.method.toUpperCase();

  const rule = ROUTES.find((candidate) => candidate.pattern.test(path));

  // Denegar por omision: sin regla, no existe.
  if (!rule) return { outcome: 'NOT_FOUND', reason: 'NO_RULE' };

  if (!rule.methods.includes(method)) {
    return { outcome: 'NOT_FOUND', reason: 'METHOD_NOT_DECLARED' };
  }

  if (rule.access.kind === 'PUBLIC') return { outcome: 'ALLOW', rule };

  if (params.session === null) {
    if (isApiPath(path)) return { outcome: 'UNAUTHORIZED' };
    return { outcome: 'REDIRECT_TO_LOGIN', returnTo: path };
  }

  if (rule.access.kind === 'ADMIN' && params.session.role !== 'ADMIN') {
    return { outcome: 'NOT_FOUND', reason: 'HIDDEN_ADMIN_ROUTE' };
  }

  return { outcome: 'ALLOW', rule };
}

/** Rutas de navegacion que el jugador puede ver en la barra inferior. */
export function navigationFor(role: Role): Array<{ href: string; label: string }> {
  const base = [
    { href: '/tarjeta', label: 'Mi tarjeta' },
    { href: '/clasificacion', label: 'Clasificacion' },
  ];
  if (role === 'ADMIN') base.push({ href: '/admin', label: 'Admin' });
  return base;
}

/**
 * Decision del middleware.
 *
 * ---------------------------------------------------------------------------
 * Por que el middleware NO decide el rol
 * ---------------------------------------------------------------------------
 * El middleware de Next corre en el runtime edge, donde no hay Prisma ni acceso
 * a la base de datos. Para saber si alguien es administrador hay que leer su
 * sesion de la base de datos, y eso solo se puede hacer en el servidor.
 *
 * Asi que la proteccion es de dos capas, que es justo lo que pide la seccion 16
 * del pliego ("Todas las acciones administrativas deben volver a comprobar el
 * rol"):
 *
 *   1. Middleware: rutas publicas pasan; sin cookie de sesion se redirige o se
 *      devuelve 401. Lo que necesite rol se marca como DEFER_TO_SERVER.
 *   2. Servidor: cada pagina y cada ruta de admin llama a `requireAdmin()`, que
 *      consulta la sesion de verdad y responde 404 si no procede.
 *
 * La capa 1 es comodidad y ahorro de trabajo. La que protege es la 2.
 */
export type MiddlewareDecision =
  | { action: 'ALLOW' }
  | { action: 'REDIRECT_TO_LOGIN'; returnTo: string }
  | { action: 'UNAUTHORIZED' }
  | { action: 'NOT_FOUND' }
  | { action: 'DEFER_TO_SERVER' };

export function middlewareDecision(params: {
  path: string;
  method: string;
  hasSessionCookie: boolean;
}): MiddlewareDecision {
  const path = params.path.split('?')[0] ?? params.path;
  const method = params.method.toUpperCase();

  const rule = ROUTES.find((candidate) => candidate.pattern.test(path));
  if (!rule) return { action: 'NOT_FOUND' };
  if (!rule.methods.includes(method)) return { action: 'NOT_FOUND' };

  if (rule.access.kind === 'PUBLIC') return { action: 'ALLOW' };

  if (!params.hasSessionCookie) {
    if (path.startsWith('/api/')) return { action: 'UNAUTHORIZED' };
    return { action: 'REDIRECT_TO_LOGIN', returnTo: path };
  }

  // Con cookie presente, la validez de la sesion y el rol los comprueba el
  // servidor. El middleware no tiene con que.
  return { action: 'DEFER_TO_SERVER' };
}
