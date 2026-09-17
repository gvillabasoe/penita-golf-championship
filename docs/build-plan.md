# Plan de construcción y estado real

Este documento dice, sin adornos, qué está hecho y qué no.

## Por qué hay etapas

El pliego pide una aplicación completa, funcional, con persistencia real,
autenticación, PWA, sincronización offline, resolución de conflictos, panel de
administración, revelación progresiva, exportaciones, pruebas y documentación. Son
unas 15.000–20.000 líneas de código de producción.

Dos límites reales condicionan la entrega:

1. **El entorno donde se ha generado esto no tiene red.** No se puede ejecutar
   `npm install`, ni `prisma generate`, ni `next build`, ni arrancar la app. Todo
   lo que dependa de un paquete instalado **no se puede verificar aquí**.
2. Escribir 18.000 líneas de una sola vez sin poder compilarlas ni ejecutarlas
   produciría algo que parece completo y no arranca. Eso es exactamente lo que el
   pliego prohíbe en su sección 1.

Por eso la etapa 1 se ha concentrado en lo que **sí se puede verificar sin red**:
la aritmética deportiva, los datos del campo y el modelo de datos. Son también las
partes donde un error es más caro, porque decidirían una clasificación en silencio.

## Etapa 1 — Completada y verificada

| Entregable | Estado |
|---|---|
| Datos del campo verificados contra 3 fuentes | ✅ |
| Investigación de la valoración vigente (secciones 19–21) | ✅ |
| Motor de hándicap con aritmética entera exacta | ✅ verificado contra tabla EGA oficial |
| Reparto de golpes, incluidos plus | ✅ invariante comprobada |
| Lógica Stableford y resultado bruto | ✅ |
| Totales, estados de tarjeta y reglas de finalización | ✅ |
| Clasificación, desempates, posiciones compartidas, orden de revelación | ✅ |
| Validación de datos del campo | ✅ |
| Esquema Prisma completo | ✅ escrito, ⚠️ `prisma validate` no ejecutado (sin red) |
| Tokens de diseño | ✅ |
| Documentación de trazabilidad y proveedores | ✅ |
| **62 tests ejecutados, 62 pasando** | ✅ |
| Type-check estricto de los 7 módulos del motor | ✅ 0 errores |

Dos fallos reales encontrados y corregidos en esta etapa (ambos `-0` filtrándose
al modelo de datos). Ver CHANGELOG.

## Etapa 2 — Base de la aplicación (núcleo completado)

| Entregable | Estado |
|---|---|
| Puerta de confirmación de la valoración, con revisión obligatoria de diferencias | ✅ verificado |
| Congelado de reglas y cálculo de impacto antes de aplicar un cambio | ✅ verificado |
| Comprobación de arranque del campeonato, con incidencias por área | ✅ verificado |
| Tabla completa de divergencia de redondeo, generada por el motor | ✅ |
| Búsqueda de jugadores insensible a tildes, mayúsculas y guiones | ✅ verificado |
| Hash de contraseñas con registro versionado (scrypt + adaptador Argon2id) | ✅ verificado |
| Sesiones en servidor, invalidación por epoch, cookies, cierre real | ✅ verificado |
| Limitación de intentos de login por jugador y por IP | ✅ verificado |
| Lista de los 13 jugadores sin ninguna contraseña en el repositorio | ✅ verificado |
| Planificador de seed idempotente | ✅ verificado |
| `package.json`, `tsconfig.json`, `next.config.mjs` | ✅ escritos |
| Script de seed conectado a Prisma | ✅ escrito, ⚠️ no ejecutado (sin base de datos) |
| Restricciones CHECK que Prisma no puede expresar | ✅ escritas, ⚠️ no ejecutadas |
| **128 tests ejecutados, 128 pasando** | ✅ |

### Lo que queda de la etapa 2 y necesita red o base de datos

- `npm install` y generación del cliente de Prisma.
- Migración inicial (`prisma migrate dev`). **No la he escrito a mano a
  propósito:** una migración sin validar en el repositorio es un archivo que se
  aplica solo y que nadie ha comprobado.
- Aplicar `prisma/sql/constraints.sql` contra una rama de desarrollo de Neon.
- Rutas, componentes y layout de Next.js: pantalla de login, shell con barra
  inferior, middleware de autorización. La lógica que hay detrás ya está escrita
  y probada; falta la capa de React, que sin `next build` no puedo verificar.

## Etapa 3 — Tarjeta y juego (lógica completada)

| Entregable | Estado |
|---|---|
| Navegación por hoyos, siguiente pendiente con vuelta al final | ✅ verificado |
| Resumen previo a confirmar, con todo lo que exige la sección 36 | ✅ verificado |
| Permisos de edición por hoyo, incluida la corrección administrativa | ✅ verificado |
| Estados de guardado con etiqueta accesible | ✅ verificado |
| Reglas de finalización: no con hoyos vacíos, la raya sí cuenta | ✅ verificado |
| Visibilidad de tarjetas: propia, del partido, tras publicar | ✅ verificado |
| Revisión entre compañeros y caducidad de la revisión | ✅ verificado |
| Puntos provisionales visibles solo al administrador | ✅ verificado |

Falta la capa de React: pantalla de tarjeta, teclado, vista de partido. Requiere
`next build`.

## Etapa 4 — Offline y sincronización (lógica completada)

| Entregable | Estado |
|---|---|
| Cola de operaciones con `clientMutationId` y orden FIFO | ✅ verificado |
| Retroceso exponencial con techo y muerte tras agotar intentos | ✅ verificado |
| Aplicación idempotente en servidor: reenviar nunca duplica | ✅ verificado |
| Concurrencia optimista **por hoyo**, no por tarjeta | ✅ verificado |
| Detección de conflictos: otro dispositivo o corrección administrativa | ✅ verificado |
| Resolución de conflictos con motivo obligatorio | ✅ verificado |
| Cierre de sesión sin mezclar usuarios ni borrar sin avisar | ✅ verificado |
| Documentación de diseño (`docs/offline-sync.md`) | ✅ |

Falta el service worker, el manifest, los iconos y el envoltorio real de
IndexedDB. La lógica que van a usar ya está probada.

## Etapa 5 — Administración (lógica completada)

| Entregable | Estado |
|---|---|
| Distribuciones de la sección 59, y cálculo general fuera de ese rango | ✅ verificado |
| Sorteo en servidor con semilla reproducible | ✅ verificado |
| Asignación de horas de salida independiente de la zona del servidor | ✅ verificado |
| Validación de partidos: duplicados, sin asignar, tamaños, horas | ✅ verificado |
| Mover jugadores a mano después del sorteo | ✅ verificado |
| Confirmación con auditoría, incluida la semilla del sorteo | ✅ verificado |
| Confirmación de fuentes y congelado de reglas (etapa 2) | ✅ verificado |

Falta el panel en React y el historial de auditoría en pantalla.

## Etapa 6 — Revelación (lógica completada)

| Entregable | Estado |
|---|---|
| Máquina de estados `HIDDEN` / `REVEALING` / `PUBLISHED` | ✅ verificado |
| Huella del snapshot: corregir una tarjeta a mitad bloquea la presentación | ✅ verificado |
| Sin saltos: pausa mínima obligatoria entre posiciones | ✅ verificado |
| Pausar, reanudar, retroceder y reiniciar solo afectan a lo visual | ✅ verificado |
| No se publica sin revelar todas las posiciones | ✅ verificado |
| El jugador solo ve lo revelado; el admin ve el provisional | ✅ verificado |
| Los botones del panel se calculan con la misma función que aplica las acciones | ✅ verificado |
| Orden de revelación y podio (etapa 1) | ✅ verificado |

Falta la animación, el podio en pantalla y las exportaciones a PDF e imagen.

## Componentes de interfaz (verificados renderizando)

React 19 está disponible en el entorno de generación, así que esta capa **no** se
ha entregado a ciegas: los componentes se renderizan con `renderToStaticMarkup` y
se comprueba el marcado.

| Entregable | Estado |
|---|---|
| Celdas de resultado bruto y puntos, con la forma como portadora de información | ✅ verificado |
| Fila de hoyo con los seis datos de la sección 11 | ✅ verificado |
| Tarjeta como lista, sin tabla de escritorio | ✅ verificado |
| Totales que no publican un bruto falso con rayas | ✅ verificado |
| Teclado de exactamente 1–9 y raya | ✅ verificado |
| Hoja de confirmación previa con los siete datos de la sección 36 | ✅ verificado |
| Insignia de estado de guardado con `aria-live` | ✅ verificado |
| Clasificación con revelación progresiva sin filtrar al ganador | ✅ verificado |
| Estilos de todo lo anterior en la capa de tokens | ✅ |

Limitación honesta: los `.tsx` **renderizan** pero no se **type-checkean**.
`@types/react` no es instalable sin red. El type-check estricto sigue cubriendo
los 18 módulos de lógica.

## Exportaciones y PWA (verificadas)

| Entregable | Estado |
|---|---|
| PDF de clasificación con pdf-lib, sin dependencias nativas | ✅ verificado leyendo el PDF de vuelta |
| PDF de tarjeta hoyo a hoyo, sin bruto falso con rayas | ✅ verificado |
| Imagen SVG sin dependencias, formato vertical para WhatsApp | ✅ verificado |
| Rasterizado a PNG con sharp | ✅ verificado (firma y dimensiones reales) |
| Saneado WinAnsi: un emoji no tumba la exportación | ✅ verificado |
| Permisos: la clasificación completa solo publicada | ✅ verificado |
| Marca de provisional dentro del documento | ✅ verificado en el PDF generado |
| Política de caché del service worker, regla cerrada por omisión | ✅ verificado |
| `public/sw.js` y `manifest.webmanifest` | ✅ escritos |
| Guardián de sincronía entre la política y `sw.js` | ✅ verificado rompiéndolo a propósito |

## Autorización de rutas e iconos (verificados)

| Entregable | Estado |
|---|---|
| Manifiesto de rutas con denegar por omisión | ✅ verificado |
| 404 en vez de 403 para rutas de admin | ✅ verificado |
| 401 en API, redirección en páginas | ✅ verificado |
| Tabla de muestras que cubre todas las reglas | ✅ verificado insertando un agujero |
| Guardián a futuro contra `src/app` | ✅ escrito, se activa solo |
| Tres iconos de la PWA desde un solo SVG | ✅ verificados por píxeles |
| Zona de seguridad del maskable | ✅ cero píxeles recortados |
| Barrido de referencias rotas | ✅ `npm run check:refs` |

## Etapa 7 — Cierre

Lo único que queda:

- **Archivos de ruta de Next.js**: `page.tsx` y `route.ts` del App Router, server
  actions y el middleware que llame a `authorizeRequest`. La decisión de
  autorización ya está escrita y probada; falta el envoltorio. Requiere
  `next build`.
- **Envoltorio de IndexedDB** sobre la cola ya probada. Requiere navegador.
- **Registro del service worker** desde el layout.
- **Migración inicial de Prisma** y aplicación de `constraints.sql`. Requiere
  base de datos.

## Decisiones

| Decisión | Estado |
|---|---|
| Política de redondeo del hándicap de juego | ✅ **`ROUND_TWICE`**, autorizada el 17/09/2026 |
| Valoración del campo 72,6 / 139 | ⏳ cargada, pendiente de confirmar en el panel |
| Fecha de vigencia de la valoración | ⏳ pedir la ficha al club |
| Tercer criterio de desempate | ⏳ implementado como pide el pliego, con aviso |

Sobre el tercer criterio: comparar sumas de golpes numéricos entre tarjetas con
distinto número de rayas favorece a quien levantó la bola, porque tiene menos
golpes que sumar. Está implementado tal como pide la sección 46, y el panel avisa
cuando el desempate se resuelve así entre jugadores con rayas distintas. No lo he
cambiado porque un criterio de desempate pesa más que un redondeo y solo aparece
en un empate triple exacto; si quieres otro, hay que decidirlo antes de jugar.
