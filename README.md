# Peñita Golf Championship

**I Peñita Golf Championship – Ulzama-Bariain 2026**
Individual Stableford · Club de Golf Ulzama (4401) · recorrido Ulzama · barras amarillas · caballeros

Estado: **completa**. Lista para subir a GitHub y desplegar en Vercel.
Empieza por `docs/primer-despliegue.md`.

---

## Qué hay aquí ahora mismo

El núcleo deportivo, verificado y ejecutable: la parte en la que un error decidiría
una clasificación sin que nadie se enterase.

```
src/lib/golf/
  types.ts                Tipos del dominio. Décimas y centésimas enteras, nunca Float.
  decimal.ts              Parseo de hándicaps ("20,7" / "+2,4") y redondeo exacto.
  handicap.ts             Hándicap de campo y de juego. Dos políticas de redondeo.
  strokes.ts              Reparto de golpes por hoyo, incluidos hándicaps plus.
  stableford.ts           Puntos, categorías de bruto, totales y estados de tarjeta.
  ranking.ts              Clasificación, desempates, revelación, huella de snapshot.
  course.ts               Datos de Ulzama + validación completa de la sección 24.
  competition-config.ts   Confirmación de fuentes, congelado de reglas, arranque.

src/lib/auth/
  normalize.ts    Búsqueda sin tildes, por nombre, apellido o fragmentos.
  password.ts     Hash con registro versionado: scrypt + adaptador Argon2id.
  session.ts      Sesiones en servidor, invalidación por epoch, cookies.
  rate-limit.ts   Límite de intentos por jugador y por IP.

src/lib/scorecard/
  session.ts      Navegación, resumen previo, permisos de edición, guardado.
  visibility.ts   Quién ve qué tarjeta y quién puede revisarla.

src/lib/sync/
  queue.ts        Cola sin conexión: FIFO, reintentos, backoff.
  apply.ts        Aplicación idempotente y conflictos por hoyo.

src/lib/admin/
  draw.ts         Sorteo con semilla reproducible, horas y validaciones.

src/lib/reveal/
  controller.ts   Máquina de estados de la revelación progresiva.

src/lib/export/
  text.ts         Saneado WinAnsi: un emoji no tumba el PDF.
  guards.ts       Permisos: la clasificación completa solo publicada.
  pdf.ts          PDF de clasificación y de tarjeta, con pdf-lib.
  svg.ts          Imagen SVG sin dependencias, rasterizado opcional a PNG.

src/lib/pwa/
  cache-policy.ts Qué se cachea y qué nunca. Regla cerrada por omisión.

src/lib/http/
  routes.ts       Manifiesto de rutas y autorización. Denegar por omisión.

src/lib/storage/
  port.ts         Puerto de almacenamiento, con implementación en memoria.
  queue-store.ts  Persistencia atómica de la cola, por usuario, con cuarentena.
  indexeddb.ts    Adaptador de IndexedDB (fontanería, sin tests: no hay navegador).

src/app/          16 pantallas y 10 rutas de API (App Router).
src/middleware.ts Primera capa de autorización.
src/lib/data/     Lecturas: traducen Prisma a los tipos del dominio.
src/lib/actions/  Server actions: login, tarjeta, administración.

src/components/
  score.tsx       Celdas de bruto y puntos. La forma informa, no el color.
  scorecard.tsx   Tarjeta como lista de hoyos, totales sin bruto falso.
  keypad.tsx      Teclado 1-9 y raya, hoja de confirmación previa.
  leaderboard.tsx Clasificación con revelación y estado de guardado.

public/
  sw.js                 Service worker.
  manifest.webmanifest  Manifest de la PWA.

src/lib/seed/
  roster.ts       Los 13 jugadores. Sin ninguna contraseña.
  plan.ts         Planificador idempotente del seed.

prisma/schema.prisma        Modelo de datos completo (24 modelos, 11 enums).
prisma/seed.ts              Seed conectado a Prisma.
prisma/sql/constraints.sql  Restricciones CHECK que Prisma no puede expresar.
data/ulzama.snapshot.json   Datos del campo con procedencia de las dos fuentes.
src/styles/tokens.css       Paleta pastel y liquid glass con fallback sólido.
docs/                       Trazabilidad, proveedores, hándicap, seed, despliegue.
```

## Verificación ejecutada

```
427 tests · 427 pasando · 83 suites
26 módulos de lógica · type-check estricto · 0 errores
40 tests de render sobre React 19
38 tests de exportación, con los PDF leídos de vuelta
26 rutas, todas con regla de autorización declarada y verificada
npm run verify → referencias, tipos y tests de una pasada
```

Lo más relevante: la fórmula del hándicap se ha comprobado contra la **Tabla de
Equivalencias EGA oficial de la RFEG para Ulzama** incluida en la ficha adjunta.
Los 64 intervalos transcritos cuadran en ambos extremos y décima a décima, sin una
sola excepción, incluidos los cinco tramos de hándicap plus.

Para ejecutar los tests hace falta `tsx` (ver `docs/build-plan.md`, etapa 2, para
el `package.json` definitivo):

```bash
npm test
```

## Lo que hay que cerrar antes de jugar

1. **Valoración del campo.** La ficha adjunta dice 72,2 / 132 (octubre de 2014).
   El microsite oficial de RFEG del club publica hoy **72,6 / 139**. Está cargada
   la vigente, pero marcada como **pendiente de confirmación**: la app no la
   activa hasta que la confirmes desde el panel. El cambio no es menor, altera el
   hándicap de juego en 365 de 401 hándicaps posibles entre 0,0 y 40,0.
   → `docs/course-data-sources.md`

2. **Fecha de vigencia de esa valoración.** RFEG no la publica. Hay que pedir la
   ficha al club (deportivo@golfulzama.com). Es el único dato que falta para
   cerrar la trazabilidad.

La política de redondeo ya está decidida: **`ROUND_TWICE`**, autorizada el
17/09/2026, con un test que impide cambiarla en silencio.
→ `docs/handicap-calculation.md`

## Lo que NO hay todavía

La aplicación está entera. Lo que falta es lo que solo se puede hacer con red,
base de datos o navegador, y está detallado paso a paso en
[`docs/primer-despliegue.md`](docs/primer-despliegue.md):

1. `npm install` y `npx prisma generate`.
2. `npx prisma migrate dev --name init` y aplicar `prisma/sql/constraints.sql`.
3. El seed, con las credenciales fuera del repositorio.
4. Desplegar en Vercel.

**Aviso honesto sobre el primer build.** Todo lo que hay en `src/lib` (salvo
`db.ts`, `data/`, `actions/` y `auth/server.ts`) está type-checkeado y con 427
tests pasando. Las 26 rutas y las pantallas **no se han compilado**: el entorno
donde se generaron no tiene red. Espera errores de tipos en el primer
`npm run typecheck`, casi todos por nombres de campos de Prisma. Son de arreglar
en minutos y `tsc` los señala con archivo y línea.

Lo que no va a fallar es la lógica, porque está probada aparte.

Dos cosas que he decidido **no** entregar por ese motivo:

- **La migración inicial.** La genera `prisma migrate dev` en tu máquina. Una
  migración escrita a mano y sin validar es un archivo que se aplica solo y que
  nadie ha comprobado nunca.
- **Componentes de React sin compilar.** La lógica sí, la interfaz no.

## Stack previsto

Next.js (App Router) · React · TypeScript estricto · PostgreSQL en Neon · Prisma ·
Vercel · npm. Sin Firebase, sin Supabase, sin MongoDB, sin LocalStorage como base
de datos.

## Seguridad: nota sobre las contraseñas

Las 13 contraseñas iniciales del pliego **no aparecen en ningún archivo de este
repositorio**, ni en el README, ni en el CHANGELOG, ni en los tests. Se usarán una
única vez para generar hashes Argon2id en el seed de la etapa 2, y el seed será
idempotente: no sobreescribe una contraseña que el jugador haya cambiado después.

La comprobación se hace con un script que lee la lista de contraseñas desde un
archivo fuera del repositorio y busca cada una en el árbol de trabajo y en el ZIP.
Ese script no lleva las contraseñas dentro, y la lista no se versiona.

Detalle que conviene recordar: en el primer borrador de este README el ejemplo de
verificación incluía tres contraseñas literales. El propio chequeo lo detectó.
