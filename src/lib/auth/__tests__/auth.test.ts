import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { matchesQuery, normalizeName, searchUsers, buildDisplayName } from '../normalize';
import {
  detectAlgorithm,
  hashPassword,
  needsRehash,
  PasswordError,
  verifyPassword,
} from '../password';
import {
  clearedCookieOptions,
  generateSessionToken,
  hashSessionToken,
  sessionCookieOptions,
  sessionExpiry,
  tokenHashesMatch,
  validateSession,
  type SessionRecord,
  type SessionUser,
} from '../session';
import { checkRateLimit, loginErrorMessage, RATE_LIMIT, type AttemptRecord } from '../rate-limit';
import { resolveRoster, ROSTER } from '../../seed/roster';
import {
  assertCredentialsAvailable,
  buildSeedPlan,
  SeedCredentialsError,
  type ExistingUser,
} from '../../seed/plan';

const roster = resolveRoster();
const searchable = roster.map((r, i) => ({
  id: `u${i}`,
  firstName: r.firstName,
  lastName: r.lastName,
  displayName: r.displayName,
  normalizedName: r.normalizedName,
  isActive: true,
}));

describe('normalizacion de nombres', () => {
  test('quita tildes y pasa a minusculas', () => {
    assert.equal(normalizeName('Gonzalo Suárez'), 'gonzalo suarez');
    assert.equal(normalizeName('Tomás Molina'), 'tomas molina');
  });

  test('trata el guion como separador de palabras', () => {
    assert.equal(normalizeName('Pacho Rodríguez-Rey'), 'pacho rodriguez rey');
  });

  test('colapsa espacios y recorta', () => {
    assert.equal(normalizeName('  Juan   Olabarri  '), 'juan olabarri');
  });

  test('la enye se normaliza de forma consistente', () => {
    assert.equal(normalizeName('Peñita'), 'penita');
    assert.equal(normalizeName('Núñez'), 'nunez');
  });
});

describe('buscador del login', () => {
  test('encuentra por nombre, por apellido y por fragmentos', () => {
    const byName = searchUsers(searchable, 'gonzalo');
    assert.equal(byName.length, 2); // Villabaso y Suárez
    assert.deepEqual(byName.map((u) => u.lastName), ['Suárez', 'Villabaso']);

    assert.equal(searchUsers(searchable, 'villa').length, 1);
    assert.equal(searchUsers(searchable, 'vil')[0].displayName, 'Gonzalo Villabaso');
    assert.equal(searchUsers(searchable, 'gon vil')[0].displayName, 'Gonzalo Villabaso');
  });

  test('ignora tildes en la consulta y en el dato', () => {
    assert.equal(searchUsers(searchable, 'suarez')[0].displayName, 'Gonzalo Suárez');
    assert.equal(searchUsers(searchable, 'SUÁREZ')[0].displayName, 'Gonzalo Suárez');
    assert.equal(searchUsers(searchable, 'tomas')[0].displayName, 'Tomás Molina');
    assert.equal(searchUsers(searchable, 'Tomás')[0].displayName, 'Tomás Molina');
  });

  test('encuentra los dos tramos de un apellido con guion', () => {
    assert.equal(searchUsers(searchable, 'rodriguez')[0].displayName, 'Pacho Rodríguez-Rey');
    assert.equal(searchUsers(searchable, 'rey')[0].displayName, 'Pacho Rodríguez-Rey');
    assert.equal(searchUsers(searchable, 'Rodríguez-Rey')[0].displayName, 'Pacho Rodríguez-Rey');
  });

  test('consulta vacia devuelve los 13 ordenados por apellido', () => {
    const all = searchUsers(searchable, '');
    assert.equal(all.length, 13);
    assert.equal(all[0].lastName, 'Ayesa');
    assert.equal(all[all.length - 1].lastName, 'Zabala');
  });

  test('no devuelve jugadores desactivados', () => {
    const conInactivo = searchable.map((u, i) => (i === 0 ? { ...u, isActive: false } : u));
    assert.equal(searchUsers(conInactivo, 'villabaso').length, 0);
  });

  test('no encuentra por el medio de una palabra', () => {
    assert.equal(matchesQuery(searchable[0], 'labaso'), false);
    assert.equal(matchesQuery(searchable[0], 'villa'), true);
  });

  test('conserva tildes y guiones en el nombre a mostrar', () => {
    assert.equal(buildDisplayName('Pacho', 'Rodríguez-Rey'), 'Pacho Rodríguez-Rey');
    assert.equal(buildDisplayName('Gonzalo', 'Suárez'), 'Gonzalo Suárez');
  });
});

describe('hash de contrasenas', () => {
  test('hashea y verifica correctamente', async () => {
    const hash = await hashPassword('una-contrasena-de-prueba');
    assert.equal(await verifyPassword('una-contrasena-de-prueba', hash), true);
    assert.equal(await verifyPassword('otra-cosa', hash), false);
  });

  test('dos hashes de la misma contrasena son distintos (salt aleatorio)', async () => {
    const a = await hashPassword('misma-contrasena');
    const b = await hashPassword('misma-contrasena');
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('misma-contrasena', a), true);
    assert.equal(await verifyPassword('misma-contrasena', b), true);
  });

  test('el hash no contiene la contrasena en claro', async () => {
    const hash = await hashPassword('SecretoEnClaro123');
    assert.equal(hash.includes('SecretoEnClaro123'), false);
    assert.match(hash, /^\$scrypt\$N=32768,r=8,p=1\$/);
  });

  test('una contrasena vacia nunca valida', async () => {
    const hash = await hashPassword('algo-valido');
    assert.equal(await verifyPassword('', hash), false);
    await assert.rejects(() => hashPassword(''), PasswordError);
  });

  test('un hash corrupto o desconocido falla sin lanzar', async () => {
    for (const bad of ['', 'no-es-un-hash', '$scrypt$', '$scrypt$N=1$$', '$bcrypt$x$y', '$scrypt$N=a,r=b,p=c$zz$zz']) {
      assert.equal(await verifyPassword('algo', bad), false, `deberia fallar: ${bad}`);
    }
  });

  test('normaliza unicode: la misma contrasena escrita de dos formas valida', async () => {
    // "á" precompuesta vs "a" + acento combinante.
    const precomposed = 'contrase\u00f1a';
    const decomposed = 'contrasen\u0303a';
    const hash = await hashPassword(precomposed);
    assert.equal(await verifyPassword(decomposed, hash), true);
  });

  test('detecta el algoritmo y cuando hay que reescribir el hash', async () => {
    const hash = await hashPassword('algo-valido');
    assert.equal(detectAlgorithm(hash), 'scrypt');
    assert.equal(needsRehash(hash), false);
    assert.equal(needsRehash('$scrypt$N=16384,r=8,p=1$aaaa$bbbb'), true);
    assert.equal(detectAlgorithm('$argon2id$v=19$m=19456,t=2,p=1$x$y'), 'argon2id');
    assert.equal(detectAlgorithm('cualquier-cosa'), 'unknown');
  });

  test('argon2id falla de forma limpia si la dependencia no esta instalada', async () => {
    await assert.rejects(() => hashPassword('algo-valido', 'argon2id'), PasswordError);
  });
});

describe('sesiones', () => {
  const now = new Date('2026-09-17T10:00:00Z');
  const user: SessionUser = { id: 'u1', role: 'PLAYER', isActive: true, sessionEpoch: 0 };
  const session: SessionRecord = {
    id: 's1',
    userId: 'u1',
    tokenHash: 'x',
    sessionEpoch: 0,
    expiresAt: new Date('2026-09-18T10:00:00Z'),
    revokedAt: null,
    lastSeenAt: now,
  };

  test('los tokens son opacos, largos y distintos entre si', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    assert.equal(tokens.size, 200);
    for (const token of tokens) {
      assert.ok(token.length >= 43);
      assert.match(token, /^[A-Za-z0-9_-]+$/);
    }
  });

  test('el hash del token es determinista y no reversible al token', () => {
    const token = generateSessionToken();
    assert.equal(hashSessionToken(token), hashSessionToken(token));
    assert.equal(hashSessionToken(token).length, 64);
    assert.equal(hashSessionToken(token).includes(token), false);
  });

  test('la comparacion de hashes es de tiempo constante y tolera longitudes distintas', () => {
    const a = hashSessionToken('token-a');
    assert.equal(tokenHashesMatch(a, a), true);
    assert.equal(tokenHashesMatch(a, hashSessionToken('token-b')), false);
    assert.equal(tokenHashesMatch(a, 'corto'), false);
  });

  test('sesion valida', () => {
    const result = validateSession(session, user, now);
    assert.equal(result.valid, true);
    if (!result.valid) return;
    assert.equal(result.userId, 'u1');
    assert.equal(result.shouldRefreshLastSeen, false);
  });

  test('rechaza sesion caducada, revocada, de usuario inactivo o de otro usuario', () => {
    const caducada = validateSession(session, user, new Date('2026-09-19T10:00:00Z'));
    assert.deepEqual(caducada, { valid: false, reason: 'EXPIRED' });

    const revocada = validateSession({ ...session, revokedAt: now }, user, now);
    assert.deepEqual(revocada, { valid: false, reason: 'REVOKED' });

    const inactivo = validateSession(session, { ...user, isActive: false }, now);
    assert.deepEqual(inactivo, { valid: false, reason: 'USER_INACTIVE' });

    const otro = validateSession({ ...session, userId: 'u2' }, user, now);
    assert.deepEqual(otro, { valid: false, reason: 'NOT_FOUND' });

    assert.deepEqual(validateSession(null, user, now), { valid: false, reason: 'NOT_FOUND' });
  });

  test('restablecer la contrasena invalida las sesiones antiguas en todos los dispositivos', () => {
    const conEpochNuevo = { ...user, sessionEpoch: 1 };
    assert.deepEqual(validateSession(session, conEpochNuevo, now), {
      valid: false,
      reason: 'STALE_EPOCH',
    });
  });

  test('refresca lastSeen solo tras un rato de inactividad', () => {
    const vieja = { ...session, lastSeenAt: new Date('2026-09-17T09:00:00Z') };
    const result = validateSession(vieja, user, now);
    assert.equal(result.valid && result.shouldRefreshLastSeen, true);
  });

  test('la cookie es httpOnly, sameSite lax y secure solo en produccion', () => {
    const prod = sessionCookieOptions(true);
    assert.equal(prod.httpOnly, true);
    assert.equal(prod.secure, true);
    assert.equal(prod.sameSite, 'lax');
    assert.equal(sessionCookieOptions(false).secure, false);
    assert.equal(clearedCookieOptions(true).maxAge, 0);
  });

  test('la caducidad se calcula sobre el momento indicado', () => {
    assert.equal(sessionExpiry(now).toISOString(), '2026-09-18T22:00:00.000Z');
  });
});

describe('limitacion de intentos de login', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  const fail = (minutesAgo: number): AttemptRecord => ({
    identifier: 'u1',
    succeeded: false,
    createdAt: new Date(now.getTime() - minutesAgo * 60 * 1000),
  });

  test('permite los primeros intentos e informa de los restantes', () => {
    const decision = checkRateLimit({ identifierAttempts: [fail(1), fail(2)], ipAttempts: [], now });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.equal(decision.remainingAttempts, 3);
  });

  test('bloquea al quinto fallo dentro de la ventana', () => {
    const decision = checkRateLimit({
      identifierAttempts: [fail(1), fail(2), fail(3), fail(4), fail(5)],
      ipAttempts: [],
      now,
    });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.scope, 'IDENTIFIER');
    assert.equal(decision.retryAfterSeconds, 14 * 60); // 15 min desde el fallo de hace 1 min
  });

  test('los fallos fuera de la ventana no cuentan', () => {
    const viejos = [fail(20), fail(21), fail(22), fail(23), fail(24)];
    assert.equal(checkRateLimit({ identifierAttempts: viejos, ipAttempts: [], now }).allowed, true);
  });

  test('un login correcto reinicia el contador', () => {
    const attempts: AttemptRecord[] = [
      fail(10),
      fail(9),
      fail(8),
      fail(7),
      { identifier: 'u1', succeeded: true, createdAt: new Date(now.getTime() - 6 * 60 * 1000) },
      fail(1),
    ];
    const decision = checkRateLimit({ identifierAttempts: attempts, ipAttempts: [], now });
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.equal(decision.remainingAttempts, 4);
  });

  test('el limite por IP actua aunque el jugador varie', () => {
    // Todos dentro de la ventana de 15 minutos.
    const ipAttempts = Array.from({ length: RATE_LIMIT.maxFailuresPerIp }, (_, i) =>
      fail(1 + i * 0.4),
    );
    const decision = checkRateLimit({ identifierAttempts: [], ipAttempts, now });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.scope, 'IP');
  });

  test('13 jugadores fallando dos veces cada uno desde el WiFi del club NO bloquea la IP', () => {
    // El caso real: todos se conectan a la vez por la misma salida a internet.
    const ipAttempts = Array.from({ length: 26 }, (_, i) => fail(1 + i * 0.3));
    const decision = checkRateLimit({ identifierAttempts: [], ipAttempts, now });
    assert.equal(decision.allowed, true, 'la peña entera no puede quedarse fuera');
  });

  test('el mensaje de error no revela si el jugador existe', () => {
    const permitido = checkRateLimit({ identifierAttempts: [], ipAttempts: [], now });
    assert.equal(loginErrorMessage(permitido), 'Jugador o contrasena incorrectos.');
    const bloqueado = checkRateLimit({
      identifierAttempts: [fail(1), fail(1), fail(1), fail(1), fail(1)],
      ipAttempts: [],
      now,
    });
    assert.match(loginErrorMessage(bloqueado), /Vuelve a probar en 14 minutos/);
  });
});

describe('lista de participantes', () => {
  test('son 13 y conservan tildes y guiones exactamente', () => {
    assert.equal(ROSTER.length, 13);
    const nombres = roster.map((r) => r.displayName);
    assert.ok(nombres.includes('Gonzalo Suárez'));
    assert.ok(nombres.includes('Pacho Rodríguez-Rey'));
    assert.ok(nombres.includes('Tomás Molina'));
  });

  test('un solo administrador', () => {
    assert.equal(roster.filter((r) => r.role === 'ADMIN').length, 1);
    assert.equal(roster.find((r) => r.role === 'ADMIN')?.displayName, 'Gonzalo Villabaso');
  });

  test('cada jugador tiene un color de acento distinto', () => {
    const colores = roster.map((r) => r.defaultColor);
    assert.equal(new Set(colores).size, 13);
    for (const color of colores) assert.match(color, /^#[0-9a-f]{6}$/);
  });

  /**
   * Guardian del rediseno v1.2.0.
   *
   * La paleta anterior era pastel y se leia mal en una barra de 4 px al sol. Este
   * test fija el criterio nuevo: todo color de jugador tiene que ser lo bastante
   * oscuro para que el blanco encima pase contraste, porque es como se usa.
   *
   * Se mide con la luminancia relativa de la WCAG. El umbral 0,4 deja fuera
   * cualquier pastel sin tener que enumerarlos.
   */
  test('ningun color de jugador es pastel: todos aguantan texto blanco encima', () => {
    const luminance = (hex: string): number => {
      const channel = (value: number): number => {
        const srgb = value / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      };
      const r = channel(Number.parseInt(hex.slice(1, 3), 16));
      const g = channel(Number.parseInt(hex.slice(3, 5), 16));
      const b = channel(Number.parseInt(hex.slice(5, 7), 16));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const claros = roster
      .map((r) => r.defaultColor)
      .filter((color) => luminance(color) > 0.4);

    assert.deepEqual(claros, [], 'estos colores son demasiado claros para la paleta nueva');
  });

  test('los nombres normalizados no colisionan', () => {
    const normalizados = roster.map((r) => r.normalizedName);
    assert.equal(new Set(normalizados).size, 13);
  });
});

describe('idempotencia del seed', () => {
  const existingFromRoster = (count: number): ExistingUser[] =>
    roster.slice(0, count).map((r, i) => ({
      id: `u${i}`,
      normalizedName: r.normalizedName,
      role: r.role,
      isActive: true,
    }));

  test('base de datos vacia: crea los 13', () => {
    const plan = buildSeedPlan([], ROSTER);
    assert.equal(plan.summary.toCreate, 13);
    assert.equal(plan.summary.toKeep, 0);
    assert.equal(plan.slugsNeedingPassword.length, 13);
    assert.deepEqual(plan.divergences, []);
  });

  test('segunda ejecucion: no crea nada y no pide ninguna contrasena', () => {
    const plan = buildSeedPlan(existingFromRoster(13), ROSTER);
    assert.equal(plan.summary.toCreate, 0);
    assert.equal(plan.summary.toKeep, 13);
    assert.deepEqual(plan.slugsNeedingPassword, []);
    assert.ok(plan.actions.every((a) => a.type === 'KEEP'));
  });

  test('ejecucion parcial: solo crea los que faltan', () => {
    const plan = buildSeedPlan(existingFromRoster(10), ROSTER);
    assert.equal(plan.summary.toCreate, 3);
    assert.deepEqual(plan.slugsNeedingPassword, ['gayesa', 'sguerra', 'mpalomino']);
  });

  test('ningun plan contiene una accion que reescriba una contrasena existente', () => {
    const plan = buildSeedPlan(existingFromRoster(13), ROSTER);
    assert.equal(
      plan.actions.some((a) => a.type === 'CREATE'),
      false,
      'el seed no debe volver a establecer contrasenas de usuarios existentes',
    );
  });

  test('un jugador desactivado se reporta pero no se reactiva', () => {
    const existing = existingFromRoster(13).map((u, i) => (i === 3 ? { ...u, isActive: false } : u));
    const plan = buildSeedPlan(existing, ROSTER);
    assert.equal(plan.divergences.filter((d) => d.kind === 'INACTIVE').length, 1);
    assert.equal(plan.summary.toCreate, 0);
  });

  test('un rol cambiado a mano se reporta, no se sobreescribe', () => {
    const existing = existingFromRoster(13).map((u, i) => (i === 1 ? { ...u, role: 'ADMIN' as const } : u));
    const plan = buildSeedPlan(existing, ROSTER);
    const divergence = plan.divergences.find((d) => d.kind === 'ROLE_MISMATCH');
    assert.ok(divergence);
    assert.equal(divergence.slug, 'apagadi');
  });

  test('un usuario ajeno a la lista se reporta y no se borra', () => {
    const existing = [
      ...existingFromRoster(13),
      { id: 'intruso', normalizedName: 'invitado externo', role: 'PLAYER' as const, isActive: true },
    ];
    const plan = buildSeedPlan(existing, ROSTER);
    assert.equal(plan.divergences.filter((d) => d.kind === 'NOT_IN_ROSTER').length, 1);
  });
});

describe('credenciales del seed', () => {
  const plan = buildSeedPlan([], ROSTER);
  const validCredentials = Object.fromEntries(
    plan.slugsNeedingPassword.map((slug) => [slug, 'contrasena-larga-valida']),
  );

  test('acepta un juego completo de credenciales', () => {
    assert.doesNotThrow(() => assertCredentialsAvailable(plan, validCredentials));
  });

  test('falla citando slugs si falta alguna, sin exponer valores', () => {
    const incompleto = { ...validCredentials };
    delete incompleto.gsuarez;
    delete incompleto.iurzay;
    try {
      assertCredentialsAvailable(plan, incompleto);
      assert.fail('deberia haber lanzado');
    } catch (error) {
      assert.ok(error instanceof SeedCredentialsError);
      assert.match(error.message, /gsuarez, iurzay/);
      assert.equal(error.message.includes('contrasena-larga-valida'), false);
    }
  });

  test('rechaza credenciales demasiado cortas', () => {
    assert.throws(
      () => assertCredentialsAvailable(plan, { ...validCredentials, azabala: 'corta' }),
      SeedCredentialsError,
    );
  });

  test('no falla por credenciales sobrantes de jugadores ya existentes', () => {
    const planParcial = buildSeedPlan(
      roster.slice(0, 12).map((r, i) => ({
        id: `u${i}`,
        normalizedName: r.normalizedName,
        role: r.role,
        isActive: true,
      })),
      ROSTER,
    );
    assert.doesNotThrow(() => assertCredentialsAvailable(planParcial, validCredentials));
  });
});

describe('plantilla de credenciales', () => {
  test('la plantilla existe y cubre los 13 slugs exactos del roster', async () => {
    // "No me sale el seed-credentials" fue un fallo de diseno: el archivo no
    // viene en el repositorio y no habia plantilla que copiar.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const template = JSON.parse(
      readFileSync(join(process.cwd(), 'prisma/seed-credentials.example.json'), 'utf8'),
    ) as Record<string, unknown>;

    const slugs = Object.keys(template).filter((key) => !key.startsWith('_'));
    assert.deepEqual(slugs.sort(), ROSTER.map((entry) => entry.slug).sort());
  });

  test('la plantilla no lleva ninguna contrasena', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const template = JSON.parse(
      readFileSync(join(process.cwd(), 'prisma/seed-credentials.example.json'), 'utf8'),
    ) as Record<string, unknown>;

    for (const [key, value] of Object.entries(template)) {
      if (key.startsWith('_')) continue;
      assert.equal(value, '', `la plantilla trae un valor para ${key}`);
    }
  });

  test('el archivo real sigue estando en .gitignore', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const gitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf8');
    const rules = gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    assert.ok(
      rules.includes('prisma/seed-credentials.json'),
      'si esto falla, las contrasenas se pueden subir a GitHub',
    );
    assert.equal(
      rules.includes('prisma/seed-credentials.example.json'),
      false,
      'la plantilla si debe versionarse: es lo que se copia',
    );
  });

  test('las claves de metadatos se descartan al leer el archivo', () => {
    // Copiar la plantilla tal cual deja una clave _INSTRUCCIONES con un array
    // dentro. Si el seed no la descartase, daria un error confuso.
    const plan = buildSeedPlan([], ROSTER);
    const credentials: Record<string, string> = Object.fromEntries(
      plan.slugsNeedingPassword.map((slug) => [slug, 'contrasena-valida']),
    );
    assert.doesNotThrow(() => assertCredentialsAvailable(plan, credentials));
  });
});
