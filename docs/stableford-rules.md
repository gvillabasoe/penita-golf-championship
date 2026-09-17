# Reglas de puntuación de esta edición

Modalidad: **Individual Stableford**. Asignación de hándicap: **95 %**.

## Puntos

```
netos      = golpes brutos − golpes recibidos en el hoyo
netoAlPar  = netos − par del hoyo
puntos     = clamp(2 − netoAlPar, 0, 5)
```

| Resultado neto | Puntos |
|---|---|
| Albatros neto o mejor | 5 |
| Eagle neto | 4 |
| Birdie neto | 3 |
| Par neto | 2 |
| Bogey neto | 1 |
| Doble bogey neto o peor | 0 |
| Raya | 0 |

**Tope de 5 puntos en esta edición.** Un neto de −4 o mejor sigue dando 5.

La raya siempre vale 0, con cualquier reparto de golpes.

## Resultado bruto

La categoría visual del bruto se compara con el par real y **nunca depende de los
golpes recibidos**. Un 3 en el hoyo 1 es un birdie tanto si el jugador recibía un
golpe como si no; lo que cambia son los puntos, no la categoría.

| Bruto respecto al par | Categoría | Forma |
|---|---|---|
| 1 golpe | Hoyo en uno | Prioridad visual sobre albatros |
| −3 o mejor | Albatros | Doble círculo dorado |
| −2 | Eagle | Doble círculo azul |
| −1 | Birdie | Círculo azul |
| 0 | Par | Sin forma, número negro |
| +1 | Bogey | Cuadrado |
| +2 | Doble bogey | Doble cuadrado |
| +3 o más | Triple bogey o peor | Triple cuadrado |
| Raya | Raya | Guion rojo |

Las formas son la información. El color acompaña, no sustituye: un daltónico
distingue círculo de cuadrado, y el lector de pantalla lee «Birdie, 3 golpes, 3
puntos Stableford».

## Totales

Ida (1–9), vuelta (10–18) y total, cada uno con golpes numéricos y puntos.

**Si hay alguna raya, no se publica un bruto total.** Se muestra la suma numérica,
el número de rayas y la indicación «resultado bruto incompleto». Sumar solo los
hoyos jugados y presentarlo como bruto de la vuelta sería un número falso.

## Tercer criterio de desempate: golpes ajustados

El pliego pedía «menor suma de golpes numéricos». Eso tenía un efecto perverso:
un hoyo con raya no suma nada, así que quien levantaba la bola llegaba al
desempate con una suma artificialmente baja. **Cuanto peor iba un hoyo, más
convenía no terminarlo.**

Corregido el 17/09/2026, autorizado por el organizador. El tercer criterio usa
ahora la **suma ajustada**, donde los hoyos sin resultado numérico se imputan con
las cifras que ya usa el WHS:

| Situación | Se cuenta como |
|---|---|
| Raya (hoyo empezado y no terminado) | **doble bogey neto** = par + 2 + golpes recibidos |
| Hoyo no jugado | **par neto** = par + golpes recibidos |

El doble bogey neto es exactamente el umbral a partir del cual un hoyo vale 0
puntos Stableford. Quien levanta la bola ha hecho **al menos** eso, así que
contárselo no le regala nada, no le castiga de más y le quita la ventaja.

Ejemplo real del test que fija el cambio:

| Jugador | Puntos | Hcp | Golpes escritos | Rayas | Ajustado | Antes | Ahora |
|---|---|---|---|---|---|---|---|
| Uno | 36 | 20,0 | 95 | 0 | 95 | perdía | **gana** |
| Dos | 36 | 20,0 | 88 | 3 | 109 | ganaba | pierde |

### Qué se muestra

La clasificación enseña **los golpes que el jugador escribió**, que son los que
reconoce. El ajustado aparece solo cuando hay rayas, porque solo entonces
difiere, y va también en la etiqueta accesible para poder auditar un desempate
sin abrir el panel.

El PDF lleva una columna «Ajust.» y, cuando alguien levantó la bola, una nota al
pie explicándola. Un desempate que nadie entiende es un desempate que alguien va
a discutir.

Cuando el orden se decide por este criterio y hay rayas de por medio, la fila
lleva una nota para el administrador diciendo sobre qué base se resolvió.

## Estados de la tarjeta

| Estado | Condición |
|---|---|
| Sin comenzar | Ningún resultado |
| En juego | Al menos uno, faltan hoyos, o falta la confirmación final |
| Finalizada | 18 resultados (número o raya) **y** confirmación del jugador |
| Revisada | Validada por otro integrante del partido |
| Bloqueada | No editable por el jugador |

18 resultados no bastan para pasar a «finalizada»: hace falta que el jugador lo
confirme. Y no se puede finalizar con hoyos vacíos, aunque la raya sí cuenta como
resultado válido.
