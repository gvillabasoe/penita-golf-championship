# Guía administrativa

Peñita Golf Championship · v1.2.0

Las tres acciones que se añadieron en la 1.2.0, con lo que hacen, lo que no hacen
y cuándo conviene usarlas.

Todas exigen rol de administrador, y la comprobación se hace **en el servidor**
con la sesión real. Ocultar un botón a los jugadores no es una medida de
seguridad: es maquetación.

---

## 1. Limitar el hándicap máximo

**Dónde**: Administración → Campo y modalidad → *Limitar HCP*.

### Qué hace

Los jugadores con un hándicap exacto superior al límite compiten usando ese valor
máximo para calcular su hándicap de campo y su hándicap de juego.

```text
sin límite:  handicapAplicable = handicapExactoOriginal
con límite:  handicapAplicable = min(handicapExactoOriginal, límite)
```

### Qué NO hace

**No sobreescribe el hándicap exacto de nadie.** El exacto sigue guardado, sigue
mostrándose en la ficha del jugador, en su tarjeta y en la clasificación, y sigue
decidiendo el segundo criterio de desempate.

Eso último importa más de lo que parece. Dos jugadores de 30,2 y 28,0 con el
límite en 26,4 compiten los dos con 26,4. Si el desempate usase el aplicable
quedarían empatados para siempre; con el exacto gana el de 28,0, que es lo que
dicen las reglas de la competición.

### Cómo se escribe

Se admite coma o punto, con o sin decimal: `24`, `26,4`, `26.4`. Internamente se
normaliza a décimas enteras (26,4 → 264), porque nada que decida una
clasificación pasa por coma flotante en esta aplicación.

**No se admite la notación plus** (`+2,4`): un límite plus no limitaría a nadie de
los que el límite pretende afectar, y aceptarlo dejaría una configuración que no
hace lo que su autor cree.

### Antes de guardar

Si ya hay resultados escritos, aparece el aviso de que se recalcularán el
hándicap de juego, los golpes recibidos, los puntos y la clasificación de todos
los jugadores afectados. Nada se aplica en silencio.

### Cómo se ve

A un jugador que no supere el límite no se le añade ningún ruido visual. A uno que
sí lo supere se le muestran los tres valores —HCP exacto, HCP aplicable y HCP de
juego— y la etiqueta **HCP limitado a X** en su ficha administrativa, en su
tarjeta, en la vista del partido y en la clasificación.

### Quitar el límite

Es una acción **explícita y separada**: *Quitar límite de HCP*, con su propia
confirmación. No se quita dejando el campo vacío y pulsando "Guardar", porque
dejar en blanco un número es demasiado fácil de hacer sin querer para algo que
devuelve golpes a media docena de jugadores.

Al quitarlo, todos los afectados vuelven a competir con su hándicap exacto y se
recalcula todo.

### Queda en auditoría

Valor anterior, valor nuevo, administrador, fecha y los jugadores afectados con
el valor con el que pasan a competir.

---

## 2. Borrar el resultado de un hoyo

Esto **lo hace el jugador**, no el administrador. Se documenta aquí porque el
administrador tiene que saber qué pasa cuando alguien lo usa.

**Dónde**: en el teclado de resultados, cuando el hoyo ya tiene resultado.

### Vacío no es raya

Es toda la funcionalidad, y conviene tenerlo claro:

| | Hoyo vacío | Raya |
| --- | --- | --- |
| ¿Tiene resultado? | No | Sí, es válido |
| ¿Cuenta como completado? | **No** | Sí |
| ¿Genera puntos? | No | 0 puntos |
| ¿Permite finalizar la tarjeta? | **No** | Sí |
| Se ve como | Pendiente | Guion rojo |

Confundirlas regalaría una tarjeta completa a quien le falta un hoyo.

### Quién puede

Exactamente quien ya podía escribir: **solo su propia tarjeta**, y solo si no
está bloqueada. Los permisos no se han ampliado. Si el administrador había
corregido ese hoyo, el jugador no puede borrarlo sin autorización.

El administrador conserva sus permisos actuales de desbloqueo y corrección.

### Qué arrastra

- Se eliminan el bruto, la raya si había, el neto, los puntos y la confirmación
  del hoyo.
- Se recalculan totales, hoyos completados, número de rayas y clasificación.
- Si no queda ningún hoyo apuntado, la tarjeta vuelve a **Sin comenzar**.
- Si quedan otros, pasa o se queda en **En juego**.
- Si estaba finalizada, **deja de estarlo** y se retira la confirmación del
  jugador. Sin eso, la tarjeta volvería a darse por finalizada en cuanto el
  jugador rellenase el hueco, sin que nadie lo hubiera vuelto a confirmar.
- Si había revisión, queda **desactualizada** y hay que pedir otra. No se borra:
  así el compañero que revisó ve por qué se le vuelve a pedir.

### Sin conexión

Funciona igual. La operación se guarda en el móvil y sube sola al recuperar
cobertura. Ver `docs/offline-sync.md`, secciones 11 y 12.

### Queda en auditoría

Como `HOLE_SCORE_CLEARED`, con el valor anterior del hoyo.

---

## 3. Vaciar los resultados de todas las tarjetas

**Dónde**: Administración → Tarjetas → **Zona de acciones críticas**.

Es la acción más destructiva de la aplicación. Borra el trabajo de trece personas
y **no se puede deshacer**.

### Cuándo tiene sentido

El caso que justifica que exista: *"hemos estado probando la app con resultados
inventados y queremos empezar de cero el día del torneo"*.

### Qué se vacía

Los resultados y todo lo derivado de ellos:

- golpes brutos, rayas y confirmaciones por hoyo;
- netos, puntos Stableford y totales de ida, vuelta y campo;
- hoyos completados y número de rayas;
- revisiones asociadas y confirmaciones finales;
- bloqueos de tarjeta;
- snapshots de clasificación, estado de revelación y publicación.

Cada tarjeta afectada queda en **Sin comenzar**: 0 hoyos, 0 puntos, 0 golpes, 0
rayas, sin revisión activa y sin bloqueo. La clasificación vuelve a **oculta**.

### Qué se conserva

Usuarios, contraseñas, roles, jugadores, hándicaps exactos, **el límite de
hándicap**, colores, partidos, composición de los partidos, horas de salida,
campo, recorrido, barras, par, stroke index, distancias, valoración, modalidad,
porcentaje de hándicap, configuración del campeonato y el historial de auditoría
anterior.

Hay un test que lo comprueba enumerando lo que la acción **no** debe tocar.

**Las tarjetas se vacían, no se borran.** Siguen existiendo como entidades.
Borrarlas obligaría a recrearlas y a reasignar identificadores, y cualquier
tropiezo ahí deja a un jugador sin tarjeta el día del torneo.

### Las dos confirmaciones

**Primera**: muestra cifras. Tarjetas afectadas, resultados de hoyo que se
eliminan, puntos que se pierden, bloqueos que se levantan, revisiones que se
invalidan y estado actual de la clasificación. Más el aviso de que la acción no
se puede deshacer.

**Segunda**: hay que escribir `VACIAR`. El botón final sigue deshabilitado hasta
que el texto coincida.

Dos y no una porque un "¿seguro?" se pulsa sin leerlo. Escribir una palabra es la
única barrera que no se supera por inercia. Se admiten espacios alrededor y
minúsculas: el objetivo es evitar un toque accidental, no montar un examen de
mecanografía con un teclado móvil.

### Móviles sin cobertura

Esto es lo importante y conviene entenderlo antes de pulsar.

Si algún jugador está sin cobertura con hoyos apuntados en su móvil, esas
operaciones **no se aplicarán** al recuperar la conexión. Quedarán marcadas como
obsoletas y el jugador verá el aviso de que el administrador vació las tarjetas.

Es lo correcto: aplicarlas devolvería a la vida resultados ya borrados. Pero
significa que **si vacías con alguien jugando, ese alguien pierde lo que llevaba
apuntado**. Vacía antes de la primera salida, no a mitad de vuelta.

El mecanismo completo está en `docs/offline-sync.md`, sección 12.

### Queda en auditoría

Administrador, fecha y hora, campeonato, número de tarjetas vaciadas, resultados
eliminados, estado anterior y posterior de la clasificación, y las dos
generaciones de resultados. Esa última es el dato que explica por qué se rechazó
la operación de un móvil horas después; sin ella, el rechazo parece un fallo de
sincronización.

---

## Orden de despliegue al actualizar desde la 1.1.0

1. Aplica `prisma/sql/migrations/002-limite-hcp-y-vaciado.sql` en Neon.
2. **Después** despliega el código.

Al revés, la aplicación arranca y falla en la primera lectura, porque
`appliedHandicapIndexTenths` todavía no existiría.

La migración es transaccional y re-ejecutable: pegarla dos veces no rompe nada.
Después de aplicarla, `scoreResetVersion` vale 0, `maxHandicapIndexTenths` es
nulo y el hándicap aplicable es igual al exacto en todos los jugadores. **Ningún
hándicap de juego cambia por migrar.**
