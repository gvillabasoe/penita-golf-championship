# Exportaciones

Tres formatos, cada uno con un motivo.

| Formato | Para qué | Dependencias |
|---|---|---|
| **PDF** | Documento oficial: se imprime, se archiva, el texto es fiel | pdf-lib (JavaScript puro) |
| **SVG** | Formato canónico de la imagen, se ve igual en cualquier navegador | ninguna |
| **PNG** | Compartir en el grupo de WhatsApp | sharp (opcional) |

## Por qué pdf-lib y no un navegador sin cabeza

Lo habitual para generar PDF es abrir Chromium sin cabeza e imprimir una página.
En Vercel eso significa un paquete de más de 100 MB, arranques en frío de varios
segundos y un binario que hay que mantener.

pdf-lib es JavaScript puro, sin dependencias nativas, y usa fuentes estándar
embebidas. Cabe de sobra en una función serverless, arranca al instante y el
resultado es idéntico en cualquier entorno.

## El detalle que rompe las exportaciones: WinAnsi

Las fuentes estándar de PDF usan codificación **WinAnsi**, que no cubre todo
Unicode. Comprobado contra pdf-lib en este mismo repositorio:

| Carácter | Resultado |
|---|---|
| `á é í ó ú ñ` | pasa |
| `–` `—` `'` `"` | pasa |
| espacio duro, guion suave | pasa |
| `✓` `→` `α` | **lanza excepción** |
| `👍` `🏌️` | **lanza excepción** |

Esto no es teórico. Los motivos de corrección y las observaciones de una revisión
los escribe una persona desde el móvil, con su teclado y sus emojis. **Un pulgar
arriba en una observación dejaría sin PDF a toda la clasificación**, y justo el
día que hace falta.

Por eso todo el texto pasa por `sanitizeForPdf` antes de dibujarse:

- Normaliza a NFC, así que «á» compuesta y descompuesta se tratan igual.
- Translitera lo frecuente: `→` a `->`, `✓` a `OK`, `≥` a `>=`.
- Sustituye por `?` lo que no se puede codificar.
- Nunca lanza, con ninguna entrada. Hay un test que lo prueba con emojis, con
  griego, con bytes de control y con una cadena de 5.000 caracteres.

Los nombres reales de la peña (Suárez, Rodríguez-Rey, Tomás) y la raya larga de
la edición pasan sin pérdida, y hay un test que lo fija.

## La regla que manda: publicado o nada

La sección 63 del pliego es tajante y se aplica **también al administrador**:

> La clasificación completa solo se exporta cuando está publicada.

Un PDF de la clasificación definitiva circulando por WhatsApp media hora antes de
la entrega de premios arruina la revelación, y eso no se puede deshacer.

Lo que el administrador sí necesita es revisar el provisional antes de publicar.
Existe como tipo de exportación distinto, y el documento **sale marcado como
provisional en su propia cabecera**, con recuadro y en rojo, no como una opción
que se pueda desactivar. Hay un test que comprueba que la marca está dentro del
PDF generado, y otro que comprueba que el definitivo no la lleva.

Resumen de permisos:

| Exportación | Quién | Cuándo |
|---|---|---|
| Clasificación final | cualquiera | solo publicada |
| Clasificación provisional | solo admin | solo antes de publicar, marcada |
| Tarjeta propia | el dueño | siempre |
| Tarjeta del mismo partido | compañeros | antes de publicar, marcada |
| Tarjeta de otro partido | cualquiera | solo publicada |
| Partidos y horas | cualquiera | siempre |
| Auditoría, configuración del campo | solo admin | siempre |

Los permisos se comprueban **antes** de generar un solo byte: no se construye un
documento que luego no se pueda entregar.

## El bruto falso tampoco se cuela en papel

La misma regla que en pantalla: si hay una raya o falta un hoyo, el PDF de la
tarjeta **no imprime** un resultado bruto respecto al par. Imprime la suma
numérica, el número de rayas y «Resultado bruto incompleto».

En papel importa más que en pantalla: un PDF circula, se imprime y se compara.

## Verificación

Los PDF generados se **vuelven a leer** con pdfjs-dist y se comprueba el texto
extraído. No se comprueba que el archivo exista: se comprueba que dentro dice lo
que tiene que decir.

```
36 tests de exportación, todos pasando
```

Incluye: cabecera completa, los seis datos de cada jugador, posiciones
compartidas marcadas con `=`, paginación con 13 jugadores sin perder a nadie, la
marca de provisional, y un PDF generado con un emoji en el nombre.

El PNG se comprueba por su firma de archivo y por sus dimensiones reales leídas
con sharp.

## Nota sobre el PNG y las fuentes

El PNG se rasteriza desde el SVG con sharp, que usa las fuentes **del sistema**.
Las de una función serverless de Vercel no son las de un portátil, así que el
texto puede verse distinto.

Por eso el SVG es el formato canónico y lleva una pila de fuentes con reservas.
Para algo que tenga que ser fiel, el PDF.
