# Sistema de diseño

Peñita Golf Championship · v1.4.0

Este documento describe el sistema visual que sustituye por completo al anterior.
Lo que se fue: Liquid Glass, superficies translúcidas, desenfoques de fondo,
gradientes y paleta pastel, sombras difusas y botones translúcidos.

---

## Actualizacion 1.4.0: clasificacion y administracion

Esta version completa el rediseño mobile-first en las dos areas que aun
conservaban patrones de escritorio.

### Clasificacion

- Las filas del leaderboard concentran posicion, identidad, HCP, HJ, golpes,
  puntos y barra en una composicion compacta.
- Los puntos se muestran dentro de un bloque de marcador, no como una cifra
  suelta que fuerce una segunda fila.
- El podio conserva oro, plata y bronce, pero utiliza la misma estructura base
  que el resto para evitar saltos de altura y lectura.
- El resumen superior utiliza chips compactos para modalidad y participantes.

### Administracion

- En movil, la navegacion interna utiliza un selector de seccion desplegable; no
  existe una fila horizontal de nueve pestanas.
- En escritorio, la misma informacion se presenta en una barra lateral fija.
- Las secciones administrativas comparten una cabecera, un area de acciones y un
  cuerpo con espaciado consistente.
- Tablas y formularios permanecen contenidos dentro de su columna y solo las
  tablas pueden desplazarse horizontalmente de forma local.

### Identidad y entrada de resultados

- La cabecera muestra el icono real de la aplicacion, generado a partir de
  `assets/logo.png`, en lugar del monograma textual `PGC`.
- Cuando un golpe seleccionado concede puntos Stableford, la tecla utiliza verde
  profundo, borde oro y una etiqueta breve con los puntos. El color acompaña a
  una etiqueta textual y no modifica el calculo.
- Los resultados guardados y el resumen de confirmacion repiten ese enfasis para
  que el jugador reconozca de inmediato un hoyo puntuable.

## Actualizacion 1.3.0: densidad y continuidad movil

La version 1.3.0 mantiene la identidad premium de la 1.2.0, pero reduce altura,
ruido y espacios muertos en las pantallas que se usan durante la vuelta.

- Cabecera fija de 58 px y dock inferior flotante, solido y compatible con safe
  areas.
- Contenido principal limitado a 680 px y entrada de hoyo a 640 px para mantener
  recorridos tactiles cortos.
- Heroe mas compacto, con puntos y hoyos completados como datos distintos.
- Teclado de 1 a 9 con celdas de 54-64 px segun el dispositivo.
- Hojas inferiores reales para confirmar y borrar, en lugar de bloques insertados
  en el flujo de la pagina.
- Scorecard de ida/vuelta construido por filas independientes, con etiqueta y
  total fijos dentro de su propio desplazamiento horizontal.
- Al guardar, la experiencia continua en el hoyo siguiente; la interfaz no obliga
  a regresar al resumen entre golpes.

## 1. Dirección visual

La aplicación se usa **de pie, con una mano, al sol, con guante fino y con
prisa**, en un valle donde la cobertura va y viene. Esa frase decide todo lo
demás.

El resultado tiene que sentirse como una app oficial de campeonato: premium,
golfística, editorial, sobria, orientada a competición. Inspiración conceptual en
los sistemas de live scoring y en los gráficos de retransmisión deportiva; cero
copia de logos, marcas, paletas o tipografías de nadie. La identidad es propia.

**Reglas que gobiernan el sistema entero:**

1. El color **nunca** es el único portador de información. Siempre hay forma,
   número, icono o etiqueta accesible.
2. Toda superficie es **opaca**. No hay fallback translúcido que mantener porque
   no hay nada translúcido que pueda fallar.
3. Números **tabulares** en todo lo que se compara: resultados, hándicaps,
   puntos, totales y horas.
4. Ningún texto de cuerpo por debajo de 16 px.
5. Áreas táctiles de **48 px**, no de 44.

Un gradiente oscuro sobre una imagen para garantizar contraste **sí** está
permitido: cumple una función de legibilidad. Un gradiente decorativo, no.

---

## 2. Paleta

Definida en `src/styles/tokens.css`.

### Superficies

| Token | Valor | Uso |
| --- | --- | --- |
| `--background` | `#F4F1E8` | Fondo marfil de la aplicación |
| `--surface` | `#FFFFFF` | Tarjetas, formularios, teclado |
| `--surface-subtle` | `#ECE9E0` | Chips, etiquetas de fila, resúmenes |
| `--surface-sunken` | `#E4E0D5` | Columna de totales, barras de fondo |

### Verde golf

| Token | Valor | Uso |
| --- | --- | --- |
| `--golf-green-950` | `#071E16` | Estado pulsado, cabeceras de rejilla |
| `--golf-green-900` | `#0B2B1E` | Color de la app: cabecera, botón principal, héroe |
| `--golf-green-800` | `#123D2B` | Bordes sobre verde, 4 puntos Stableford |
| `--golf-green-700` | `#1B563B` | Foco, enlaces, birdie |
| `--golf-green-600` | `#24704D` | 3 puntos Stableford |

### Texto y bordes

`--text-primary` `#141916` · `--text-secondary` `#626A65` · `--text-tertiary`
`#8B938D` · `--text-inverse` `#FFFFFF` · `--text-on-green` `#EEF2EA` ·
`--border` `#D4D6D0` · `--border-strong` `#AEB4AE`

### Oro: acento premium

`--gold` `#B6924A` · `--gold-light` `#D3B56E` · `--gold-dark` `#8C6F33`

**De uso contado.** Marca el campeón, el resultado respecto al par y la etiqueta
de hándicap limitado. Si el oro aparece en cada botón deja de significar nada.

### Funcionales

`--success` `#287A4A` · `--warning` `#C47B1C` · `--danger` `#B42318` ·
`--info` `#24547A`, cada uno con su superficie clara asociada.

### Marca de la Peñita

`--color-brand` `#364F6E` (navy) y `--color-brand-ink` `#F4EDDE` (crema),
medidos sobre `assets/logo.png`.

**No son colores de la interfaz.** Son el icono de la aplicación, la barra de
estado y la pantalla de bienvenida, para que abrir la app desde el móvil no
parezca otra aplicación distinta. Hay dos tests que comprueban que no se
desincronizan de `public/manifest.webmanifest` ni de `scripts/generate-icons.ts`.
Si se cambian aquí, hay que cambiarlos en los tres sitios.

---

## 3. Tipografía

**Dos familias y ninguna más**, cargadas con `next/font` en `src/app/layout.tsx`
y expuestas como variables CSS.

| Variable | Familia | Uso |
| --- | --- | --- |
| `--font-display` | Fraunces 600/700 | Titulares del campeonato y cifras grandes |
| `--font-sans` | Inter | Interfaz y datos |

`next/font` las descarga en tiempo de compilación y las sirve desde el propio
dominio: no hay petición a Google en tiempo de ejecución ni salto de maquetación
al cargar. Los `fallback` están escritos a mano a propósito: si la fuente no
llega, la aplicación tiene que seguir siendo legible en el hoyo 14.

### Escala

| Token | Tamaño | Uso |
| --- | --- | --- |
| `--text-caption` | 11 px | Solo etiquetas en versalitas |
| `--text-label` | 12 px | Metadatos de fila |
| `--text-sm` | 14 px | Texto secundario |
| `--text-base` | 16 px | Cuerpo. Mínimo absoluto |
| `--text-lg` | 18 px | H2, resultados brutos |
| `--text-xl` | 22 px | H1 de sección, posición |
| `--text-2xl` | 28 px | Título del campo |
| `--text-3xl` | 36 px | Display |
| `--text-4xl` | 48 px | Número de hoyo |

### Escala de datos

Aparte de la de texto, porque **un total no se lee, se reconoce de un vistazo**.

`--data-compact` 16 px · `--data-base` 20 px · `--data-large` 32 px ·
`--data-hero` 52 px

Clases: `.display`, `.eyebrow`, `.label`, `.data`, `.data--large`,
`.data--hero`.

---

## 4. Espaciado, radios y sombras

Espaciado en múltiplos de 4: `--space-1` a `--space-7` (4, 8, 12, 16, 24, 32,
48 px).

Radios: `--radius-xs` 4 · `--radius-sm` 8 · `--radius-md` 12 · `--radius-lg` 18
· `--radius-xl` 24 · `--radius-pill`.

Sombras muy contenidas y con tinte verde, no grises difusas: `--shadow-xs` a
`--shadow-lg`. **La jerarquía la sostienen el borde y el color, no la sombra.**

---

## 5. Botones

| Variante | Aspecto | Cuándo |
| --- | --- | --- |
| `.button--primary` | Verde golf profundo, texto blanco | La acción de la pantalla. Una sola |
| `.button--secondary` | Blanco, borde, texto oscuro | Acción alternativa |
| `.button--ghost` | Transparente con borde claro | Solo sobre superficie verde |
| `.button--premium` | Oro | Uso contado |
| `.button--danger` | Rojo profundo | Destructivo. **Siempre** con confirmación |

Altura base 48 px, `--lg` 58 px para la acción principal de Mi tarjeta.

**El estado deshabilitado es visible, no una opacidad.** Un botón al 50 % de
opacidad sigue pareciendo pulsable al sol; el deshabilitado cambia a superficie
gris con texto terciario.

Para componentes de cliente que necesitan `onClick`, `buttonClass()` en
`src/components/ui/index.tsx` devuelve las clases. Para navegación, `ButtonLink`
renderiza un `<a>` de verdad: una navegación tiene que poder abrirse en otra
pestaña y funcionar aunque el JavaScript no haya cargado.

---

## 6. Formularios

- Una columna en móvil.
- **Etiqueta visible siempre, nunca un placeholder** como única pista: un
  placeholder desaparece al escribir y con él desaparece lo que se estaba
  rellenando.
- Campos sólidos con borde claro. Un input translúcido sobre una foto es
  ilegible al sol.
- Texto de ayuda debajo del campo.
- **El error va junto al campo**, no en una cabecera al final del formulario, y
  el campo pasa a borde rojo de 2 px.
- Resumen de cambios antes de guardar cuando la acción afecta a cálculos.

Componente: `FormField`. Variante `numeric` para hándicaps y límites, con
números tabulares y tamaño mayor.

---

## 7. Scorecard

### Lista hoyo a hoyo (`ScorecardList`)

Una fila por hoyo con los seis datos obligatorios: número, par, stroke index,
distancia, golpes recibidos, bruto y puntos. Es la vista de navegación: cada fila
enlaza con su hoyo.

### Rejilla completa (`ScorecardGrid`)

Filas PAR / SI / METROS / GOLPES / BRUTO / PUNTOS con columna de totales, y
control segmentado **Ida / Vuelta / Total**.

**Es una rejilla CSS, no una `<table>`.** A 320 px una tabla de 18 columnas es
ilegible, y encogerla deja números de 9 px. La rejilla permite fijar la columna
de etiquetas mientras solo se desplaza la zona de hoyos, y ese desplazamiento se
queda **dentro** del bloque: la página nunca tiene scroll horizontal.

Lo que no se pierde por no ser una tabla es la semántica: el marcado lleva
`role="table"`, `role="row"`, `role="columnheader"`, `role="rowheader"` y
`role="cell"` con sus etiquetas, así que un lector de pantalla lo recorre como la
tabla que conceptualmente es.

### Formas del resultado bruto

**La forma informa, el color acompaña.** Un daltónico distingue círculo de
cuadrado.

| Resultado | Forma | Clase |
| --- | --- | --- |
| Bajo par (birdie) | Círculo | `.score-number--birdie` |
| Eagle o mejor | Círculo doble | `.score-number--eagle`, `--albatros`, `--hole-in-one` |
| Par | Sin forma | `.score-number--par` |
| Bogey | Cuadrado | `.score-number--bogey` |
| Doble bogey | Cuadrado doble | `.score-number--double` |
| Triple o peor | Triple contorno | `.score-number--triple` |
| Raya | Guion en rojo | `.score-number--pickup` |

Los contornos se dibujan con `box-shadow` concéntrico: no deforman el número ni
cambian el área táctil. El significado **no ha cambiado** respecto a la versión
anterior; solo el color y el grosor.

### Puntos Stableford

Escala de intensidad, no arcoíris: cuanto mejor el resultado neto, más profundo
el fondo. La raya se distingue del 0 por una barra roja, no solo por el color. Un
hoyo sin jugar no muestra un 0: muestra un hueco, porque es un hueco.

---

## 8. Entrada de resultados

Tres bloques y nada más en pantalla:

1. **Cabecera del hoyo**: el número manda (48 px sobre verde), y a su lado par,
   stroke index, metros y golpes recibidos como chips.
2. **Fila del jugador**: nombre, hándicap de juego, golpes recibidos en ese hoyo,
   resultado guardado y estado.
3. **Teclado**: 3 × 3 para 1-9, y una fila de acciones separada por una línea con
   raya y, cuando el hoyo ya tiene resultado, **Borrar resultado**.

La separación de la fila de acciones no es estética: sin ella, buscar el 9 con el
pulgar y darle a "borrar" es cuestión de tiempo.

El teclado tiene **exactamente** 1-9 y raya. La lista sale de `PLAYER_KEYPAD`, en
el dominio y con su test, así que la interfaz no puede añadir teclas por su
cuenta. No hay `10+`: el conjunto de valores permitidos es una regla deportiva.

El botón de borrar **solo aparece si se pasa `onClear`**, así el teclado sigue
siendo el de siempre —diez teclas— en un hoyo todavía sin apuntar.

### Resumen antes de confirmar

Superficie sólida, tamaño de hoja inferior, nunca un modal diminuto: en móvil un
diálogo pequeño obliga a leer siete cifras en un área donde no caben. Muestra
hoyo, par, SI, distancia, golpes recibidos, brutos, neto y puntos, con acciones
"Volver" y "Confirmar resultado".

---

## 9. Estados

Todos con **icono y texto**, nunca solo color.

| Estado | Clase | Color |
| --- | --- | --- |
| Sincronizado | `.save-status--synced` | Verde |
| Guardando | `.save-status--saving` | Azul |
| Sin conexión | `.save-status--offline` | Ámbar |
| Pendiente | `.save-status--pending` | Arena |
| Error | `.save-status--error` | Rojo |

El indicador es visible pero pequeño: durante la vuelta no puede robar la
pantalla al hoyo que el jugador está apuntando.

### Vacío y error

`StateBlock` comparte forma para los dos: título, explicación y **como máximo una
acción**. La regla es que **no se inventan acciones que no existen**: un
"Reintentar" que no reintenta nada es peor que no poner nada.

### Zona de acciones críticas

`.critical-zone`: banda roja de 5 px a la izquierda, superficie propia y separada
del flujo normal por 32 px. El botón de vaciar todos los resultados no puede
estar a la misma altura ni en la misma superficie que el de bloquear una tarjeta.

---

## 10. Navegación

**Cabecera** sólida y verde: nombre corto del campeonato arriba en pequeño,
pantalla actual debajo en grande, acción secundaria a la derecha. Ese orden
importa: al mirar el móvil en mitad de una vuelta lo que hace falta saber es
dónde estás, no en qué aplicación estás.

**Barra inferior** sólida, blanca, con borde superior discreto, icono y texto, y
respetando el área segura. La sección activa se marca con color **y** con una
barra superior. Sin efecto glass: una barra translúcida sobre una tarjeta de
resultados deja los números a medio leer justo cuando hace falta leerlos.

---

## 11. Uso de imágenes

**No hay fotografía del campo, y es una decisión, no un olvido.** El repositorio
no incluye ninguna imagen de Ulzama con los derechos comprobados, y bajar una de
internet no es una opción.

La cabecera es gráfica: verde profundo, curvas de nivel dibujadas en SVG inline y
tipografía editorial.

**Para añadir una foto autorizada más adelante:**

1. Colócala en `public/` y optimízala.
2. Pasa su ruta a `TournamentHero` en `photoUrl`.
3. El componente ya pinta el gradiente oscuro (`.hero__scrim`) que garantiza el
   contraste del texto encima.
4. Comprueba que el texto no cae sobre zonas ilegibles y sustituye el `<img>` por
   `next/image` con `fill` y `sizes`.

La iconografía es propia: SVG dibujado en `src/components/ui/icons.tsx`, trazo de
1,75 px, esquinas redondeadas y `currentColor`, así que hereda el color del
contexto. Todos son **decorativos** (`aria-hidden`): el significado lo lleva el
texto que los acompaña. Un icono no se lee en voz alta.

---

## 12. Animaciones

Breves y deportivas: aparición de tarjetas (`.rise`), transición entre hoyos,
confirmación de resultado, revelación de clasificación (`.reveal-card`).

Prohibido: confeti, rebotes exagerados, flashes, blur general, efectos líquidos y
animaciones decorativas continuas.

`prefers-reduced-motion` se respeta en toda la hoja. Y la regla dura: **una
animación no puede calcular datos, guardarlos, cambiar posiciones, decidir
estados ni ocultar información crítica.**

---

## 13. Patrones móviles y accesibilidad

Comprobar cada pantalla a 320, 360, 375, 390, 412 y 430 px, más tablet y
escritorio. En escritorio el contenedor se ensancha a 720 px pero **no se
convierte en otra aplicación**: la tarjeta sigue siendo la de mano.

- Sin scroll horizontal general. Solo dentro de la rejilla de scorecard y de la
  barra de navegación de administración.
- Áreas táctiles de 48 px, 44 px como mínimo absoluto.
- Foco visible con contorno de 3 px, en oro sobre superficie verde porque el
  verde sobre verde no se ve.
- Estados no dependientes del color.
- Números tabulares.
- Etiquetas accesibles completas en cada celda de resultado.
- Zoom **no** bloqueado: es una barrera de accesibilidad, y esta app se usa al sol
  con los ojos cansados.

---

## 14. Componentes

| Componente | Archivo |
| --- | --- |
| `AppHeader` | `src/components/ui/app-header.tsx` |
| `BottomNav` | `src/components/client/bottom-nav.tsx` |
| `TournamentHero`, `MiniNine` | `src/components/ui/tournament-hero.tsx` |
| `ButtonLink`, `buttonClass` | `src/components/ui/index.tsx` |
| `StatusBadge`, `CardStatusBadge` | `src/components/ui/index.tsx` |
| `DataChip`, `StatTile`, `ProgressBar` | `src/components/ui/index.tsx` |
| `Alert`, `StateBlock`, `OfflineBanner` | `src/components/ui/index.tsx` |
| `FormField`, `AdminSection` | `src/components/ui/index.tsx` |
| Iconos | `src/components/ui/icons.tsx` |
| `ScoreNumber`, `PointsCell`, `StrokesReceivedDots` | `src/components/score.tsx` |
| `HoleRow`, `NineSummary`, `TotalsPanel`, `ScorecardList` | `src/components/scorecard.tsx` |
| `ScorecardGrid` | `src/components/scorecard-grid.tsx` |
| `Keypad`, `ConfirmationSheet` | `src/components/keypad.tsx` |
| `HoleEditor` | `src/components/client/hole-editor.tsx` |
| `Leaderboard`, `LeaderboardCard`, `SaveStatusBadge` | `src/components/leaderboard.tsx` |
| `HandicapCapPanel` | `src/components/client/handicap-cap-panel.tsx` |
| `ResetScoresPanel` | `src/components/client/reset-scores-panel.tsx` |
| `AdminNav` | `src/components/client/admin-nav.tsx` |

**Evitar componentes duplicados con estilos distintos para la misma función.** Si
una pantalla necesita un botón verde, usa `buttonClass('primary')`; en cuanto hay
dos botones verdes escritos a mano acaban teniendo alturas distintas.
