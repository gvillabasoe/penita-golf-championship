# Pruebas de aceptación

Dos listas. La primera es automática y se ejecuta con `npm test`. La segunda hay
que hacerla a mano, en el campo, y es la que de verdad decide si el torneo sale
bien.

## 1. Cobertura automática

**206 tests, 38 suites, todas pasando.** Mapeo con las secciones del pliego:

| Sección | Suite de tests | Qué garantiza |
|---|---|---|
| 13 | `normalizacion de nombres`, `buscador del login` | Búsqueda sin tildes, por nombre, apellido o fragmento |
| 13, 66 | `hash de contrasenas`, `sesiones`, `limitacion de intentos de login` | Hash con salt, sesiones opacas, invalidación por epoch, límite de intentos |
| 14, 15 | `lista de participantes`, `idempotencia del seed`, `credenciales del seed` | 13 jugadores exactos, seed que nunca reescribe una contraseña |
| 17, 18, 24 | `datos del campo`, `deteccion de datos corruptos` | Par 72, SI 1–18 único, distancias, validaciones |
| 19, 20 | `comparacion de fuentes`, `confirmacion de la valoracion del campo` | No se activa una valoración sin revisar diferencias y confirmar |
| 26, 27, 30 | `cambio de reglas de calculo`, `puerta de arranque del campeonato` | Reglas congeladas, impacto calculado antes de aplicar |
| 28 | `formula del hándicap ... tabla EGA oficial`, `hándicap de juego`, `parseHandicapIndexToTenths`, `roundDiv` | Fórmula verificada contra documento oficial RFEG; aritmética exacta |
| 29 | `reparto de golpes` | Reparto correcto, incluidos plus; suma exacta del hándicap de juego |
| 31 | `puntos Stableford` | Escala completa, tope de 5, raya = 0 |
| 32, 33 | `resultado bruto` | Categoría del bruto independiente de los golpes recibidos |
| 35, 36, 44 | `navegacion por la tarjeta`, `resumen previo a confirmar`, `permisos de edicion` | Teclado 1–9 y raya, resumen previo, aviso de resultado raro |
| 37 | `totales de la tarjeta` | Ida, vuelta, total, y sin bruto falso cuando hay rayas |
| 38 | `estados de la tarjeta`, `finalizar la tarjeta` | No se finaliza con hoyos vacíos; la raya sí cuenta |
| 39 | `revision de tarjetas`, `estado de la revision` | Nadie valida la suya; la revisión caduca si cambia la tarjeta |
| 40, 61 | `visibilidad de tarjetas` | Antes de publicar, solo tu tarjeta y las de tu partido |
| 41, 42 | `cola sin conexion`, `estado de guardado`, `idempotencia en el servidor` | Ningún hoyo se pierde; reenviar es seguro |
| 43 | `conflictos`, `resolucion de conflictos` | Conflicto por hoyo, no por tarjeta; el jugador no pisa una corrección |
| 46 | `clasificacion` | Tres criterios, posiciones compartidas, sin desempate inventado |
| 48, 49 | `clasificacion` (orden de revelación, huella de snapshot) | Orden correcto, snapshot invalidado si cambia un resultado |
| 66 | `rechazos` | Autorización por sesión, no por el payload del cliente |

### Lo que la cobertura automática **no** cubre todavía

Nada de la capa de React, la PWA, el service worker, IndexedDB real, las
exportaciones ni el despliegue. La lógica está probada; la interfaz que la usará
no existe.

## 2. Comprobaciones manuales antes del torneo

### Configuración

- [ ] Confirmar la valoración del campo desde el panel. Sin esto no se puede
      empezar: lo impide una restricción en base de datos.
- [ ] Fijar la política de redondeo (ver `rounding-divergence-table.md`).
- [ ] Introducir los 13 hándicaps exactos y comprobar dos a mano contra la tabla
      del club.
- [ ] Sortear partidos, asignar horas y comprobar que nadie está en dos.

### En el campo, y esto es el importante

- [ ] **Recorrer los 18 hoyos comprobando dónde no hay cobertura.** Ulzama está
      en un valle con robledal; conviene saberlo antes, no el día del torneo.
- [ ] Apuntar una vuelta completa en modo avión y comprobar que al recuperar
      cobertura entran los 18 hoyos, sin duplicados y sin huecos.
- [ ] Cerrar la app a mitad de vuelta, volver a abrirla y comprobar que no se ha
      perdido nada.
- [ ] Probar el login de cada jugador desde su propio móvil. Los tamaños de
      pantalla y las versiones de navegador varían más de lo que parece.
- [ ] Leer la tarjeta al sol, de pie, con una mano. Si no se lee, no sirve.

### Durante y después

- [ ] Que un jugador revise la tarjeta de un compañero y comprobar que al
      corregir un hoyo después la revisión queda marcada como desactualizada.
- [ ] Corregir un hoyo desde el panel y comprobar que el jugador no puede pisarlo.
- [ ] Revelar la clasificación de prueba completa, incluido el podio.
- [ ] Corregir una tarjeta **a mitad de la revelación** y comprobar que se bloquea
      «revelar siguiente» y pide reiniciar con un snapshot actualizado.
- [ ] Exportar clasificación y tarjetas, y comprobar que la clasificación completa
      no se puede exportar antes de publicar.
- [ ] Borrar la vuelta de prueba y comprobar que la auditoría lo registra.
