import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  authorizeRequest,
  navigationFor,
  ROUTES,
  middlewareDecision,
  type SessionInfo,
} from '../routes';

const PLAYER: SessionInfo = { userId: 'u1', role: 'PLAYER' };
const ADMIN: SessionInfo = { userId: 'u0', role: 'ADMIN' };

const ask = (path: string, method = 'GET', session: SessionInfo | null = PLAYER) =>
  authorizeRequest({ path, method, session });

describe('denegar por omision', () => {
  test('una ruta sin regla no existe, aunque haya sesion de admin', () => {
    for (const path of ['/lo-que-sea', '/api/inventada', '/admin-falso', '/api/v2/cosas']) {
      const result = authorizeRequest({ path, method: 'GET', session: ADMIN });
      assert.equal(result.outcome, 'NOT_FOUND', `${path} deberia denegarse`);
      if (result.outcome === 'NOT_FOUND') assert.equal(result.reason, 'NO_RULE');
    }
  });

  test('un metodo no declarado tampoco pasa', () => {
    // Una pagina admite GET y POST (POST es como Next transporta las Server
    // Actions). PUT y DELETE no tienen ningun sentido en una pagina.
    const result = ask('/clasificacion', 'PUT');
    assert.equal(result.outcome, 'NOT_FOUND');
    if (result.outcome === 'NOT_FOUND') assert.equal(result.reason, 'METHOD_NOT_DECLARED');
  });

  test('un DELETE a la API del campo no pasa: es solo lectura', () => {
    assert.equal(authorizeRequest({ path: '/api/course/ulzama', method: 'DELETE', session: ADMIN }).outcome, 'NOT_FOUND');
  });
});

describe('rutas publicas', () => {
  test('el login y sus dependencias funcionan sin sesion', () => {
    for (const path of ['/login', '/sin-conexion', '/manifest.webmanifest', '/sw.js', '/icons/icon-192.png']) {
      assert.equal(ask(path, 'GET', null).outcome, 'ALLOW', `${path} deberia ser publico`);
    }
    assert.equal(authorizeRequest({ path: '/api/auth/login', method: 'POST', session: null }).outcome, 'ALLOW');
  });

  test('la lista de participantes es publica: hace falta para el selector', () => {
    assert.equal(ask('/api/auth/players', 'GET', null).outcome, 'ALLOW');
  });

  test('la lista de rutas publicas es corta y conocida', () => {
    // Si alguien anade una ruta publica, este test le obliga a justificarlo.
    //
    // Las 8: login (pagina y POST), lista de participantes para el selector,
    // pantalla sin conexion, archivos de la PWA, iconos, recursos de Next, y
    // /api/diagnostico. Esta ultima es publica porque se necesita justo cuando
    // la autenticacion no funciona, y no devuelve nada sensible: booleanos,
    // recuentos y el siguiente paso.
    const publicas = ROUTES.filter((r) => r.access.kind === 'PUBLIC').map((r) => r.pattern.source);
    assert.equal(publicas.length, 8, `hay ${publicas.length} reglas publicas: ${publicas.join(', ')}`);
  });

  test('el diagnostico es publico pero solo de lectura', () => {
    const rule = ROUTES.find((r) => r.pattern.test('/api/diagnostico'));
    assert.ok(rule);
    assert.equal(rule.access.kind, 'PUBLIC');
    assert.deepEqual([...rule.methods], ['GET'], 'un diagnostico no escribe nada');
  });
});

describe('sin sesion', () => {
  test('una pagina redirige al login conservando el destino', () => {
    const result = authorizeRequest({ path: '/tarjeta', method: 'GET', session: null });
    assert.equal(result.outcome, 'REDIRECT_TO_LOGIN');
    if (result.outcome === 'REDIRECT_TO_LOGIN') assert.equal(result.returnTo, '/tarjeta');
  });

  test('una ruta de API devuelve 401, no una redireccion', () => {
    // Redirigir una peticion de datos a una pagina HTML rompe el cliente.
    assert.equal(
      authorizeRequest({ path: '/api/ranking', method: 'GET', session: null }).outcome,
      'UNAUTHORIZED',
    );
    assert.equal(
      authorizeRequest({ path: '/api/sync', method: 'POST', session: null }).outcome,
      'UNAUTHORIZED',
    );
  });
});

describe('acceso a administracion', () => {
  test('un jugador que escribe /admin a mano recibe 404, no 403', () => {
    // Un 403 confirmaria que la ruta existe.
    for (const path of ['/admin', '/admin/jugadores', '/admin/revelacion']) {
      const result = ask(path);
      assert.equal(result.outcome, 'NOT_FOUND', path);
      if (result.outcome === 'NOT_FOUND') assert.equal(result.reason, 'HIDDEN_ADMIN_ROUTE');
    }
  });

  test('la API de administracion tampoco se confirma', () => {
    assert.equal(ask('/api/admin/partidos', 'POST').outcome, 'NOT_FOUND');
    assert.equal(ask('/api/admin/jugadores/1', 'PATCH').outcome, 'NOT_FOUND');
  });

  test('el administrador si entra', () => {
    for (const path of ['/admin', '/admin/tarjetas', '/api/admin/sorteo']) {
      assert.equal(authorizeRequest({ path, method: 'POST', session: ADMIN }).outcome, 'ALLOW', path);
    }
  });

  test('las exportaciones reservadas son solo del admin', () => {
    assert.equal(ask('/api/export/audit').outcome, 'NOT_FOUND');
    assert.equal(ask('/api/export/leaderboard-provisional').outcome, 'NOT_FOUND');
    assert.equal(authorizeRequest({ path: '/api/export/audit', method: 'GET', session: ADMIN }).outcome, 'ALLOW');
  });

  test('toda regla bajo /admin exige rol de administrador', () => {
    for (const rule of ROUTES) {
      if (/\\?\/admin/.test(rule.pattern.source) || rule.pattern.source.includes('admin')) {
        assert.equal(
          rule.access.kind,
          'ADMIN',
          `la regla ${rule.pattern.source} menciona admin y no exige rol ADMIN`,
        );
      }
    }
  });
});

describe('rutas de jugador', () => {
  test('un jugador con sesion accede a lo suyo', () => {
    for (const path of ['/', '/tarjeta', '/tarjeta/7', '/partido', '/clasificacion']) {
      assert.equal(ask(path).outcome, 'ALLOW', path);
    }
  });

  test('el detalle de hoyo acepta 1 a 18 y rechaza basura', () => {
    assert.equal(ask('/tarjeta/1').outcome, 'ALLOW');
    assert.equal(ask('/tarjeta/18').outcome, 'ALLOW');
    assert.equal(ask('/tarjeta/999').outcome, 'NOT_FOUND');
    assert.equal(ask('/tarjeta/abc').outcome, 'NOT_FOUND');
    assert.equal(ask('/tarjeta/../admin').outcome, 'NOT_FOUND');
  });

  test('puede escribir en la API de tarjetas: la propiedad la valida el dominio', () => {
    // Esta puerta solo comprueba que hay sesion. Quien es el dueno de la tarjeta
    // lo decide applyMutation, que tiene sus propios tests.
    assert.equal(ask('/api/scorecards/sc-de-otro', 'PUT').outcome, 'ALLOW');
  });

  test('la barra inferior muestra Admin solo al administrador', () => {
    assert.deepEqual(navigationFor('PLAYER').map((n) => n.href), ['/tarjeta', '/clasificacion']);
    assert.deepEqual(navigationFor('ADMIN').map((n) => n.href), ['/tarjeta', '/clasificacion', '/admin']);
  });
});

describe('coherencia del manifiesto', () => {
  /**
   * Una ruta de ejemplo por regla, y el nivel de acceso que debe salir.
   *
   * La version anterior de este test comprobaba una lista de rutas escrita a
   * mano y por eso NO detecto un agujero real: una regla permisiva insertada
   * antes de la de administracion, con una ruta que no estaba en la lista.
   *
   * Ahora la tabla tiene que cubrir TODAS las reglas —hay un test que lo
   * comprueba—, asi que anadir una regla nueva obliga a declarar su ruta de
   * ejemplo, y con ella se comprueba que no queda tapada por otra anterior.
   */
  const SAMPLES: Array<{ path: string; method: string; access: 'PUBLIC' | 'AUTHENTICATED' | 'ADMIN' }> = [
    { path: '/login', method: 'GET', access: 'PUBLIC' },
    { path: '/api/auth/login', method: 'POST', access: 'PUBLIC' },
    { path: '/api/auth/players', method: 'GET', access: 'PUBLIC' },
    { path: '/sin-conexion', method: 'GET', access: 'PUBLIC' },
    { path: '/manifest.webmanifest', method: 'GET', access: 'PUBLIC' },
    { path: '/icons/icon-192.png', method: 'GET', access: 'PUBLIC' },
    { path: '/_next/static/chunk.js', method: 'GET', access: 'PUBLIC' },
    { path: '/api/diagnostico', method: 'GET', access: 'PUBLIC' },
    { path: '/api/auth/logout', method: 'POST', access: 'AUTHENTICATED' },
    { path: '/', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/tarjeta/7', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/partido', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/clasificacion', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/api/scorecards/sc1', method: 'PUT', access: 'AUTHENTICATED' },
    { path: '/api/sync', method: 'POST', access: 'AUTHENTICATED' },
    { path: '/api/course/ulzama', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/api/competition/config', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/api/ranking', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/api/flights', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/api/export/scorecard/sc1', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/api/export/leaderboard', method: 'GET', access: 'AUTHENTICATED' },
    { path: '/api/reviews', method: 'POST', access: 'AUTHENTICATED' },
    { path: '/admin/jugadores', method: 'POST', access: 'ADMIN' },
    { path: '/api/admin/sorteo', method: 'POST', access: 'ADMIN' },
    { path: '/api/export/audit', method: 'GET', access: 'ADMIN' },
  ];

  test('la tabla de muestras cubre todas las reglas', () => {
    // Sin esto, una regla nueva podria quedar sin comprobar.
    const cubiertas = new Set<string>();
    for (const sample of SAMPLES) {
      const rule = ROUTES.find((r) => r.pattern.test(sample.path));
      if (rule) cubiertas.add(rule.pattern.source);
    }
    const sinCubrir = ROUTES.filter((r) => !cubiertas.has(r.pattern.source)).map(
      (r) => r.pattern.source,
    );
    assert.deepEqual(
      sinCubrir,
      [],
      `reglas sin ruta de ejemplo en SAMPLES: ${sinCubrir.join(', ')}`,
    );
  });

  test('cada muestra resuelve con el acceso esperado: ninguna regla queda tapada', () => {
    for (const sample of SAMPLES) {
      const rule = ROUTES.find((r) => r.pattern.test(sample.path));
      assert.ok(rule, `sin regla para ${sample.path}`);
      assert.equal(
        rule.access.kind,
        sample.access,
        `${sample.path} resuelve a ${rule.access.kind} (regla ${rule.pattern.source}) y se esperaba ${sample.access}`,
      );
    }
  });

  test('el resultado real de autorizar coincide con el acceso declarado', () => {
    for (const sample of SAMPLES) {
      const comoJugador = authorizeRequest({
        path: sample.path,
        method: sample.method,
        session: PLAYER,
      });
      const comoAdmin = authorizeRequest({
        path: sample.path,
        method: sample.method,
        session: ADMIN,
      });

      assert.equal(comoAdmin.outcome, 'ALLOW', `el admin deberia poder con ${sample.path}`);
      if (sample.access === 'ADMIN') {
        assert.equal(comoJugador.outcome, 'NOT_FOUND', `${sample.path} no deberia existir para un jugador`);
      } else {
        assert.equal(comoJugador.outcome, 'ALLOW', `${sample.path} deberia permitirse`);
      }
    }
  });

  test('cada regla tiene descripcion y al menos un metodo', () => {
    for (const rule of ROUTES) {
      assert.ok(rule.description.length > 5, `regla sin descripcion: ${rule.pattern.source}`);
      assert.ok(rule.methods.length > 0, `regla sin metodos: ${rule.pattern.source}`);
    }
  });

  test('las rutas publicas que admiten escritura son exactamente tres', () => {
    /**
     * Lista explicita en vez de una excepcion difusa.
     *
     * Una ruta publica que acepta POST es la superficie de ataque mas barata que
     * tiene la aplicacion, asi que no puede haber ninguna por descuido. Las tres
     * que hay estan justificadas:
     *
     *  - /login y /sin-conexion son PAGINAS, y Next transporta las Server
     *    Actions como POST a la URL de la pagina. Sin POST no se puede entrar.
     *  - /api/auth/login es el propio inicio de sesion.
     *
     * Si aparece una cuarta, este test falla y hay que justificarla aqui.
     */
    const PERMITIDAS = ['^\\/login$', '^\\/sin-conexion$', '^\\/api\\/auth\\/login$'];

    const publicasConEscritura = ROUTES.filter(
      (rule) => rule.access.kind === 'PUBLIC' && rule.methods.some((m) => m !== 'GET'),
    ).map((rule) => rule.pattern.source);

    assert.deepEqual(publicasConEscritura.sort(), [...PERMITIDAS].sort());
  });

  test('ninguna ruta publica admite PUT, PATCH ni DELETE', () => {
    for (const rule of ROUTES) {
      if (rule.access.kind !== 'PUBLIC') continue;
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        assert.equal(
          rule.methods.includes(method),
          false,
          `${rule.pattern.source} admite ${method} siendo publica`,
        );
      }
    }
  });
});

/**
 * Guardian a futuro.
 *
 * Mientras no exista el directorio `app/`, este bloque se salta con un aviso.
 * En cuanto aparezca, cada `page.tsx` y cada `route.ts` tendra que estar
 * declarado en el manifiesto o la suite fallara. Es lo que impide que una
 * pantalla nueva se cuele sin puerta.
 */
describe('sincronia con el directorio de rutas de Next', () => {
  const appDir = join(process.cwd(), 'src/app');

  test('todo archivo de ruta tiene su regla en el manifiesto', () => {
    if (!existsSync(appDir)) {
      console.log('    [saltado] src/app todavia no existe. El guardian se activara solo.');
      return;
    }

    const rutas: string[] = [];
    const walk = (dir: string, urlPath: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          // Los grupos de rutas de Next, (nombre), no cuentan como segmento.
          const segment = entry.startsWith('(') ? '' : `/${entry}`;
          walk(full, urlPath + segment);
        } else if (entry === 'page.tsx' || entry === 'route.ts') {
          rutas.push(urlPath === '' ? '/' : urlPath);
        }
      }
    };
    walk(appDir, '');

    // Un digito como muestra de segmento dinamico: encaja tanto con los
    // patrones numericos (/tarjeta/[0-9]{1,2}) como con los genericos ([^/]+).
    const sinRegla = rutas.filter(
      (ruta) => !ROUTES.some((rule) => rule.pattern.test(ruta.replace(/\[[^\]]+\]/g, '1'))),
    );
    assert.deepEqual(
      sinRegla,
      [],
      `estas rutas existen en src/app y no tienen regla: ${sinRegla.join(', ')}`,
    );
  });
});

describe('decision del middleware (runtime edge, sin base de datos)', () => {
  const ask = (path: string, method = 'GET', hasSessionCookie = true) =>
    middlewareDecision({ path, method, hasSessionCookie });

  test('las rutas publicas pasan sin cookie', () => {
    for (const path of ['/login', '/sin-conexion', '/manifest.webmanifest', '/icons/a.png']) {
      assert.deepEqual(ask(path, 'GET', false), { action: 'ALLOW' });
    }
  });

  test('sin cookie: las paginas redirigen y la API devuelve 401', () => {
    assert.deepEqual(ask('/tarjeta', 'GET', false), {
      action: 'REDIRECT_TO_LOGIN',
      returnTo: '/tarjeta',
    });
    assert.deepEqual(ask('/api/ranking', 'GET', false), { action: 'UNAUTHORIZED' });
  });

  test('con cookie, el rol se delega al servidor', () => {
    // El middleware no puede leer la base de datos: no sabe si es admin.
    assert.deepEqual(ask('/admin'), { action: 'DEFER_TO_SERVER' });
    assert.deepEqual(ask('/tarjeta'), { action: 'DEFER_TO_SERVER' });
    assert.deepEqual(ask('/api/admin/sorteo', 'POST'), { action: 'DEFER_TO_SERVER' });
  });

  test('una ruta sin regla no existe, con cookie o sin ella', () => {
    assert.deepEqual(ask('/inventada'), { action: 'NOT_FOUND' });
    assert.deepEqual(ask('/inventada', 'GET', false), { action: 'NOT_FOUND' });
  });

  test('un metodo no declarado tampoco pasa', () => {
    assert.deepEqual(ask('/clasificacion', 'DELETE'), { action: 'NOT_FOUND' });
    assert.deepEqual(ask('/clasificacion', 'PUT'), { action: 'NOT_FOUND' });
  });

  test('el middleware nunca concede acceso de admin por si solo', () => {
    // Invariante: ninguna ruta ADMIN puede resolverse como ALLOW en el
    // middleware. Si alguna lo hiciera, el rol quedaria sin comprobar.
    for (const rule of ROUTES.filter((r) => r.access.kind === 'ADMIN')) {
      const muestra = rule.pattern.source
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\\\//g, '/')
        .replace(/\(\/\.\*\)\?|\.\+|\[\^\/\]\+/g, 'x')
        .replace(/\(([^)]+)\)/, (_, group: string) => group.split('|')[0]);
      const decision = middlewareDecision({ path: muestra, method: 'GET', hasSessionCookie: true });
      assert.notEqual(decision.action, 'ALLOW', `${muestra} concederia acceso sin comprobar rol`);
    }
  });
});

/**
 * Regresion: las Server Actions tienen que llegar al servidor.
 *
 * Next envia las Server Actions como POST a la MISMA URL de la pagina. Declarar
 * las paginas como solo GET hacia que el middleware devolviese 404 a cada
 * accion: el login fallaba identico con la contrasena correcta y con una
 * incorrecta porque **la accion no se ejecutaba nunca**.
 *
 * Lo peor es que los dos tests de "metodo no declarado" comprobaban un POST a
 * /clasificacion y exigian 404. Daban el defecto por bueno. Es la tercera vez
 * que me pasa en este proyecto, y aqui costo varios turnos de diagnostico
 * mirando la base de datos, que estaba perfecta.
 */
describe('Server Actions: POST a rutas de pagina', () => {
  const PAGINAS_CON_ACCION = [
    { path: '/login', publica: true },
    { path: '/tarjeta', publica: false },
    { path: '/tarjeta/7', publica: false },
    { path: '/partido', publica: false },
    { path: '/clasificacion', publica: false },
    { path: '/admin/jugadores', publica: false },
  ];

  test('el middleware deja pasar el POST de una Server Action', () => {
    for (const pagina of PAGINAS_CON_ACCION) {
      const decision = middlewareDecision({
        path: pagina.path,
        method: 'POST',
        hasSessionCookie: !pagina.publica,
      });
      assert.notEqual(
        decision.action,
        'NOT_FOUND',
        `POST a ${pagina.path} se rechaza: la Server Action nunca llegaria`,
      );
    }
  });

  test('sin cookie, el POST a /login pasa: es donde se inicia sesion', () => {
    // Si esto falla, no hay forma de entrar en la aplicacion.
    assert.deepEqual(
      middlewareDecision({ path: '/login', method: 'POST', hasSessionCookie: false }),
      { action: 'ALLOW' },
    );
  });

  test('TODA regla de pagina admite POST', () => {
    // Guardian general: una pagina nueva sin POST rompe sus acciones en
    // silencio, y el sintoma no apunta a la ruta por ningun lado.
    const esPagina = (source: string) =>
      !source.includes('api') &&
      !source.includes('_next') &&
      !source.includes('icons') &&
      !source.includes('manifest') &&
      !source.includes('sw');

    const sinPost = ROUTES.filter(
      (rule) => esPagina(rule.pattern.source) && !rule.methods.includes('POST'),
    ).map((rule) => rule.pattern.source);

    assert.deepEqual(sinPost, [], 'estas paginas romperian sus Server Actions');
  });

  test('admitir POST no relaja el nivel de acceso', () => {
    // Lo unico que cambia es el metodo. Un jugador sigue sin poder entrar en
    // admin, ni con GET ni con POST.
    assert.equal(ask('/admin/jugadores', 'POST').outcome, 'NOT_FOUND');
    assert.equal(
      authorizeRequest({ path: '/tarjeta', method: 'POST', session: null }).outcome,
      'REDIRECT_TO_LOGIN',
    );
    assert.equal(
      authorizeRequest({ path: '/admin', method: 'POST', session: ADMIN }).outcome,
      'ALLOW',
    );
  });

  test('PUT y DELETE siguen sin tener sentido en una pagina', () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      assert.equal(ask('/tarjeta', method).outcome, 'NOT_FOUND', `${method} deberia rechazarse`);
    }
  });
});
