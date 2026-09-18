# Sincronización sin conexión

Ulzama está en un valle, rodeado de robledal. Dar por supuesto que hay cobertura
en los 18 hoyos es la forma más rápida de perder una tarjeta.

El requisito duro es el de la sección 41: **ningún hoyo confirmado puede perderse
por falta de cobertura**. Todo lo que sigue sale de ahí.

## 1. El camino de un resultado

```
  El jugador confirma el hoyo 7
            │
            ▼
  1. Se escribe en IndexedDB           ← ya no se puede perder
            │
            ▼
  2. Entra en la cola con un clientMutationId único
            │
            ▼
  3. Si hay cobertura, se envía
            │
            ├── APPLIED   → se retira de la cola
            ├── DUPLICATE → se retira igual (ya estaba)
            ├── CONFLICT  → se aparta, lo resuelve una persona
            └── error red → vuelve a la cola con espera creciente
```

El punto 1 va **antes** del envío, siempre. El resultado existe en el móvil antes
de que la red entre en juego.

Una operación sale de la cola solo cuando el servidor confirma. No al enviarla,
no al perder la conexión, no al cerrar la app.

## 2. Idempotencia

Cada operación lleva un `clientMutationId` generado en el móvil. El servidor
guarda los que ya ha aplicado y, si le llega uno repetido, responde `DUPLICATE`
sin tocar nada.

Esto hace que **reenviar sea siempre seguro**, que es lo que permite reintentar
sin miedo. El caso que resuelve es muy concreto y muy común: el móvil envía nueve
hoyos, el servidor los aplica, y la respuesta se pierde en el camino. El móvil no
sabe si llegaron. Reintenta. Sin idempotencia, ahí se duplican nueve resultados.

Hay un test que reproduce exactamente ese escenario y comprueba que la segunda
vez no se aplica nada y que la versión de la tarjeta no se mueve.

La comprobación de idempotencia va **antes** que la de autorización, a propósito:
si una operación se aplicó y luego se bloqueó la tarjeta, un reenvío tiene que
seguir respondiendo `DUPLICATE`, no `CARD_LOCKED`. Si no, el móvil se quedaría con
una operación en la cola que ya está aplicada y que nunca podría retirar.

## 3. Concurrencia optimista por hoyo, no por tarjeta

Aquí está la decisión de diseño que importa.

Lo estándar es versionar la tarjeta entera: si la versión del servidor cambió
desde que el cliente la leyó, conflicto. Aplicado aquí, se rompe.

Escenario: un jugador apunta nueve hoyos sin cobertura. Sus nueve operaciones
llevan la versión que vio al empezar. Mientras tanto, el administrador le arregla
el hándicap, y la versión de la tarjeta sube. Al volver la cobertura, **las nueve
operaciones darían conflicto de golpe** y habría que resolverlas a mano, en medio
de la vuelta.

La regla que se ha implementado es:

> Hay conflicto si el hoyo se escribió después de la versión base del cliente
> **y** lo escribió un dispositivo distinto.

Consecuencias, todas cubiertas por tests:

| Situación | Resultado |
|---|---|
| El jugador corrige su propio hoyo (5 y luego 6) | Se aplican las dos, gana la última |
| Versión base antigua, pero el hoyo no ha cambiado | Se aplica |
| Otro dispositivo escribió ese mismo hoyo | Conflicto |
| El administrador corrigió ese hoyo | Conflicto, con motivo distinto |
| Un lote con un hoyo en conflicto | Se aplica el resto, se aparta solo ese |

El `clientId` (identificador del dispositivo) es lo que distingue «yo corrigiendo
mi hoyo» de «otro móvil ha tocado este hoyo». Sin él, la propia cola de un móvil
entraría en conflicto consigo misma.

## 4. La cola no se deduplica por hoyo

Si el jugador apunta 5 en el hoyo 7 y luego lo corrige a 6, se envían **las dos**
operaciones, en orden. Sería más eficiente mandar solo la última, pero:

- El historial queda completo y auditable.
- La última gana por orden de llegada, sin depender del reloj del móvil, que
  puede estar mal puesto.

Son 18 hoyos. El ahorro no compensa perder trazabilidad.

Por el mismo motivo el envío es FIFO estricto y **no adelanta operaciones**: si el
hoyo 7 está esperando para reintentar, el 8 espera también. Enviarlos
desordenados podría aplicar una corrección antes que el valor que corrige.

## 5. Reintentos

Retroceso exponencial con techo: 1 s, 2 s, 4 s, 8 s… hasta 60 s. Ocho intentos.
Determinista, sin aleatoriedad, para que sea comprobable.

Tras agotar los intentos la operación queda como `FAILED` y **detiene la cola**.
No se salta: si el hoyo 7 no ha entrado, mandar el 8 dejaría un hueco silencioso.
La interfaz muestra el estado de error y los resultados siguen guardados en el
móvil.

## 6. Un cambio de hándicap no bloquea un resultado

**Desviación documentada de la sección 43**, que lista «cambió el hándicap» y
«cambió la distribución» entre los motivos de conflicto. Aquí avisan, no bloquean.

El razonamiento: la operación del jugador solo contiene **golpes brutos**. Los
golpes recibidos, el neto y los puntos los recalcula el servidor con el reparto
vigente. Bloquear un resultado bruto porque el administrador arregló un hándicap
perdería el resultado del jugador sin ninguna necesidad, que es justo lo que
prohíbe la sección 41.

Lo que sí hace falta es que el móvil recargue su reparto de golpes, y para eso la
respuesta incluye `staleAllocation: true`.

## 7. Qué se guarda en el móvil y qué no

Se guarda: la tarjeta propia, los datos del campo, la configuración de la vuelta,
los datos del partido necesarios para la vista y las operaciones pendientes.

No se guarda: sesiones, contraseñas, respuestas privadas, tarjetas de otros
jugadores ni nada de administración.

## 8. Cierre de sesión en un dispositivo compartido

Nada teórico: el móvil del organizador puede pasar de mano en mano.

- Los datos de un usuario **nunca** se mezclan con los de otro. Al cerrar sesión
  se borra solo lo del usuario que sale.
- Si quedan operaciones sin enviar, **no se borran sin avisar**: se devuelve la
  cuenta para que la interfaz pregunte primero.

## 9. Cuándo se sincroniza

Al recuperar conexión, al abrir la app, al volver a primer plano, y con Background
Sync donde esté disponible. Donde no lo esté, un reintento normal al volver a
primer plano cubre el caso: la cola es idempotente, así que sincronizar de más no
tiene coste de corrección.

## 10. Estado en pantalla

Siempre visible en la cabecera, con etiqueta accesible para lector de pantalla:

| Estado | Cuándo |
|---|---|
| Sincronizado | Nada pendiente |
| Guardando… | Hay un envío en curso |
| N por sincronizar | Con cobertura y pendientes |
| Sin conexión · N por enviar | Sin cobertura |
| Error al sincronizar | Una operación agotó los reintentos |

El error gana a «sin conexión»: son problemas distintos y se arreglan distinto.

---

## 11. Borrar un resultado sin conexión

Borrar el resultado de un hoyo es una operación de la cola como cualquier otra,
con `operation: 'CLEAR'` en lugar de `'WRITE'`.

Lo único que la distingue: **vacío no es raya**. Un hoyo vacío no cuenta como
completado, no genera puntos e impide finalizar la tarjeta; una raya es un
resultado válido que cuenta, vale 0 y permite finalizar. Una operación `CLEAR`
que llegue con golpes o con raya dentro se rechaza como estado imposible, porque
si se aceptase la diferencia entre "todavía no lo he jugado" y "levanté la bola"
dependería de cuál de los dos campos mirase cada pantalla.

Es idempotente por su `clientMutationId`, igual que una escritura: reenviarla
desde la cola no da error ni deja el hoyo en un estado raro.

El registro del hoyo **se conserva** con los campos vacíos en lugar de
desaparecer. Eliminarlo perdería quién lo tocó por última vez y con qué versión,
y con ello la detección de conflictos: otro dispositivo con una versión antigua
podría escribir encima sin que nadie lo marcase.

## 12. Generación de resultados: la guardia contra datos antiguos

Este es el mecanismo que impide que un resultado borrado resucite solo.

### El problema

Un móvil apunta nueve hoyos sin cobertura. El administrador vacía las tarjetas
del campeonato. El móvil recupera la conexión y envía sus nueve operaciones.

Esas nueve operaciones son legítimas: son de su dueño, con golpes válidos y con
una versión base coherente. Sin guardia, el servidor las aplicaría sin
pestañear, y habría resultados borrados reapareciendo solos horas después, en
mitad de la entrega de premios.

### La solución

`Competition.scoreResetVersion` es la **generación de resultados**. Empieza en 0
y la incrementa cada vaciado de tarjetas.

Cada operación de la cola viaja con la generación sobre la que se creó
(`scoreGeneration`). El servidor compara:

```text
si scoreGeneration de la operación < scoreResetVersion del campeonato:
    rechazar con STALE_GENERATION
```

El rechazo ocurre **antes** de la autorización y de la validación. Es
deliberado: una operación obsoleta y además mal formada tiene que reportarse
como obsoleta, porque esa es la causa real y es lo que el jugador necesita saber.

### En el vaciado

La generación se incrementa **primero**, dentro de la transacción. Dentro de una
transacción el orden no cambia lo que ve el exterior, pero sí lo que ve cualquier
escritura que llegue mientras está corriendo: la fila de `Competition` queda
bloqueada desde ese momento, así que una operación de un móvil que entre a mitad
espera y se encuentra ya con la generación nueva. Es lo que evita que un
resultado se cuele entre el borrado y el fin del vaciado.

Las operaciones `PENDING` que ya estaban en la tabla se marcan como `REJECTED`
con motivo `STALE_GENERATION`. Las ya aplicadas se dejan como están: son
historia, y reescribirla sería mentir sobre lo que pasó.

### En el móvil

`invalidateStaleGenerations(queue, generacionActual)` marca como `STALE` todo lo
pendiente de una generación anterior. Esas operaciones:

- **no se envían** — `nextBatch` las salta;
- **no se borran** — quedan en la cola con su motivo, porque nada desaparece en
  silencio en esta aplicación;
- **no detienen la cola** de lo que venga detrás, que es de la generación nueva y
  tiene todo el derecho a subir;
- **no bloquean el cierre de sesión**: no están pendientes de enviar, así que no
  hay nada que perder al salir.

### Compatibilidad con la versión 1.1

`operation` y `scoreGeneration` son **opcionales** en `HoleMutation`, con valores
por omisión `'WRITE'` y `0`. Así una cola guardada por la versión anterior sigue
siendo legible sin tocar nada en el móvil.

Por eso `QUEUE_SCHEMA_VERSION` **se queda en 1**. Subirla pondría en cuarentena
resultados que solo existen en el móvil de un jugador, y eso es exactamente lo
que la sección 41 del pliego prohíbe.
