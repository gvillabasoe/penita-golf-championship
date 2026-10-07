# Sistema de diseño "Escudo"

Peñita Golf Championship · v2.0.0

Sustituye por completo al sistema de la 1.2–1.5 (crema, Fraunces, verde golf y
oro). Archivos: `src/styles/tokens.css` (solo variables) y `src/app/globals.css`
(todo lo que pinta, en una sola capa).

---

## 1. Por qué se cambió

El sistema anterior cumplía casi punto por punto la lista de rasgos de una
interfaz generada por defecto: fondo crema con serif de display, etiquetas en
versalitas espaciadas sobre cada bloque, metadatos unidos con punto medio
("18 hoyos · Par 72") y el contenido troceado en tarjetas idénticas con la misma
sombra. Además, la hoja había crecido apilando tres rediseños (3.900 líneas con
reglas que se anulaban entre sí).

Este sistema parte de una pregunta distinta: qué colores, formas y objetos
pertenecen a **este** campeonato y a ningún otro.

## 2. De dónde sale cada decisión

| Decisión | Origen |
| --- | --- |
| Marino `#243C57` y marfil | El escudo de la Peñita (`assets/logo.png`) |
| Amarillo `#F2C230` | Las barras desde las que se juega esta edición |
| Rojo para bajo par | Convención de los leaderboards de golf |
| Verde calle | Puntos ganados y guardado correcto |
| Portatarjetas con cartulina | El objeto real: la tarjeta de juego en su funda |
| Archivo Narrow para cifras | Nueve hoyos y etiquetas caben en 320 px |

## 3. Color

| Token | Valor | Uso |
| --- | --- | --- |
| `--navy-700` | `#243C57` | Tapa del héroe, número de hoyo, placas de puntos |
| `--navy-500` | `#364F6E` | Cabecera; es el `theme-color` de la barra de estado |
| `--page` | `#EEF1F5` | Fondo. Porcelana fría: al sol el crema amarillea |
| `--surface` | `#FFFFFF` | Secciones, cartulina, teclado |
| `--ink` | `#121C27` | Texto |
| `--tee` | `#F2C230` | **"Estás aquí"**. Solo eso |
| `--fairway` | `#1F7A4D` | Puntos ganados, guardado |
| `--birdie` | `#C8322C` | Bajo par y acciones destructivas |
| `--ivory` | `#F3EBDD` | Texto sobre marino. Nunca fondo de página |

### La regla del amarillo

El amarillo tee significa **"estás aquí"** y nada más:

- el hoyo en juego en la cartulina y en la lista hoyo a hoyo;
- la pestaña activa del dock y la sección activa del panel;
- tu fila en Ver partido;
- la posición recién revelada en la clasificación.

Si aparece en cualquier otro sitio deja de significar algo. Por eso el oro del
podio **no** es amarillo plano: se pinta como metal, con brillo radial
(`--medal-gold`), y se lee como medalla.

### Marca

`--color-brand` (`#364f6e`) y `--color-brand-ink` (`#f4edde`) siguen fijados por
dos tests contra el manifest y `scripts/generate-icons.ts`. La cabecera arranca
en ese mismo marino para que, abierta desde la pantalla de inicio, barra de
estado y cabecera sean una sola pieza.

## 4. Tipografía

Una familia, dos anchos, cargados con `next/font` en `src/app/layout.tsx`:

| Variable | Familia | Uso |
| --- | --- | --- |
| `--font-sans` | Archivo 400–800 | Interfaz, texto, títulos |
| `--font-narrow` | Archivo Narrow 500–700 | Cifras, tarjeta, clasificación |

- Números tabulares en todo lo que se compara.
- El tracking depende del tamaño: negativo en cifras y titulares grandes
  (`-0.02em` a `-0.04em`), neutro en el cuerpo.
- **Sin versalitas en etiquetas.** Las etiquetas van en frase normal. La única
  excepción conceptual sería la propia tarjeta de golf, y ni ahí hace falta.
- Ningún cuerpo ni input por debajo de 16 px: en iOS, un input de menos amplía la
  página y no la devuelve.

## 5. Luz y elevación

Una sola fuente de luz, cenital.

- `--rim`: filo blanco interior arriba, la luz que toca el borde.
- `--elev-1/2/3`: sombra en dos capas (contacto corta + ambiente larga), teñida de
  marino. Una sombra gris neutra sobre porcelana se ve sucia.
- `--sheen`: brillo de arriba abajo sobre las superficies marino.

**La elevación se reserva para lo que flota**: la tarjeta héroe, el dock y las
hojas inferiores. Las secciones van planas con filete. Si todo tiene sombra, nada
está por encima de nada.

## 6. Radios

Los radios marcan jerarquía; no hay uno para todo.

| Token | Valor | Uso |
| --- | --- | --- |
| `--r-hero` | 26 px | Tarjeta héroe, cabecera del hoyo |
| `--r-section` | 20 px | Secciones, tablero, hojas |
| `--r-key` | 16 px | Teclas |
| `--r-row` | 14 px | Filas, botones, campos |
| `--r-chip` | 10 px | Chips |

## 7. Piezas

### Tarjeta héroe

Portatarjetas marino con la cartulina impresa dentro. En la tapa, el campo, la
fecha y los puntos. En la cartulina, los 18 hoyos con los golpes escritos y las
formas de siempre: círculo rojo bajo par, cuadrado pizarra sobre par, guion rojo
para la raya. El hoyo en juego, en amarillo tee. Es el único sitio donde se gasta
la audacia visual.

### Formas del resultado

La **forma** informa; el color acompaña. Un daltónico distingue círculo de
cuadrado.

| Resultado | Forma |
| --- | --- |
| Birdie | Círculo rojo |
| Eagle o albatros | Doble círculo rojo |
| Hoyo en uno | Círculo rojo lleno |
| Par | Sin forma |
| Bogey | Cuadrado |
| Doble bogey | Doble cuadrado |
| Triple o peor | Triple cuadrado |
| Raya | Guion rojo |

### Puntos Stableford

Escala de intensidad: 0 hundido, 1 claro, 2 marino suave, 3 verde, 4 verde
profundo, 5 medalla de oro. La raya tacha la casilla con una barra roja.

### Clasificación

Un solo tablero con filas separadas por filete, como un leaderboard de campo. Los
tres primeros llevan la posición en una medalla de metal y una banda los separa
del resto. Los puntos van en una placa marino, la cifra de más jerarquía de la
fila.

### Teclado

Teclas con relieve (luz arriba, sombra de contacto abajo) que se hunden al pulsar.
Selección en marino lleno; si da puntos, en verde con los puntos que producirá.
Raya y borrar en una fila aparte, separada por una línea discontinua.

### Dock

Flota sobre el contenido. Material marino al 92 % con desenfoque: el contenido se
intuye debajo, lo que da profundidad, pero el texto se sigue leyendo al sol. Con
transparencia reducida, más contraste o sin `backdrop-filter`, pasa a sólido.

## 8. Movimiento

Curvas de la skill de Emil Kowalski:

| Token | Curva | Uso |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Interacciones |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Hojas inferiores |

- Pulsar: `scale(0.97)` en 140 ms. Es la respuesta más frecuente de la vuelta.
- Hover solo con `(hover: hover) and (pointer: fine)`: en el móvil, un hover se
  queda pegado tras tocar.
- Hojas: suben desde su propia altura con `@starting-style`.
- Lo que se ve a menudo apenas se anima: Mi tarjeta entra en 260 ms.
- **La única ceremonia es la revelación**, que ocurre una vez por torneo: la fila
  llega desenfocada y se asienta en 420 ms.
- `prefers-reduced-motion`: se conservan opacidad y color, se quita todo
  desplazamiento.

## 9. Comportamiento nativo en móvil

Cada regla corrige un síntoma concreto (skill mobile-native):

- sin destello gris al tocar (`-webkit-tap-highlight-color`);
- `touch-action: manipulation` en controles: sin retraso de doble toque;
- `user-select: none` en controles, nunca en el contenido;
- inputs a 16 px como mínimo, en lugar de bloquear el zoom;
- `viewport-fit=cover` y `env(safe-area-inset-*)` en cabecera y dock;
- `overscroll-behavior: contain` en hojas y listas con scroll propio.

## 10. Escritura

- Frase normal, voz activa, sin relleno.
- Sin metadatos unidos con punto medio en lo que se ve: "Par 72, 18 hoyos".
- El nombre oficial del campo, como en el escudo: **Ulzama-Bariain**.

## 11. Imágenes

No hay fotografía del campo: el repositorio no incluye ninguna con derechos
comprobados y no se descarga ninguna. `TournamentHero` admite `photoUrl` con un
velo oscuro para el día que exista. El escudo es el de `public/icons`.
