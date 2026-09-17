# Primer despliegue: de aquí a Vercel

Sigue esto en orden. El paso 4 es el que va a dar trabajo y ahí explico por qué.

## 1. GitHub

```bash
git init
git add .
git commit -m "Peñita Golf Championship: núcleo verificado + capa de aplicación"
git branch -M main
git remote add origin git@github.com:TU-USUARIO/penita-golf-championship.git
git push -u origin main
```

`node_modules/`, `.env` y `prisma/seed-credentials.json` están en `.gitignore`.
Antes de empujar, comprueba que no se cuela nada:

```bash
git ls-files | grep -E "seed-credentials|\.env$"   # no debe devolver nada
```

## 2. Neon

Crea el proyecto y copia **las dos** cadenas de conexión:

- `DATABASE_URL`: la de **pooling**, con `-pooler` en el host. La usa la app.
- `DIRECT_URL`: la **directa**, sin pooler. La usan las migraciones.

Usar las dos no es opcional con Neon: `prisma migrate` sobre el pooler falla o se
comporta de forma errática, porque necesita sesiones con estado.

## 3. Variables de entorno

```bash
cp .env.example .env
openssl rand -base64 32    # -> AUTH_SECRET
```

Rellena `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` y
`NEXT_PUBLIC_APP_URL=http://localhost:3000`.

## 4. Instalación y primer build

```bash
npm install
npx prisma generate
npm run typecheck
```

**Aquí es donde va a salir trabajo, y conviene saberlo de antemano.**

Todo lo que hay bajo `src/lib/golf`, `src/lib/auth` (salvo `server.ts`),
`src/lib/sync`, `src/lib/scorecard`, `src/lib/admin`, `src/lib/reveal`,
`src/lib/export`, `src/lib/pwa`, `src/lib/http` y `src/lib/storage` está
**type-checkeado y con 427 tests pasando**. Esa parte no debería dar sorpresas.

Lo que **no** se ha podido comprobar en el entorno donde se generó, porque no
tiene red ni base de datos:

| Qué | Por qué |
|---|---|
| Los 16 `page.tsx` y 10 `route.ts` | Necesitan `next build` |
| `src/lib/db.ts`, `src/lib/data/queries.ts`, `src/lib/actions/*` | Necesitan el cliente de Prisma generado |
| `src/lib/auth/server.ts` | Necesita `next/headers` y Prisma |
| Los componentes `.tsx` | Renderizan y su marcado está verificado con 40 tests, pero `tsc` necesita `@types/react` |

### Lo que ya se ha arreglado del primer build

El primer intento en Vercel falló así:

```
UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
Import trace: node:crypto <- ./src/lib/auth/session.ts
```

Causa: `src/middleware.ts` importaba el nombre de la cookie de `session.ts`, y
con él se arrastraba `node:crypto`. **El middleware de Next corre en el runtime
edge**, donde webpack no resuelve los módulos de Node.

Arreglado moviendo el nombre y las opciones de la cookie a
`src/lib/auth/cookie.ts`, sin dependencias de Node. Y para que no vuelva:

- `bundle-boundaries.test.ts` recorre el grafo de importaciones desde el
  middleware y desde los 14 componentes de cliente, y falla si alcanza un
  `node:`, Prisma o `next/headers`.
- `prisma-references.test.ts` compara cada modelo, campo, clave compuesta y
  valor de enum contra `schema.prisma`.

Los dos se han verificado reintroduciendo los errores a propósito.

### El segundo build también falló, y también está arreglado

```
./src/lib/auth/password.ts:68
Type error: Expected 3 arguments, but got 4.
```

`promisify(scrypt)` hace que TypeScript resuelva la firma por `__promisify__` y
se quede en la variante de tres argumentos. Sustituido por un envoltorio
explícito con `new Promise`, que usa la sobrecarga concreta de cinco argumentos.

Y para no ir error por error, se pasó `tsc --strict` sobre el proyecto completo
usando declaraciones mínimas de los paquetes externos. **Resultado: cero errores
en el código que se despliega.**

También se ha separado el type-check: `next build` ya solo compila `src/`. Los
tests, los scripts y el seed se comprueban con `npm run typecheck`, que pasa los
dos tsconfig. Un roce de tipos en un test no debe tumbar un despliegue.

### Dónde puede seguir apareciendo algo

Queda una sola cosa que no se ha podido descartar sin la base de datos:

**Campos de Prisma anidados más de un nivel.** `prisma-references.test.ts`
comprueba el primer nivel de `select`, `include` y `orderBy`; más adentro no
puede saber a qué modelo pertenece cada clave sin resolver relaciones. El cliente
real sí lo sabe, así que si aparece algo será ahí, y `tsc` lo dirá con archivo y
línea.

Todo eso son errores de tipos: `tsc` los señala con archivo y línea, y son de
arreglar en minutos. No son errores de lógica, porque la lógica está probada.

## 5. Migración

```bash
npx prisma migrate dev --name init
```

Esto genera la migración canónica. **No hay ninguna migración en el repositorio
a propósito:** un archivo de migración sin validar es algo que se aplica solo y
que nadie ha comprobado nunca.

Después, las restricciones que Prisma no sabe expresar:

```bash
psql "$DIRECT_URL" -f prisma/sql/constraints.sql
```

Pruébalo primero contra una **rama de desarrollo de Neon**. Son instantáneas y
desechables, así que comprobarlo es gratis. Ese archivo tampoco se ha ejecutado
nunca contra un PostgreSQL real.

## 6. Seed

```bash
# Crea prisma/seed-credentials.json con las 13 contraseñas.
# Formato en docs/seed-credentials.md. Está en .gitignore.
npm run db:seed
rm prisma/seed-credentials.json
```

El seed es idempotente: solo establece contraseña al crear un usuario, nunca la
reescribe. Y deja la valoración 72,6 / 139 activa y confirmada, con su entrada
de auditoría.

## 7. Arranque local

```bash
npm run dev
```

Comprueba, en este orden:

- [ ] `/login` lista los 13 y la búsqueda encuentra a Suárez escribiendo «suarez».
- [ ] Entras y caes en `/tarjeta`.
- [ ] Un jugador que escriba `/admin` recibe **404, no 403**.
- [ ] Con tu cuenta, `/admin` abre y el resumen lista las incidencias.
- [ ] Pones hándicaps en `/admin/jugadores`; el hándicap de juego sale solo.
- [ ] Sorteas en `/admin/partidos`, pones la primera salida, confirmas.
- [ ] Apuntas un hoyo; la tarjeta actualiza puntos y avanza al siguiente.

## 8. Vercel

- Importa el repositorio.
- Variables: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
  (con la URL real del despliegue).
- El comando de build ya es `prisma generate && next build`.
- Región: **Frankfurt (`fra1`)** o **París (`cdg1`)**, la más cercana a la de tu
  proyecto de Neon. Un torneo se juega en una mañana: la latencia entre la
  función y la base de datos se nota más que la que hay hasta el móvil.

### Después del primer despliegue

- [ ] **Instala la app en un iPhone y en un Android** («Añadir a pantalla de
      inicio»). El icono debe verse como un cuadrado navy con el escudo, sin
      marco claro alrededor ni contorno fantasma. En Android, comprueba que
      «PEÑITA» y «ULZAMA-BARIAIN» se leen enteros: si tu lanzador usa máscara
      circular, usará la versión maskable, que lleva el escudo al 70 %.
- [ ] Comprueba que al abrir desde la pantalla de inicio la barra de estado sale
      navy y no hay barra del navegador.
- [ ] Recorre la lista de `docs/acceptance-tests.md`.
- [ ] Y el punto que de verdad importa: **recorre los 18 hoyos comprobando dónde
      no hay cobertura.** Ulzama es un valle con robledal. Toda la arquitectura
      offline está construida sobre esa suposición, pero conviene saber dónde
      falla la señal antes del día del torneo, no ese día.

## Si algo se rompe el día del torneo

- La tarjeta funciona sin cobertura. Los resultados se guardan en el móvil y se
  envían solos. No hay que hacer nada.
- Si un jugador ve «Error al sincronizar», sus resultados **siguen en su móvil**.
  No cierre sesión: eso avisa antes de borrar nada, pero mejor no tentar.
- Si la clasificación se bloquea a mitad de la revelación es porque se corrigió
  una tarjeta. Reinicia la presentación desde `/admin/revelacion`; los datos
  deportivos no se tocan.
- Como respaldo, siempre se puede exportar el PDF de cada tarjeta y hacer la
  clasificación a mano. Todo está en `/admin/exportacion`.
