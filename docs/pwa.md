# PWA y service worker

## La política de caché es seguridad, no rendimiento

«No caches indiscriminadamente» suena a consejo de velocidad. Aquí no lo es.

Una respuesta privada guardada en la caché del navegador **sobrevive al cierre de
sesión** y sigue ahí cuando el móvil cambia de manos. El día del torneo, el móvil
del organizador va a cambiar de manos.

Lo que nunca se guarda:

- Autenticación, sesión, login y logout.
- Todo lo que empiece por `/admin` o `/api/admin`.
- La cola de sincronización y las exportaciones.
- **Las tarjetas, incluida la propia.** La tarjeta del jugador ya vive en
  IndexedDB con su cola de operaciones; duplicarla en la caché del navegador solo
  añade un sitio del que no se borra al cerrar sesión.
- La clasificación.

Y la regla que más protege a futuro: **cualquier ruta de `/api/` que no esté
declarada explícitamente como cacheable queda fuera.** Regla por omisión cerrada.
Si alguien añade `/api/jugadores/1/privado` el año que viene y no toca la
política, esa ruta no se cachea. Lo contrario —una lista negra con todo lo demás
permitido— haría que una ruta futura acabase cacheada por descuido.

Hay un test que lo comprueba con rutas inventadas.

## Qué sí se guarda

| Recurso | Estrategia | Motivo |
|---|---|---|
| `/_next/static/`, iconos, fuentes | caché primero | el nombre lleva el hash, no caduca |
| Datos del campo (`/api/course/`) | caché con revalidación | cambian cada varios años |
| Navegación | red primero, con reserva | si falla, pantalla sin conexión |
| CSS, JS, imágenes | caché primero | |

## Al cerrar sesión se borra lo personal y solo lo personal

La página manda un mensaje `LOGOUT_CLEAR` al service worker antes de redirigir. Se
borran las cachés de páginas y de datos; **no** la de recursos estáticos.

El motivo es práctico: los recursos estáticos no son de nadie, y obligar a
volver a descargarlos con mala cobertura es justo lo que no interesa el día del
torneo.

## La duplicación de la política, y cómo se controla

Un service worker no puede importar TypeScript. Las opciones eran meter un paso
de compilación solo para esto, o duplicar la lista de patrones.

Se ha duplicado, porque un paso de compilación extra añade más riesgo del que
quita. Pero la duplicación **no queda al azar**: hay un test que lee
`public/sw.js`, extrae la lista `NEVER_CACHE` entre los marcadores
`// INICIO NEVER_CACHE` y `// FIN NEVER_CACHE`, y la compara con la del módulo.

Comprobado que el guardián funciona de verdad: se modificó un patrón de `sw.js` a
propósito y el test falló. No es un test que pase por casualidad.

## Manifest

Formato vertical, `display: standalone`, colores tomados de los tokens de diseño
—hay un test que comprueba que no se han desincronizado—, e icono `maskable` de
512, porque sin él Android recorta el icono en un círculo y se come el borde.

Accesos directos a «Mi tarjeta» y «Clasificación», ambos verificados contra el
shell: un acceso directo a una ruta que no esté precacheada no funcionaría sin
conexión.

## Iconos

Fuente única: `assets/logo.png`, el escudo de la Peñita. Los PNG de
`public/icons/` se regeneran con `npm run gen:icons` y **no se editan a mano**.

| Archivo | Para qué |
|---|---|
| `icon-192.png` | Android e instalación genérica |
| `icon-512.png` | Pantalla de bienvenida y tiendas |
| `apple-touch-icon.png` (180) | iOS: no lee el manifest para el icono |
| `icon-maskable-512.png` | Android adaptativo |

### Dos cosas que había que arreglar del logo

**1. Las esquinas.** El logo venía con las esquinas ya redondeadas y un margen
blanco. iOS y Android aplican **su propia** máscara, así que un icono que ya
viene redondeado se redondea dos veces: queda un marco claro alrededor de un
cuadrado más pequeño, con aspecto de pegatina mal recortada.

Solución: las cuatro esquinas se rellenan con el navy del borde y el icono pasa
a ser un cuadrado a sangre. El sistema lo redondea una sola vez.

Detalle que apareció al mirar el resultado: el logo lleva un borde ligeramente
más claro en todo su perímetro, y al rellenar las esquinas se quedaba dentro
como un **contorno redondeado fantasma**. Se recorta un 2,5 % por cada lado antes
de escalar y desaparece.

**2. El texto del borde.** «PEÑITA» arriba y «ULZAMA-BARIAIN» abajo van pegados
al borde. Android recorta el icono maskable a un círculo que se come alrededor de
un 10 % por cada lado: ese texto desaparecería.

Solución: la versión maskable lleva el escudo al **70 %** y centrado. Y no es el
logo entero reducido —eso dejaba ver el cuadrado interior como una pegatina
encima—, sino el escudo **separado de su fondo por luminancia** (la crema está
en torno a 237 y el navy en torno a 75, así que un umbral de 150 basta) y puesto
sobre navy plano.

### Verificación

Cinco comprobaciones sobre los PNG generados, no sobre el código:

- Las cuatro esquinas de cada icono son navy opaco.
- El navy es exactamente el de la marca.
- La diagonal desde la esquina no tiene saltos de brillo: no hay halo.
- **Cero píxeles del escudo caen fuera del círculo que recorta Android.**
- Los vértices del escudo reducido son navy: el blanco del original no se cuela.

Comprobado que los guardianes funcionan: se puso el PNG original sin procesar
como icono y saltaron dos tests. No son tests que pasen por casualidad.

### Colores

El manifest y la barra de estado usan los colores del escudo, medidos sobre el
logo: navy `#364f6e` y crema `#f4edde`. Están en los tokens como
`--color-brand` y `--color-brand-ink`, con un test que comprueba que no se
desincronizan del manifest.

**La interfaz sigue en verde.** Es deliberado: se ha cambiado solo lo que se ve
al abrir desde la pantalla de inicio, que es lo que continúa el icono. Si se
quiere unificar, basta con apuntar `--color-accent` al navy de la marca en
`src/styles/tokens.css`.
