# Exportación e impresión

La aplicación genera documentos PDF A4 con una maquetación propia. No se imprime
la pantalla del navegador ni se reutiliza el DOM de las páginas: cada documento
se compone en servidor con `pdf-lib` a partir de los mismos datos de dominio que
alimentan la interfaz.

## Identidad visual

El sistema de PDF adapta directamente el lenguaje visual **Escudo** definido en
`src/styles/tokens.css` y documentado en `docs/design-system.md`:

- azul marino para cabeceras, títulos y totales;
- marfil, porcelana y superficies claras para el papel y las tarjetas;
- amarillo de tee como acento estructural;
- verde calle para resultados, progreso y estados positivos;
- logotipo oficial de `public/icons/icon-512.png`;
- tarjetas redondeadas, bandas laterales por jugador y jerarquía tipográfica
  equivalente a la aplicación;
- cifras compactas y alineadas para tablas, HCP, golpes y puntos.

Las fuentes del PDF son las fuentes estándar embebidas por `pdf-lib`. Se mantiene
la jerarquía y el ritmo tipográfico de la aplicación sin depender de fuentes del
sistema del servidor ni distribuir archivos de tipografía.

## Documentos disponibles

El panel **Administración → Exportación** ofrece los siguientes documentos:

| Documento | Contenido | Archivo |
|---|---|---|
| Clasificación individual | Posición, jugador, HCP, HJ, puntos, golpes, desempates y semilla de partidos | `clasificacion.pdf` o `clasificacion-provisional.pdf` |
| Clasificación por parejas | Equipos, modalidad, progreso, puntos, desempates y semilla de parejas | `clasificacion-parejas.pdf` o versión provisional |
| Tarjetas individuales | Una tarjeta completa por participante y página | `tarjetas-individuales.pdf` |
| Tarjetas de parejas | Tarjeta derivada de mejor bola o dos tarjetas individuales por pareja | `tarjetas-parejas.pdf` |
| PDF completo | Portada, sorteos, clasificaciones y todas las tarjetas | `dossier-completo.pdf` o versión provisional |

También se pueden descargar por separado los dos documentos de trazabilidad:

- `sorteo-partidos.pdf`;
- `sorteo-parejas.pdf`.

Se conserva la descarga de una tarjeta individual concreta y las exportaciones
preexistentes de auditoría, configuración del campo e imagen de la clasificación.

## Maquetación A4

Todas las páginas usan tamaño A4, márgenes constantes, cabecera de torneo y pie
con fecha y numeración. La composición controla el espacio disponible antes de
dibujar cada bloque para que:

- una tarjeta nunca quede dividida entre dos páginas;
- una fila de clasificación no se corte;
- los encabezados se repitan al comenzar una sección o continuación;
- las tablas de nueve hoyos mantengan columnas, cifras y totales alineados;
- no existan elementos fuera de página ni desbordamientos laterales;
- el dossier completo inicie cada tipo de contenido con una sección reconocible.

Las tarjetas ocupan una página completa. Los hoyos 1-9 y 10-18 se muestran en
dos tablas paralelas, seguidas de puntos, hoyos completados, golpes escritos,
rayas y resultado bruto o ajustado.

## Tarjetas de parejas

La representación depende de la modalidad configurada:

### Dobles - mejor bola Stableford

Se genera una única tarjeta derivada. En cada hoyo se muestra el resultado que
aporta más puntos Stableford, después de aplicar los golpes recibidos de cada
jugador. Una fila adicional identifica mediante iniciales y color qué integrante
aporta cada hoyo.

### Suma de puntos individuales

No se fabrica una tercera tarjeta. El PDF conserva las dos tarjetas individuales
de la pareja, una por página, agrupadas bajo el mismo número y nombre de equipo.

### Participante individual x2

Cuando el sorteo tiene un participante individual, se genera una sola tarjeta
derivada. Los golpes y resultados jugados se conservan y los puntos Stableford
se duplican. El documento lo identifica como **individual x2** y muestra
**puntos x2** junto al total.

## Semillas de los sorteos

La competición conserva dos valores independientes:

- `flightDrawSeed`: semilla del sorteo de partidos;
- `pairDrawSeed`: semilla del sorteo de parejas.

La semilla de partidos se persiste al confirmar la propuesta de partidos. La
semilla de parejas se persiste al guardar el sorteo de parejas. Introducir de
nuevo el mismo valor con los mismos participantes y datos de HCP permite
reproducir el mismo resultado.

Las semillas se muestran:

- al final de la composición de partidos en pantalla;
- al final de la composición de parejas en pantalla;
- al final del documento de sorteo correspondiente;
- en la clasificación vinculada a ese sorteo;
- en el PDF completo, al final de la sección exacta de cada sorteo, sin duplicarla
  después en la clasificación.

Un cambio manual posterior en las parejas elimina la semilla de parejas porque
el resultado deja de corresponder a un sorteo reproducible. Volver a sortear
partidos invalida la confirmación y cualquier sorteo de parejas, incluida su
semilla.

Las semillas se normalizan antes de usarse o persistirse: se eliminan espacios
laterales, se rechazan caracteres de control y se limita su longitud a 128
caracteres.

## Clasificación provisional y definitiva

La política de publicación original se mantiene:

- la clasificación definitiva solo se genera cuando está publicada;
- antes de publicar, el administrador puede generar documentos provisionales;
- todo PDF provisional lleva una marca amarilla en la cabecera y un aviso
  explícito dentro del documento;
- no existe una opción para ocultar esa marca.

El PDF completo hereda el mismo estado: mientras la clasificación no esté
publicada, todo el dossier se identifica como provisional.

## Seguridad y rutas

Las nuevas exportaciones agrupadas son administrativas y se protegen tanto en
middleware como en el propio handler mediante `requireAdmin()`:

```text
/api/export/full
/api/export/individual-scorecards
/api/export/pair-leaderboard
/api/export/pair-scorecards
/api/export/flight-draw
/api/export/pair-draw
```

Todas responden con `Cache-Control: no-store`. El PDF del sorteo de partidos
solo se habilita después de confirmar la composición: una propuesta o un reparto
marcado como borrador nunca se presenta como documento confirmado. Cuando todavía
no existe el contenido necesario, las rutas devuelven un error `409` en vez de
descargar un PDF vacío.

## Compatibilidad de texto

Las fuentes estándar de PDF usan codificación WinAnsi. Todo texto pasa por
`sanitizeForPdf` para conservar nombres españoles y evitar que un carácter no
representable bloquee la descarga:

- se mantienen `á`, `é`, `í`, `ó`, `ú`, `ñ` y los guiones usados en nombres;
- se normaliza Unicode;
- se transliteran símbolos frecuentes como flechas y marcas de verificación;
- los caracteres restantes no representables se sustituyen de forma segura.

## Verificación recomendada

El flujo de validación de un cambio de maquetación es:

1. generar un PDF representativo con partidos, clasificaciones, tarjetas,
   parejas de mejor bola e individual x2;
2. comprobar programáticamente que todas las coordenadas están dentro del A4;
3. renderizar el PDF a PNG con
   `/home/oai/skills/pdfs/scripts/render_pdf.py`;
4. revisar portada, continuaciones, tablas, tarjetas, seeds, pies y saltos;
5. ejecutar los tests de exportación, rutas, esquema y referencias.

Las pruebas de exportación leen de nuevo el PDF con `pdfjs-dist`; no se limitan a
comprobar que el archivo existe. Verifican texto, permisos, paginación,
provisionalidad, las dos modalidades de parejas, individual x2 y posición de
las seeds.
