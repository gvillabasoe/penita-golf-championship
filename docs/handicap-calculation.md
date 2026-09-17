# Cálculo de hándicap

## 1. Sistema vigente

España está en el **Sistema Mundial de Hándicap (WHS)**. La RFEG lo confirma en su
página de hándicap, donde habla del «nuevo hándicap mundial» y remite al Comité
Técnico de Campos y Hándicap para la gestión. La tabla de equivalencias EGA que
acompaña a la ficha adjunta (2014) pertenece al sistema anterior.

Esto importa por tres motivos:

1. La fórmula es la misma, y eso se ha podido **verificar** (sección 2).
2. El WHS introduce el concepto de **asignación de hándicap** por modalidad, que
   la tabla EGA de 2014 no contempla.
3. Los hándicaps plus se tratan de forma explícita.

## 2. Fórmula, verificada contra documento oficial

```
hándicap de campo (sin redondear) = HI × (Slope / 113) + (Vc − Par)
hándicap de juego                 = redondeo( hándicap de campo × asignación% )
```

La fórmula no se ha dado por buena: se ha **comprobado contra la Tabla de
Equivalencias EGA oficial de Ulzama** que viene en la ficha adjunta (páginas 3 y 4,
barras amarillas caballeros, Vc 72,2 / Slope 132 / Par 72).

Resultado: **los 64 intervalos transcritos del PDF cuadran, en ambos extremos y
decima a decima, sin una sola excepción** — incluidos los cinco tramos de hándicap
plus. Ver `src/lib/golf/__tests__/handicap.test.ts` y el fixture
`ega-table.fixture.ts`, que cita página y tabla de origen.

Es la mejor verificación disponible: un documento oficial de la RFEG para este
campo exacto usado como oráculo de la implementación.

> La extracción del PDF dejó un hueco entre la fila 44,8–45,6 → 53 y la fila
> 46,5–47,3 → 55. **No se ha inventado la fila que falta.** Lo que se comprueba es
> que el hueco no puede esconder una discontinuidad: la fórmula cubre 0,0–54,0 en
> tramos contiguos, sin saltos ni repeticiones, y el hueco corresponde a un único
> tramo que da 54. Si la tabla oficial tuviera ahí algo distinto, la fórmula
> habría fallado en alguna de las 64 filas que sí se leyeron.

## 3. Política de redondeo: decisión pendiente, y no es cosmética

Aquí hay una tensión real entre el pliego y el WHS literal:

| | Qué hace | Origen |
|---|---|---|
| `ROUND_ONCE` | Redondea **una sola vez**, al final: `round(raw × 95%)` | Sección 28 del pliego («redondea una sola vez») |
| `ROUND_TWICE` | Redondea el hándicap de campo, aplica el 95 % y vuelve a redondear | Lectura literal del WHS, donde el Course Handicap es un entero antes de aplicar la asignación |

Medido con el motor sobre la valoración vigente (Slope 139 / Vc 72,6, 95 %):

> Las dos políticas dan un hándicap de juego **distinto en 125 de los 541
> hándicaps exactos posibles** (del 0,0 al 54,0). Siempre por un solo golpe.

Un 23 % de probabilidad de discrepancia por jugador. Con 13 jugadores, es
prácticamente seguro que afecta a alguien, y un golpe de hándicap de juego mueve
un punto Stableford.

**Estado:** `ROUND_TWICE` activa. Sigue siendo configurable por competición
(`handicapRoundingPolicy`), queda registrada en `handicapRuleVersion` y el panel
puede listar exactamente qué hándicaps se verían afectados por un cambio
(`roundingPolicyDivergences`).

La lista completa de tramos afectados está generada por el propio motor en
[`rounding-divergence-table.md`](./rounding-divergence-table.md): 55 tramos, 37 de
ellos dentro del rango realista de la peña (0,0 a 36,0). ROUND_TWICE da un golpe
más en 74 casos y un golpe menos en 51.

### Decisión tomada: `ROUND_TWICE`

**Política activa desde el 17/09/2026**, autorizada por el organizador tras ver la
medición del impacto. El pliego original pedía `ROUND_ONCE` en su sección 28.

Motivo: es la lectura literal del WHS y es lo que calcula cualquier calculadora
WHS, además de lo que figura en el tablón del club. Si un jugador comprueba su
hándicap de juego por fuera y no le cuadra con la app, el problema aparece el día
del torneo.

Tranquilizador: **para los hándicaps de referencia el cambio no mueve nada.** Un
20,7 da hándicap de juego 25 con las dos políticas; scratch da 1 con las dos; un
+2,4 da −2 con las dos. La divergencia aparece en tramos concretos, no en todo el
rango.

Hay un test que fija la decisión (`la politica activa es ROUND_TWICE al 95 %`). Si
alguien la cambia en silencio, la suite falla. Cambiarla en serio requiere tocar
dos sitios y dejar constancia en el CHANGELOG:

- `DEFAULT_RULE_SET` en `src/lib/golf/handicap.ts`
- el valor por defecto de `Competition.handicapRoundingPolicy` en `prisma/schema.prisma`

Cada competición guarda su propia política en `handicapRuleVersion`, así que una
edición ya jugada no se ve afectada por un cambio posterior.

Lo que sí he hecho es impedir que la decisión se quede sin tomar: el campeonato
no puede pasar a estado «en juego» sin una versión de regla fijada, y cambiarla
con la vuelta empezada exige un motivo por escrito.

## 4. Asignación del 95 %

95 % es la asignación estándar del WHS para **Stableford individual**, y es lo que
aplican por defecto los sistemas de competición de clubes españoles. Confirmado en
varias fuentes secundarias consistentes entre sí, no en el texto normativo de la
RFEG, que no es público en abierto.

Queda como campo configurable (`handicapAllowancePercent`), con registro de quién
lo cambió y recálculo de todo lo afectado. No se modifica automáticamente después
de empezar.

## 5. Aritmética exacta

Ningún valor que decida una clasificación pasa por coma flotante.

- El hándicap exacto se almacena en **décimas enteras**: `20,7 → 207`.
- El Valor de Campo se almacena en **décimas enteras**: `72,6 → 726`.
- El cálculo se resuelve sobre un único entero exacto:

```
hándicap de campo × 1130 = HI_décimas × Slope + 113 × (Vc_décimas − 10 × Par)
```

Todos los redondeos se derivan de ese entero con `roundDiv`, que redondea al
entero más próximo alejando el 0,5 de cero, sin dividir en coma flotante.

Dos fallos reales encontrados por los tests durante el desarrollo:

- `roundDiv` devolvía `-0` cuando la magnitud era 0 y el signo negativo. `-0`
  sobrevive a `JSON.stringify`, entra en Postgres y rompe `Object.is`.
- El reparto de golpes para hándicaps plus devolvía `-0` por el mismo motivo.

Ambos corregidos, con test de regresión.

## 6. Reparto de golpes

Hándicap de juego ≥ 0 (sección 29 del pliego):

```
base      = floor(HJ / 18)
resto     = HJ mod 18
recibidos = base + (strokeIndex ≤ resto ? 1 : 0)
```

Invariante verificada para todo HJ entre −20 y 60: **el reparto suma exactamente
el hándicap de juego**.

Hándicap plus: el jugador **devuelve** golpes, y se asignan en orden inverso
empezando por el stroke index 18. Es la práctica estándar del WHS, pero **no se ha
podido localizar el texto normativo de la RFEG que lo fije**, así que está aislado
en una sola función, documentado aquí y marcado para revisión. Si ninguno de los
13 jugadores tiene hándicap plus, no llega a ejecutarse.

## 7. Recálculo

Cambiar hándicap exacto, Slope, Vc, par, porcentaje, política de redondeo,
modalidad o stroke index obliga a recalcular hándicap de campo, hándicap de juego,
golpes por hoyo, netos, puntos, totales y clasificación.

El recálculo es transaccional, deja auditoría y **no sobreescribe un override
manual del administrador sin avisar** (`isPlayingHandicapOverridden`,
`isOverridden` en `HoleScore`).
