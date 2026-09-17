# Datos del campo: fuentes, trazabilidad y decisión pendiente

Campo: **Club de Golf Ulzama** (código federativo 4401), recorrido **ULZAMA**,
barras **amarillas**, categoría **caballeros**, 18 hoyos.

Fecha de esta investigación: **17 de septiembre de 2026**.

---

## 1. Lo que está confirmado

Par, stroke index y distancias coinciden **exactamente** en tres fuentes
independientes. No hay ninguna discrepancia:

| Dato | Ficha PDF adjunta | Imagen de tarjeta adjunta | Microsite RFEG vigente |
|---|---|---|---|
| Par por hoyo | sí | sí | sí |
| Stroke index | **en blanco** | sí | sí |
| Distancias amarillas | sí | no | sí |
| Ida / vuelta / total | 2.999 / 3.052 / 6.051 | 36 / 36 | 2.999 / 3.052 / 6.051 |

Un detalle importante: **la columna HANDICAP de la ficha de medición del PDF está
vacía**. El stroke index no procede de ese documento. Su fuente primaria es la
tarjeta publicada en el microsite oficial de RFEG (columna `Hdcp`), y la imagen
adjunta actúa como confirmación secundaria. Ambas coinciden hoyo a hoyo.

Configuración verificada (tests en `src/lib/golf/__tests__/course.test.ts`):

- 18 hoyos, par 72, ida 36, vuelta 36.
- Stroke index 1–18 sin duplicados ni huecos.
- Los SI impares están todos en la ida y los pares todos en la vuelta.
- Distancias que suman 6.051 m.

## 2. La discrepancia que hay que resolver

La valoración **sí** difiere entre fuentes:

| | Ficha adjunta | RFEG vigente | Diferencia |
|---|---|---|---|
| Fecha de valoración | 9 de octubre de 2014 | no publicada | — |
| Valor de Campo (Vc) | 72,2 | **72,6** | +0,4 |
| Slope | 132 | **139** | +7 |
| Par | 72 | 72 | = |

**La hipótesis del superprompt queda confirmada en los valores de 18 hoyos.** El
microsite oficial de RFEG del propio club publica hoy Vc 72,6 y Slope 139 para
`ULZAMA - Ulzama - AMARILLAS (M)`, con la misma tarjeta hoyo a hoyo y los mismos
6.051 m. Fuente: <https://rfegolf.es/club/club_de_golf_ulzama?id=211>

Lo que **no** se ha podido verificar:

1. **La fecha de la valoración vigente.** El superprompt indica julio de 2024.
   El microsite de RFEG no publica fecha de valoración en ninguno de los ocho
   recorridos. No se afirma la fecha como verificada.
2. **Las valoraciones de 9 hoyos** (ida 36,4 / 140 y vuelta 36,2 / 138 según el
   superprompt). RFEG no las publica en la web. Irrelevante para esta edición,
   que se juega a 18 hoyos, pero queda anotado.

Como dato de contraste: agregadores comerciales como GolfPass siguen publicando
73,1 / 135, que son los valores de barras **blancas** de la ficha de 2014. Es
decir, los agregadores van tarde y además confunden barras. No sirven como fuente.

## 3. Por qué esto no es un detalle menor

Se ha medido el impacto deportivo real del cambio de valoración con el motor ya
implementado (test `impacto real del cambio de valoración`):

> Cambiar 72,2/132 por 72,6/139 **altera el hándicap de juego en 365 de los 401
> hándicaps exactos posibles entre 0,0 y 40,0.**

En la práctica: casi cualquier jugador de la peña recibe un golpe más con la
valoración vigente. Con 13 jugadores y un desempate por hándicap exacto, esto
decide posiciones.

La nueva valoración nunca da menos golpes que la antigua (verificado como
invariante en el test). Es más exigente, lo cual es coherente con una revaloración
posterior del campo.

## 4. Estado actual en el repositorio

`data/ulzama.snapshot.json` guarda **las dos fuentes completas** con su
procedencia, y el snapshot activo apunta a la vigente (72,6 / 139) **con
`confirmedAt: null`**.

Eso significa: la aplicación tiene el dato correcto cargado, pero **no lo activa**
hasta que el administrador lo confirme explícitamente desde el panel. Hay un test
que falla a propósito si alguien activa la valoración sin dejar registrado quién
la confirmó y cuándo.

## 5. Checklist de confirmación para el administrador

Antes de activar la configuración del campeonato:

- [ ] Abrir el microsite RFEG del club y comprobar que sigue publicando 72,6 / 139
      para AMARILLAS (M). Las valoraciones se revisan periódicamente.
- [ ] Pedir al club (deportivo@golfulzama.com / 948 305 162) la **fecha de
      vigencia** de la valoración actual y, si es posible, la ficha de valoración
      en PDF. Es el único dato que falta para cerrar la trazabilidad.
- [ ] Confirmar la política de redondeo del hándicap de juego (ver
      `docs/handicap-calculation.md`, sección 3: no es una decisión cosmética).
- [ ] Confirmar el 95 % de asignación para Stableford individual.
- [ ] Pulsar «Confirmar valoración» en el panel, que deja registro de actor y fecha.

## 6. Jerarquía de fuentes aplicada

Orden usado, conforme a la sección 20 del pliego:

1. Fuente oficial RFEG → **microsite oficial del club en rfegolf.es** (usada).
2. Fuente oficial del Club de Golf Ulzama → pendiente (solicitar ficha en PDF).
3. Federación Navarra → no consultada; no publica fichas de valoración accesibles.
4. Proveedor autorizado → ninguno verificado (ver `docs/golf-data-providers.md`).
5. Ficha adjunta → conservada como histórica, no activa.
6. CSV / manual → disponible como vía de respaldo en el panel.

Ninguna fuente de mayor prioridad sustituye automáticamente una configuración ya
confirmada: el flujo obliga a mostrar diferencias, pedir confirmación, crear una
versión nueva y registrar auditoría antes de recalcular.
