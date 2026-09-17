# Changelog

Formato basado en Keep a Changelog. Versionado semantico.

## [1.0.10] - 2026-09-17

`loginPath` salio `ok` y la aplicacion seguia fallando. La sonda tenia un hueco.

### Diagnostico

La sonda probaba consultas **planas**: leer intentos, leer usuario, leer sesion,
escribir, verificar hash. Todas pasaban.

Pero la aplicacion usa `include` **anidados** —uniones entre tres y cuatro
tablas— que generan un SQL completamente distinto. En particular
`getCurrentUser()`, que recorre `session -> user -> competitionPlayers ->
flightMember` y se ejecuta en la **primera peticion despues de entrar**.

El sintoma engañaba: un fallo ahi sale por la misma pantalla que un fallo del
login, porque los dos usan el mismo `error.tsx`. Con la contrasena correcta se
entra, se redirige a /tarjeta, y /tarjeta revienta.

### Anadido

- **`appPath` en `/api/diagnostico`**: prueba el camino posterior al login en
  cuatro pasos —`SESSION_WITH_USER`, `COMPETITION_WITH_COURSE`, `SCORECARDS` y
  `RANKING`— y dice en cual falla, con el codigo de Prisma.

  Llama a las funciones **reales** de `queries.ts` en vez de replicar sus
  consultas. Replicarlas es lo que permitio el hueco: la sonda pasaba mientras la
  aplicacion fallaba.

- Cinco guardianes de la cobertura de la sonda: que cubra los cinco pasos del
  login, los cuatro del camino posterior, que llame a las funciones reales, que
  la sonda posterior **no escriba nada**, y que todos los caminos de `diagnose()`
  devuelvan las dos sondas.

## [1.0.9] - 2026-09-17

### Anadido

- **`version` como primer campo de `/api/diagnostico`.**

  Nace de una confusion real. El diagnostico devolvia `"ready": true` y la
  aplicacion seguia fallando al iniciar sesion. La unica forma de saber que
  version estaba respondiendo era **deducirla por los campos que traia la
  respuesta**: sin `AUTH_SECRET` era 1.0.7 o posterior, sin `loginPath` era
  anterior a 1.0.8. Averiguar la version desplegada por arqueologia de un JSON
  es absurdo, y costo un turno entero.

  Ahora lo dice. Es el primer campo a proposito: si el diagnostico dice que todo
  esta bien y la aplicacion falla, lo primero que hay que descartar es que
  responda una version antigua.

- `src/lib/version.ts` con la version como constante. No se importa
  `package.json`: funciona, pero depende del rastreo de archivos de Next y es
  una dependencia fragil para un dato de siete caracteres.

- Tres guardianes: `APP_VERSION` coincide con `package.json` —verificado
  desincronizandolo a proposito—, **todos** los caminos de `diagnose()` devuelven
  la version (si uno se la deja, es justo el caso en el que hara falta), y
  `version.ts` no importa nada.

## [1.0.8] - 2026-09-17

El login fallaba con la misma pantalla de error con la contrasena correcta y con
una incorrecta.

### Diagnostico

Que el error fuera identico en los dos casos descarta la autenticacion: una
contrasena mala devuelve un mensaje, no una excepcion. El fallo estaba antes de
comprobarla, en una de cinco operaciones, y la pantalla de error no daba
ninguna pista sobre cual.

### Corregido

- **`login()` ya no tumba la pagina.** Envuelto en try/catch: el detalle va a los
  logs y el jugador ve un mensaje que dice explicitamente que el problema es del
  servidor y no de su contrasena, con el enlace al diagnostico. Antes, cualquier
  excepcion en ese camino sacaba la pantalla generica.

- **`prisma.user.findUnique` pedia las doce columnas de User** por no llevar
  `select`. Ahora pide las cuatro que usa. Cuanto menos se pida, menos
  superficie para que un desajuste entre esquema y base de datos rompa el login.
  Es tambien por lo que `getLoginRoster` funcionaba y esto no: aquel si lleva
  `select`.

- **`createMany` sustituido por dos `create`.** Son dos filas, `createMany` no
  aporta nada ahi, y `create` es el camino mas trillado para la generacion del
  identificador. Un sospechoso menos.

### Anadido

- **Sonda del camino de login en `/api/diagnostico`.** Ejecuta en orden las
  mismas operaciones que el inicio de sesion —lectura de intentos, lectura de
  usuario, lectura de sesion, escritura y verificacion del hash— y dice **en que
  paso falla**, con el codigo de error de Prisma.

  Las escrituras van dentro de una transaccion **que se aborta a proposito**: se
  comprueba que el INSERT funciona sin dejar ni una fila detras.

- **`src/lib/data/sanitize.ts`**, modulo puro. El diagnostico es publico, asi que
  su salida tiene que estar limpia: los mensajes de Prisma pueden llevar la
  cadena de conexion dentro. Oculta cadenas de conexion, contrasenas, sslmode y
  hashes, y recorta a 300 caracteres. Deja pasar lo que si hace falta, como
  "The column User.defaultColor does not exist".

  Estaba dentro de `health.ts` y el test no podia importarlo sin arrastrar el
  cliente de Prisma entero. Que un test no pueda alcanzar una funcion es señal de
  que esta en el sitio equivocado.

- Tests del saneado: oculta lo que debe, deja pasar lo que hace falta, nunca
  lanza con ninguna entrada, recorta, extrae el codigo de Prisma, y no importa
  Prisma.

## [1.0.7] - 2026-09-17

Las tablas ya existen en Neon; faltaba poder poblarlas sin tocar nada en local.

### Anadido

- **`npm run gen:seed-sql`**, que produce `prisma/sql/datos-iniciales.sql`: los 13
  jugadores con su contrasena hasheada, el campo, la fuente RFEG, la competicion,
  la valoracion activa y confirmada, los 18 hoyos, las 13 inscripciones y la
  entrada de auditoria de la confirmacion. 49 filas en 8 INSERT.

  Existe porque el seed normal necesita Node: las contrasenas se guardan
  hasheadas y el hash no se puede calcular en SQL. Esto lo calcula una vez y lo
  escribe, para poner en marcha el torneo pegandolo en el editor de Neon.

  **El archivo contiene hashes de contrasenas reales.** Esta en `.gitignore`, no
  se comparte y hay que borrarlo tras ejecutarlo. Las contrasenas en claro se
  leen de `seed-credentials.json`, que tampoco se versiona, y no aparecen en la
  salida por ningun sitio: comprobado.

  Es re-ejecutable con `ON CONFLICT DO NOTHING`, asi que pegarlo dos veces no
  duplica nada ni reescribe una contrasena cambiada despues.

  Verificado extrayendo los 13 hashes del SQL y comprobando con el propio
  `verifyPassword` que **cada uno valida su contrasena y rechaza otra**, que los
  13 son distintos entre si (salt aleatorio) y que ninguna columna obligatoria
  del esquema falta en ningun INSERT. Las columnas obligatorias se derivan del
  esquema, no de una lista escrita a mano.

### Corregido

- **`AUTH_SECRET` no existia.** Estaba en `.env.example`, en tres documentos y,
  lo peor, en el diagnostico como **bloqueante**: decia que faltaba algo para
  arrancar cuando el codigo no la lee en ningun sitio. La puse por costumbre.

  Las sesiones no necesitan secreto de firma porque no se firma nada: la cookie
  lleva un token aleatorio opaco de 256 bits y en la base se guarda su SHA-256.
  La validez se comprueba contra la tabla de sesiones, no descifrando la cookie.

  Eliminada de todas partes. Una lista de variables con entradas fantasma hace
  que nadie se fie de la lista, que es lo contrario de para lo que existe.

- `DIRECT_URL` deja de parecer un problema en el diagnostico. Solo la usan
  `prisma migrate` e `introspect`: si el esquema se creo con SQL, la aplicacion
  funciona sin ella. Documentado en la propia interfaz de `Diagnosis`.

- Anadido un guardian: **toda variable declarada en `.env.example` tiene que
  leerse en el codigo**. Es la forma general del fallo anterior.

## [1.0.6] - 2026-09-17

### Corregido

- **El build fallaba con `P1012: This line is not a valid definition within a
  generator`, once veces.**

  El comentario que anadi al bloque `generator client` era un comentario de
  bloque al estilo de TypeScript. **El lenguaje de esquema de Prisma solo admite
  comentarios de linea.** Convertido a doble barra.

  Lo que hacia el error dificil de leer es que Prisma no dice en ningun momento
  que el problema sea el comentario: repite once veces que la linea no es una
  definicion valida, una por cada linea del bloque.

- Anadido un guardian de sintaxis de `schema.prisma`: sin comentarios de bloque,
  sin lineas que empiecen por asterisco, bloques de nivel superior conocidos,
  `binaryTargets` con el objetivo de Vercel y `directUrl` para Neon. Verificado
  reintroduciendo el comentario que tumbo el build: saltan dos tests.

### Anadido

- **`prisma/seed-credentials.example.json`**, versionada. El archivo real nunca
  viene en el repositorio —esta en `.gitignore` porque lleva contrasenas— y no
  habia nada que copiar: habia que ir a la documentacion a buscar los trece
  slugs. Eso era un fallo de diseno.

  Ahora se copia y se rellena:

      cp prisma/seed-credentials.example.json prisma/seed-credentials.json

- El error del seed cuando falta el archivo **imprime la plantilla completa**
  lista para copiar, con los trece slugs. Decir solo "falta el archivo" obliga a
  buscar los nombres en otro sitio.

- El seed descarta las claves que empiezan por guion bajo, para que copiar la
  plantilla tal cual —con su clave de instrucciones dentro— no de un error raro.

- Tests: la plantilla cubre los trece slugs exactos del roster, no lleva ninguna
  contrasena, el archivo real sigue en `.gitignore` y la plantilla no.

## [1.0.5] - 2026-09-17

### Anadido

- **`prisma/sql/schema.sql`**: creacion completa del esquema en SQL, para pegar
  en el editor de Neon sin instalar nada.

  **Generado** desde `prisma/schema.prisma` por `scripts/generate-sql.ts`, no
  escrito a mano: son 20 tablas, 255 campos, 24 claves foraneas, 14 indices
  unicos, 13 indices y 13 enums. Transcribir eso a mano es garantizar una
  errata, y una columna que falta no se nota hasta que alguien intenta escribir
  en ella.

  Va en una transaccion —un esquema a medias es peor que ninguno— y es
  re-ejecutable: enums con bloque condicional, tablas e indices con
  `IF NOT EXISTS`. Las claves foraneas van al final, asi el orden de creacion de
  tablas da igual.

- **31 tests de verificacion del SQL.** Comprueban que cada modelo tiene tabla,
  cada campo escalar o de enum tiene columna con la nulabilidad correcta, cada
  enum tiene sus valores exactos, cada `@unique` y `@@index` tiene su indice,
  cada relacion tiene su clave foranea con el borrado en cascada que declara el
  esquema, y que los recuentos cuadran en los dos sentidos: ni falta ni sobra.

  Verificado borrando una columna del SQL a mano: saltan tres tests.

  Tambien comprueban `constraints.sql`, que si esta escrito a mano: que toda
  tabla y toda columna de sus `CHECK` existan de verdad en el esquema. Una
  errata ahi tumbaria la transaccion entera al aplicarla.

- `prisma/sql/constraints.sql` pasa a ser re-ejecutable, porque se va a pegar en
  un editor y pegarlo dos veces no debe romper nada.

- `npm run gen:sql` y `npm run db:schema`.

### Corregido

- El generador producia `"id" TEXT NOT NULL DEFAULT 'cuid('::"String"`. La
  expresion regular de `@default` cortaba en el primer parentesis, asi que
  `@default(cuid())` capturaba `cuid(` y caia en la rama de los enums. Detectado
  leyendo el SQL generado, no por los tests.

  `cuid()` no debe traducirse a un DEFAULT de base de datos: lo genera el cliente
  de Prisma. Hay un test que comprueba que la palabra `cuid` no aparece en el SQL
  y que ninguna columna `id` lleva DEFAULT.

### Nota

`npx prisma db push` sigue siendo el camino recomendado: un comando, y el SQL lo
genera Prisma en vez de una persona. El archivo existe para quien prefiera pegarlo
en Neon, y lleva escrito en la cabecera que nunca se ha ejecutado contra un
PostgreSQL real.

## [1.0.4] - 2026-09-17

El build pasa y el despliegue queda Ready, pero toda peticion muere con
"Application error: a server-side exception has occurred" y un digest.

### Anadido

- **`/api/diagnostico`.** Un fallo de base de datos en Next produce un mensaje
  generico y un digest que no dicen nada: averiguar si falta una variable de
  entorno, la migracion o el seed cuesta veinte minutos de prueba y error. Esto
  lo convierte en una URL.

  Clasifica el fallo en `NO_URL`, `NO_ENGINE`, `NO_TABLES` o `UNREACHABLE`, y
  devuelve el siguiente paso concreto. Publico a proposito, porque se necesita
  justo cuando la autenticacion no funciona, y sin nada sensible: booleanos,
  recuentos y el paso siguiente. Ni mensajes de la base de datos, ni cadenas de
  conexion, ni trazas.

- **`binaryTargets = ["native", "rhel-openssl-3.0.x"]`** en el generador de
  Prisma. Cuando el entorno de build y el de ejecucion de Vercel no coinciden, el
  motor de consultas no viaja en el despliegue y toda peticion muere con
  `Query engine library for current platform could not be found`. Declararlo pesa
  unos megas mas y quita el problema de encima.

- **`error.tsx`, `global-error.tsx` y `not-found.tsx`.** Sin ellos, cualquier
  excepcion deja la pantalla generica de Next. La de error no muestra el fallo
  —eso se queda en los logs— pero dice lo unico que un jugador necesita saber a
  mitad de una vuelta: **que sus resultados estan guardados en el movil**. Y no
  es un consuelo: la tarjeta se escribe en IndexedDB antes de intentar la red.

- **`/login` tolera que la base de datos no este lista.** Era la primera consulta
  que hacia la aplicacion y donde reventaba. Ahora captura el fallo y dice que
  hacer, con enlace al diagnostico.

- `docs/si-algo-falla.md`: el orden correcto de puesta en marcha, la tabla de
  causas y el plan de respaldo para el dia del torneo.

- 452 tests. Al declarar `/api/diagnostico` saltaron dos guardianes —el del
  recuento de rutas publicas y el de la tabla de muestras— tal como debian:
  anadir una ruta publica tiene que ser deliberado. Quedan justificados en el
  propio test.

### Nota

`not-found.tsx` es tambien lo que responde `requireAdmin()` a quien no es
administrador, asi que su texto no menciona permisos ni administracion: un 403
confirmaria que la ruta existe.

## [1.0.3] - 2026-09-17

Arregla el segundo build fallido en Vercel, en la fase de type-check.

### Corregido

- **`Type error: Expected 3 arguments, but got 4` en `src/lib/auth/password.ts`.**

  `promisify(scrypt)` hace que TypeScript resuelva la firma a traves de
  `__promisify__`, y ahi se queda en la variante de tres argumentos: pasar las
  opciones de scrypt no compila.

  Se sustituye por un envoltorio explicito con `new Promise`, que usa la
  sobrecarga concreta de cinco argumentos y deja el tipo de retorno escrito en
  lugar de depender de la tabla de sobrecargas de `promisify`. Menos magia y un
  tipo de retorno de verdad: desaparecen tambien los dos `as Buffer`.

### Cambiado

- **`next build` ya no type-checkea los tests, los scripts ni el seed.**

  `tsconfig.json` incluia `**/*.ts`, asi que la fase de type-check del despliegue
  compilaba tambien los 14 archivos de test. Un roce de tipos en un test no debe
  poder tumbar un despliegue de la aplicacion.

  `tsconfig.json` se limita a `src/`; `tsconfig.test.json` los vuelve a incluir;
  y `npm run typecheck` pasa **los dos**, asi que nada queda sin comprobar.

- `engines.node`: `22.x`.

### Metodo

Para no volver a ir error por error, se ha montado un arnes de type-check con
declaraciones minimas de los paquetes externos (Node, React, Next, Prisma,
pdf-lib, sharp) y se ha pasado `tsc --strict` sobre el proyecto entero sin red.

Resultado: **0 errores en el codigo que se despliega.** Los 43 que aparecian al
principio eran, uno por uno, artefactos de unos stubs demasiado permisivos; se
confirmaron como tales completando los stubs con lo que las bibliotecas reales si
declaran (`key` en JSX, los modulos `*.css`, y la firma de asercion de
`assert.ok`), tras lo cual el recuento baja a cero.

Lo que el arnes NO puede descartar: los campos de Prisma anidados mas de un
nivel, porque el cliente real no esta generado. Eso lo cubre en parte
`prisma-references.test.ts`, que comprueba el primer nivel.

## [1.0.2] - 2026-09-17

Arregla el primer build fallido en Vercel.

### Corregido

- **El build fallaba con `UnhandledSchemeError: Reading from "node:crypto"`.**

  `src/middleware.ts` importaba `SESSION_COOKIE_NAME` de `src/lib/auth/session.ts`,
  y con el nombre de la cookie se arrastraba `node:crypto` al empaquetado. El
  middleware de Next corre en el runtime EDGE, donde webpack no resuelve los
  modulos de Node, asi que el build revento despues de compilar todo lo demas.

  El nombre y las opciones de la cookie pasan a `src/lib/auth/cookie.ts`, un
  modulo sin ninguna dependencia de Node. `session.ts` los reexporta, asi que el
  codigo de servidor sigue importando de un solo sitio. El middleware importa de
  `cookie.ts`.

  Es una clase de error que los tests de unidad NO detectan: cada modulo
  funcionaba perfectamente por separado; el problema era donde acababa
  empaquetado.

- `engines.node` pasa de `>=20.11.0` a `22.x`. Vercel avisaba de que el rango
  abierto se actualizaria solo al salir un Node major nuevo. 22.x es la version
  con la que se ejecutan los tests.

### Anadido

- **Guardian de fronteras de empaquetado** (`bundle-boundaries.test.ts`):
  recorre el grafo de importaciones desde `src/middleware.ts` y desde cada uno
  de los 14 componentes `'use client'`, y falla si alcanza un `node:`, Prisma o
  `next/headers`. El recorrido se detiene en los archivos `'use server'`, porque
  una server action es una frontera real.

  Verificado reintroduciendo el bug exacto: el test reproduce el mismo rastro que
  dio Vercel, `node:crypto via src/middleware.ts -> src/lib/auth/session.ts`.

  Comprueba tambien que toda ruta que use pdf-lib o sharp declare
  `runtime = 'nodejs'`: en edge no funcionan, y eso falla al desplegar, no al
  compilar.

- **Guardian de referencias a Prisma** (`prisma-references.test.ts`): compara
  cada `prisma.<modelo>`, cada clave compuesta, cada clave de `select`,
  `include` y `orderBy` del primer nivel, y cada literal de enum, contra
  `schema.prisma`. Era la clase de error que quedaba mas probable, porque el
  esquema esta escrito a mano y el cliente se genera de el.

  El analisis sigue las llaves en vez de usar una expresion regular suelta: una
  primera version atribuia los `select` anidados al modelo de fuera y daba trece
  falsos positivos. Verificado introduciendo un campo inexistente y un modelo mal
  escrito: los detecta los dos.

  **Resultado sobre el codigo real: ninguna referencia incorrecta.**

- 451 tests ejecutandose y pasando (antes 436).

## [1.0.1] - 2026-09-17

### Cambiado

- **Icono de la aplicacion: el escudo de la Peñita.** Fuente unica en
  `assets/logo.png`; los PNG se regeneran con `npm run gen:icons`.
  - `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180, iOS) y
    `icon-maskable-512.png`.
  - Manifest y barra de estado pasan a los colores del escudo, medidos sobre el
    logo: navy `#364f6e` y crema `#f4edde`. La interfaz sigue en verde a
    proposito: se ha cambiado solo lo que continua el icono al abrir la app.
  - `appleWebApp.statusBarStyle` pasa a `black-translucent`: con el navy detras,
    una barra blanca cortaba el icono al abrir.

### Corregido, sobre el logo tal como venia

- **Doble redondeo.** El logo traia las esquinas ya redondeadas y margen blanco.
  iOS y Android aplican su propia mascara, asi que se habria redondeado dos
  veces: marco claro alrededor de un cuadrado mas pequeno. Las esquinas se
  rellenan con el navy del borde y el icono es un cuadrado a sangre.
- **Halo del borde.** El logo lleva un borde mas claro en su perimetro. Al
  rellenar las esquinas quedaba dentro como un contorno redondeado fantasma,
  como si el icono estuviera pegado encima de otro. Se recorta un 2,5 % por lado
  antes de escalar. Detectado mirando el PNG generado.
- **Texto recortado en Android.** "PEÑITA" y "ULZAMA-BARIAIN" van pegados al
  borde y el recorte circular de Android se los habria comido. La version
  maskable lleva el escudo al 70 %.
- **Cuadrado fantasma en el maskable.** Reducir el logo entero dejaba ver su
  cuadrado interior con degradado, como una pegatina. Ahora el escudo se separa
  de su fondo por luminancia y va sobre navy plano.
- **Vertices blancos colandose.** Al separar por luminancia, los vertices
  blancos del original pasaban el umbral y aparecian como cuatro cunas de crema.
  Se recortan con la mascara redondeada.

### Anadido

- 18 tests sobre los PNG generados: esquinas, navy exacto, ausencia de halo,
  cero pixeles fuera del circulo de Android, vertices limpios y coherencia entre
  manifest, tokens y layout. Verificados poniendo el PNG original sin procesar
  como icono: saltan dos.
- Los accesos directos del manifest se comprueban contra las paginas reales.

## [1.0.0] - 2026-09-17

Primera version completa. Lista para subir a GitHub y desplegar en Vercel.

### Anadido

- **Capa de aplicacion completa:** 16 pantallas y 10 rutas de API del App Router.
  - Jugador: login con selector buscable, mi tarjeta, detalle de hoyo con
    teclado, ver partido con revision cruzada, clasificacion con revelacion,
    pantalla sin conexion.
  - Administracion: resumen con incidencias enlazadas, jugadores, campo y
    reglas, partidos con sorteo, tarjetas, clasificacion provisional,
    revelacion, historial y exportacion.
- `src/middleware.ts`: primera capa de autorizacion. Delega el rol al servidor a
  proposito, porque el middleware corre en edge y no puede leer la base de
  datos. La capa que protege es `requireAdmin()` en cada pagina y accion.
- `src/lib/data/queries.ts`: lecturas que traducen Prisma a los tipos del
  dominio. No decide nada deportivo.
- `src/lib/actions/`: server actions de login, tarjeta y administracion. Cada una
  delega la decision en el dominio ya probado.
- `middlewareDecision` con sus tests, incluida la invariante de que el middleware
  **nunca** concede acceso de admin por si solo.
- El guardian de rutas ya esta activo: compara el manifiesto con los archivos
  reales de `src/app`. Verificado anadiendo una ruta sin declarar: la suite falla.
- `docs/primer-despliegue.md`: guia paso a paso, con los sitios donde es
  probable que aparezcan errores de tipos en el primer build y por que.
- 427 tests ejecutandose y pasando (antes 421).

### Cambiado

- **Fecha de vigencia de la valoracion registrada: julio de 2024**, confirmada
  por el organizador. La trazabilidad del campo queda cerrada.
- **package.json pasa a Next 15 y React 19.** El codigo usa `useActionState`,
  `params` como Promise y `await cookies()`, que son API de Next 15 / React 19,
  y el package.json declaraba Next 14 / React 18. La incoherencia habria
  reventado el primer build.
- `next.config.mjs`: `experimental.serverComponentsExternalPackages` pasa a
  `serverExternalPackages`, que es donde vive en Next 15. Se anaden `sharp` y
  `pdf-lib`: empaquetar sharp rompe porque lleva binario nativo.
- `toJson()` en `src/lib/db.ts` para los campos `Json` de Prisma: el dominio
  devuelve `unknown` porque no debe saber nada de Prisma.

### Notas de verificacion

Lo que esta comprobado y lo que no, con detalle, en `docs/lo-que-falta.md`.

En resumen: los 26 modulos de logica estan type-checkeados con 427 tests; los
componentes se verifican renderizando; las 26 rutas tienen su regla de
autorizacion declarada y comprobada contra los archivos reales. Lo que **no** se
ha compilado son las paginas, las rutas y la capa de Prisma, porque el entorno
donde se generaron no tiene red ni base de datos.

## [0.9.0] - 2026-09-17

### Cambiado

- **Tercer criterio de desempate: golpes numericos -> golpes AJUSTADOS.**
  Autorizado por el organizador. El criterio del pliego favorecia a quien
  levantaba la bola: un hoyo con raya no sumaba nada, asi que cuanto peor iba un
  hoyo, mas convenia no terminarlo.

  La correccion no se ha inventado. Los hoyos sin resultado numerico se imputan
  con las cifras del WHS: una raya cuenta como **doble bogey neto** (par + 2 +
  golpes recibidos) y un hoyo no jugado como **par neto**. El doble bogey neto es
  justo el umbral a partir del cual un hoyo vale 0 puntos Stableford: quien
  levanta la bola ha hecho al menos eso.

  Caso que antes se resolvia mal y ahora no: 36 puntos y mismo hándicap, uno con
  95 golpes y sin rayas frente a otro con 88 golpes y tres rayas. Antes ganaba el
  segundo; ahora sus 88 se convierten en 109 y gana quien termino los hoyos.

- La clasificacion muestra los golpes escritos, y el ajustado solo cuando hay
  rayas. El PDF anade columna "Ajust." y nota al pie explicandola.
- `tieBreakWarning` pasa a llamarse `tieBreakNote`: ya no avisa de un problema,
  informa de sobre que base se resolvio un desempate.
- **Valoracion del campo CONFIRMADA:** 72,6 / 139, comprobada por el organizador
  contra el microsite oficial de RFEG el 17/09/2026. El snapshot se activa con
  actor, fecha y entrada de auditoria con el motivo, que es exactamente lo que
  habria quedado registrado al pulsar el boton del panel. La restriccion
  `active_requires_confirmation` sigue vigente.
- El test que exigia `confirmedAt: null` se sustituye por el invariante que de
  verdad importa: una valoracion activa **nunca** sin actor y sin fecha.
- **Contrasenas iniciales: se mantienen las del pliego.** Decidido por el
  organizador. docs/seed-credentials.md queda como constancia del razonamiento,
  no como propuesta pendiente.

### Anadido

- `netDoubleBogey` y `netPar` en el motor, con sus tests.
- `adjustedStrokes` e `imputedHoles` en los totales de la tarjeta.
- Un test que deja por escrito que falta la fecha de vigencia de la valoracion:
  si alguien la consigue, le recuerda que hay que actualizar el snapshot.
- 420 tests ejecutandose y pasando (antes 415).

### Corregido

- Un test de la imagen comprobaba `/1 raya</`, atado a que la linea terminase
  justo ahi. Al anadir el ajustado dejo de cuadrar. Aflojado a `/1 raya\b/` con
  la comprobacion negativa del plural intacta.

## [0.8.0] - 2026-09-17

### Anadido

- **Persistencia de la cola offline**, que es la pieza con mas riesgo de todo el
  proyecto: si falla, se pierde un hoyo, y es lo unico que el pliego prohibe de
  forma absoluta.
- Puerto de almacenamiento con dos implementaciones: memoria (probada) e
  IndexedDB (fontaneria fina, sin tests porque no hay navegador aqui).
- Escritura ATOMICA. Sin ella, dos confirmaciones de hoyo casi simultaneas leen
  la misma cola y la segunda escritura pisa la primera: un hoyo confirmado
  desaparece en silencio. Hay un test con nueve confirmaciones a la vez.
- Espacio de nombres por usuario: los datos de dos jugadores no se mezclan en el
  mismo dispositivo, y encolar la operacion de otro usuario se rechaza.
- Cuarentena en vez de borrado: un dato ilegible o de una version desconocida se
  aparta sin destruirlo, porque dentro puede haber hoyos que solo existan en ese
  movil. Cerrar sesion no borra la cuarentena.
- `requestPersistentStorage()`: sin ella, iOS y Android pueden vaciar IndexedDB
  cuando al movil le falta espacio.
- `docs/lo-que-falta.md`: inventario exacto de lo que queda para el 100 %.
- 415 tests ejecutandose y pasando (antes 392).

### Corregido

- `load()` lanzaba una excepcion si el valor guardado era la cadena `"null"`:
  `JSON.parse` devuelve `null` y el acceso a `.schemaVersion` reventaba. La
  asercion `as Partial<StoredQueue>` ocultaba el fallo al compilador, que se
  creia que siempre era un objeto. En un movil eso habria dejado la app sin poder
  cargar la tarjeta.
- La misma comprobacion estaba duplicada en tres sitios (`load`, `enqueue` y
  `mutate`) y solo uno tenia el fallo. Centralizada en `readStored`.

## [0.7.0] - 2026-09-17

### Anadido

- **Manifiesto de rutas y puerta de autorizacion** con la decision central de
  DENEGAR POR OMISION: una ruta sin regla explicita no existe. El modelo
  contrario (abierto salvo lista negra) falla en silencio el dia que alguien
  anade una pantalla y se olvida del middleware.
- A un jugador que escribe `/admin` a mano se le responde **404, no 403**. Un
  403 confirma que la ruta existe.
- Sin sesion: las paginas redirigen al login conservando el destino; las rutas de
  API devuelven 401. Redirigir una peticion de datos a una pagina HTML rompe el
  cliente.
- Guardian a futuro: en cuanto exista `src/app`, cada `page.tsx` y cada
  `route.ts` tendra que estar declarado en el manifiesto o la suite falla. Ahora
  se salta con un aviso.
- **Los tres iconos de la PWA**, generados desde un unico SVG con
  `npm run gen:icons`. Verificados por tamano, formato y analisis de pixeles.
- Zona de seguridad del icono maskable comprobada contando pixeles: cero pixeles
  de la bandera caen fuera del circulo que recorta Android.
- `scripts/check-references.sh` y `npm run check:refs`: comprueba que todos los
  archivos mencionados en el repositorio existen, incluidos los que declara el
  manifest de la PWA.
- `npm run verify`: referencias, type-check y tests de una sola pasada.
- 392 tests ejecutandose y pasando (antes 360).

### Corregido

- `package.json` tenia un script `gen:icons` apuntando a
  `scripts/generate-icons.ts`, **que no existia**. Y el manifest declaraba tres
  iconos que tampoco. La PWA no habria podido instalarse. Detectado con el
  barrido de referencias, no por los tests.
- El icono salia con las dos esquinas de arriba redondeadas y las de abajo
  cuadradas: la loma del green llegaba al borde y tapaba el redondeo. Arreglado
  con un recorte. Detectado mirando el PNG.
- En el icono maskable la loma quedaba flotando en el centro como un bloque con
  los lados rectos, porque se escalaba junto con la marca. Ahora la base sangra
  siempre al borde y solo la bandera se escala a la zona segura. Detectado
  mirando el PNG.
- **El test de solapes de rutas no detectaba un agujero real.** Comprobaba una
  lista de rutas escrita a mano, asi que una regla permisiva insertada antes de
  la de administracion pasaba desapercibida si su ruta no estaba en la lista.
  Sustituido por una tabla de muestras que tiene que cubrir todas las reglas, con
  un test que lo comprueba. Verificado insertando el agujero a proposito: ahora
  saltan dos tests independientes.

## [0.6.0] - 2026-09-17

### Anadido

- **Exportaciones a PDF, SVG y PNG (seccion 63), verificadas leyendo los PDF de
  vuelta con pdfjs-dist.** No se comprueba que el archivo exista: se comprueba
  que dentro dice lo que tiene que decir.
- PDF de clasificacion y PDF de tarjeta con pdf-lib: JavaScript puro, sin
  dependencias nativas ni navegador sin cabeza. Cabe en una funcion serverless y
  arranca al instante.
- Imagen de la clasificacion en SVG generado sin ninguna dependencia, en formato
  vertical 1080x1350 para que no lo recorte WhatsApp, con rasterizado opcional a
  PNG mediante sharp.
- `sanitizeForPdf`: saneado de texto obligatorio antes de dibujar. Las fuentes
  estandar de PDF usan WinAnsi y **lanzan excepcion** con emojis, flechas,
  "checks" y griego. Un pulgar arriba en una observacion escrita desde el movil
  habria dejado sin PDF a toda la clasificacion. Translitera lo frecuente,
  sustituye el resto y nunca lanza.
- Permisos de exportacion: la clasificacion completa solo se exporta publicada,
  **tambien para el administrador**. El provisional existe como tipo aparte y
  sale marcado como provisional dentro del propio documento, con un test que lo
  comprueba en el PDF generado.
- El PDF de la tarjeta tampoco imprime un bruto total si hay rayas u hoyos sin
  jugar. En papel importa mas: un PDF circula, se imprime y se compara.
- Politica de cache del service worker como modulo puro, con regla por omision
  cerrada: cualquier ruta de `/api/` no declarada como cacheable queda fuera.
- `public/sw.js` y `public/manifest.webmanifest`.
- Guardian de sincronia entre la politica del modulo y la duplicada en `sw.js`.
  Comprobado que funciona: se modifico un patron a proposito y el test fallo.
- docs/exports.md y docs/pwa.md.
- 358 tests ejecutandose y pasando (antes 299).

### Corregido

- Tres defectos de maquetacion de la imagen de clasificacion, detectados
  **mirando el PNG generado**, no por los tests: la barra de progreso caia sobre
  la linea del hándicap y parecia un subrayado; el alto fijo de 1350 px dejaba
  media imagen en blanco con pocos jugadores; y el plural de las rayas decia
  "1 rayas".
- El plural de las rayas tambien estaba mal en el PDF, y **el test lo daba por
  bueno**: comprobaba `/1 rayas/`, es decir, codificaba el propio error. Test
  corregido y anadida la comprobacion negativa.
- Anadido un test que mide la separacion vertical entre el texto del hándicap y
  la barra, para que el solape no pueda volver.

### Notas

- Las tarjetas NO se cachean en el navegador, ni la propia. Ya viven en IndexedDB
  con su cola; duplicarlas anadiria un sitio del que no se borran al cerrar
  sesion.
- El PNG se rasteriza con las fuentes del sistema, que en Vercel no son las de un
  portatil. El SVG es el formato canonico y el PDF el fiel.
- Falta generar los tres iconos de `public/icons/`.

## [0.5.0] - 2026-09-17

### Anadido

- **Capa de componentes de React, verificada renderizando de verdad.** React 19
  esta disponible en el entorno de generacion, asi que los componentes no se
  entregan a ciegas: se renderizan con `renderToStaticMarkup` y se comprueba el
  marcado resultante. 40 tests de render.
- Celdas de resultado bruto y de puntos Stableford donde **la forma es la que
  informa**: circulo bajo par, cuadrado sobre par, nada en el par. Etiqueta
  accesible completa en cada una.
- Tarjeta de juego como lista de hoyos, no como tabla encogida: cada fila lleva
  los seis datos que exige la seccion 11 y hay un test que comprueba que no se
  cuela ningun `<table>`.
- Panel de totales que NO publica un bruto total si hay una sola raya o falta un
  hoyo. Verificado en el marcado, no solo en la logica.
- Teclado de resultados con exactamente diez teclas (1-9 y raya), generado desde
  `PLAYER_KEYPAD`, con un test que comprueba que no aparece ni un 0 ni un 10.
- Hoja de confirmacion previa con los siete datos de la seccion 36, y casilla
  extra para resultados poco habituales que avisa sin bloquear.
- Insignia de estado de guardado con `role="status"` y `aria-live="polite"`.
- Clasificacion con revelacion progresiva que pregunta a `visibleGroupCount` en
  vez de decidir por su cuenta cuantas posiciones pintar.
- Estilos de todos los componentes anteriores en la capa de tokens.
- `tsconfig.test.json`: Next exige `jsx: preserve` y reescribe el archivo si se
  cambia, mientras el runner necesita el runtime automatico para renderizar en
  Node. De ahi los dos archivos.
- 299 tests ejecutandose y pasando (antes 259).

### Notas de verificacion

- Los componentes **renderizan y su marcado se comprueba**, pero NO se pueden
  type-checkear: `@types/react` no esta instalable sin red. El type-check
  estricto sigue cubriendo los 18 modulos de logica.
- Sigue faltando el envoltorio de Next.js (archivos de ruta del App Router,
  server actions, middleware), el service worker y la migracion inicial. Nada de
  eso se puede ejecutar aqui.

## [0.4.0] - 2026-09-17

### Cambiado

- **Politica de redondeo del hándicap de juego: ROUND_ONCE -> ROUND_TWICE.**
  Autorizada por el organizador tras ver la medicion del impacto. El pliego
  original pedia ROUND_ONCE en su seccion 28; ROUND_TWICE es la lectura literal
  del WHS y coincide con lo que calcula cualquier calculadora WHS y con el tablon
  del club. Difieren en 125 de 541 hándicaps exactos, siempre por un golpe, pero
  NO en los casos de referencia (20,7 da 25 con las dos; scratch da 1 con las
  dos; +2,4 da -2 con las dos). Cambiado en `DEFAULT_RULE_SET`, en el valor por
  defecto de `Competition.handicapRoundingPolicy` y en el seed. Hay un test que
  fija la decision para que no pueda cambiarse en silencio.

### Anadido

- Sorteo de partidos con semilla reproducible: guardando la semilla se puede
  volver a ejecutar el sorteo y sale exactamente lo mismo. Queda en la auditoria
  al confirmar.
- Distribuciones de la seccion 59 tal cual, y calculo general para cualquier otro
  numero de jugadores sin dejar partidos de uno.
- Asignacion de horas de salida con desplazamiento horario explicito, para no
  depender de la zona del servidor (Vercel corre en UTC, el torneo en Madrid).
- Validacion de partidos: duplicados, activos sin asignar, desactivados
  asignados, tamanos, horas repetidas y ordenes repetidos.
- Mover jugadores a mano entre partidos despues del sorteo, antes de confirmar.
- Maquina de estados de la revelacion progresiva: sin saltos, con pausa minima
  entre posiciones, y con bloqueo automatico si se corrige una tarjeta a mitad de
  la presentacion.
- `availableActions`: los botones del panel se calculan con la misma funcion que
  aplica las acciones, asi que la interfaz no puede desviarse de las reglas.
- 259 tests ejecutandose y pasando (antes 206).

### Corregido

- El hueco de la tabla EGA transcrita ya no debilita la verificacion. No se ha
  inventado la fila que falta: se comprueba que la formula cubre 0,0-54,0 en
  tramos contiguos, sin saltos, y que el hueco corresponde a un unico tramo con
  valor 54.

## [0.3.0] - 2026-09-17

### Anadido

- Logica de la pantalla de tarjeta: navegacion al siguiente hoyo pendiente con
  vuelta al final, resumen previo a confirmar, permisos de edicion por hoyo,
  estados de guardado con etiqueta accesible y reglas de finalizacion.
- Reglas de visibilidad: antes de publicar, un jugador ve su tarjeta y las de su
  propio partido; despues de publicar, todas en solo lectura.
- Revision entre companeros de partido, con caducidad automatica de la revision
  si la tarjeta cambia despues.
- Cola de operaciones sin conexion: clientMutationId, orden FIFO estricto,
  retroceso exponencial con techo, muerte tras agotar intentos.
- Aplicacion idempotente en servidor con concurrencia optimista POR HOYO.
  Reenviar un lote completo tras un corte de red no duplica nada.
- Deteccion de conflictos por hoyo, distinguiendo "otro dispositivo" de
  "correccion administrativa", y resolucion con motivo obligatorio.
- docs/offline-sync.md, docs/stableford-rules.md y docs/acceptance-tests.md.
- 206 tests ejecutandose y pasando (antes 128).

### Corregido

- La autorizacion de escritura se decidia en parte con `mutation.userId`, un campo
  que escribe el cliente. Ahora se decide solo con el actor autenticado de la
  sesion (seccion 66: no confiar en IDs del cliente). Anadidos tests de payload
  falseado.
- Una escritura del administrador sobre su PROPIA tarjeta se marcaba como
  correccion administrativa. Afecta a Gonzalo Villabaso, que es jugador y
  administrador a la vez: sus hoyos quedaban marcados como corregidos y no habria
  podido corregirse a si mismo mas tarde.

### Desviaciones documentadas

- Un cambio de hándicap o de reparto NO bloquea la escritura de un resultado
  bruto, en contra de la lectura literal de la seccion 43. Avisa al cliente para
  que recargue el reparto. Motivo: bloquear un bruto por un cambio de hándicap
  perderia el resultado del jugador sin necesidad, que es lo que prohibe la
  seccion 41. Razonamiento completo en docs/offline-sync.md, apartado 6.

## [0.2.0] - 2026-09-17

### Anadido

- Puerta de confirmacion de la valoracion del campo: no se puede confirmar sin
  haber revisado TODAS las diferencias frente a la configuracion anterior, y con
  la vuelta empezada exige motivo por escrito.
- Congelado de reglas de calculo con vista previa del impacto: antes de aplicar
  un cambio se muestra que jugador gana o pierde golpes y cuantos.
- Comprobacion de arranque del campeonato, con cada incidencia enlazada a su area
  del panel.
- Tabla completa de divergencia entre politicas de redondeo, generada por el
  motor (55 tramos, 125 hándicaps afectados).
- Busqueda de jugadores insensible a mayusculas, tildes y guiones, por nombre,
  apellido o fragmentos.
- Hash de contrasenas con registro versionado: scrypt implementado y probado,
  adaptador Argon2id listo para activarse cuando la dependencia este instalada.
- Sesiones en servidor: token opaco en la cookie, SHA-256 en base de datos,
  invalidacion de todas las sesiones al restablecer una contrasena.
- Limitacion de intentos de login por jugador y por IP.
- Lista de los 13 participantes sin ninguna contrasena en el repositorio, con
  colores pastel deterministas.
- Planificador de seed idempotente: nunca reescribe la contrasena de un usuario
  existente, no borra a nadie fuera de la lista y reporta divergencias.
- `prisma/sql/constraints.sql` con las restricciones CHECK que Prisma no puede
  expresar, incluida la que impide activar una valoracion sin confirmar.
- `package.json`, `tsconfig.json`, `next.config.mjs`, seed, guia de despliegue y
  documentacion de credenciales.
- 128 tests ejecutandose y pasando (antes 62).

### Cambiado

- Limite de intentos por IP subido de 20 a 30. Motivo: los 13 jugadores salen por
  el WiFi de la casa club con una sola IP. Con 20, dos errores de tecleo por
  persona bloqueaban a la peña entera antes de la primera salida.

### Desviaciones documentadas

- Hash con scrypt en lugar de Argon2id o bcrypt, por imposibilidad de instalar y
  verificar una dependencia nativa sin red. El formato de hash esta versionado y
  la migracion a Argon2id es transparente para los jugadores. Justificacion
  completa en la cabecera de `src/lib/auth/password.ts`.

## [0.1.0] - 2026-09-17

### Anadido

- Motor de hándicap con aritmetica entera exacta: hándicap de campo, hándicap de
  juego, dos politicas de redondeo y calculo auditable con todos los intermedios.
- Motor de reparto de golpes, incluidos hándicaps plus.
- Logica Stableford, categorias de resultado bruto, totales por vuelta y estados
  de tarjeta.
- Clasificacion con los tres criterios de desempate, posiciones compartidas,
  orden de revelacion y huella de snapshot.
- Datos del campo de Ulzama (amarillas caballeros) verificados contra tres
  fuentes independientes, con validacion en tiempo de ejecucion.
- Esquema Prisma completo para PostgreSQL/Neon.
- Capa de tokens de diseno (paleta pastel, liquid glass con fallback solido).
- 62 tests ejecutandose y pasando, incluida la verificacion de la formula de
  hándicap contra la Tabla de Equivalencias EGA oficial de Ulzama.
- Documentacion de trazabilidad de fuentes e investigacion de proveedores.

### Corregido

- `roundDiv` devolvia `-0` cuando la magnitud era cero y el signo negativo.
- El reparto de golpes para hándicaps plus devolvia `-0` por el mismo motivo.

### Pendiente

Ver `docs/build-plan.md`.
