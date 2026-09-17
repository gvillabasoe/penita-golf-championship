# Investigación de proveedores de datos de campos

Fecha de investigación: **17 de septiembre de 2026**.
Objetivo: determinar si existe una API utilizable para obtener Valor de Campo,
Slope, par, stroke index y distancias oficiales de Ulzama, barras amarillas,
caballeros.

**Conclusión corta: no. La integración por API no procede para este proyecto.**
La fuente correcta es el microsite oficial de RFEG, consultado manualmente y
confirmado por el administrador. El repositorio mantiene el adaptador manual y la
importación por archivo, sin depender de ningún tercero.

---

## 1. RFEG (Real Federación Española de Golf)

| | |
|---|---|
| Fuente oficial | <https://rfegolf.es> |
| Tipo de acceso | Web pública (HTML). Área del jugador tras login en app.rfegolf.es |
| API pública documentada | **No se ha localizado ninguna** |
| Autenticación | Licencia federativa para el área del jugador |
| Datos disponibles en abierto | Ficha de club con las 8 tarjetas (par, `Hdcp`, metros, Vc, Vs) |
| Datos NO disponibles | Fecha de valoración, valoraciones de 9 hoyos, histórico |
| Coste | Gratuito para consulta web |
| Frecuencia de actualización | Desconocida; se actualiza cuando el club revaloriza |
| Viabilidad | **Consulta manual: alta. API: nula** |

No se afirma que exista una API privada: no se ha podido verificar. El Servidor
Central de Hándicaps gestiona los hándicaps de los jugadores, no es una fuente de
datos de campos, y su acceso es federativo, no público.

El microsite del club es la **fuente primaria** y contiene todo lo necesario salvo
la fecha de vigencia. Para eso, la vía es el propio club.

## 2. Club de Golf Ulzama

| | |
|---|---|
| Web | <http://www.golfulzama.com> |
| Reservas | plataforma iMaster Golf (members.imaster.golf/golfulzama) |
| Contacto | deportivo@golfulzama.com · 948 305 162 |
| API o datos estructurados | No se ha localizado ninguna |
| Viabilidad | **La vía correcta para pedir la ficha de valoración con fecha** |

## 3. Federación Navarra de Golf

No publica fichas de valoración accesibles ni API. No aporta nada sobre RFEG.

## 4. Proveedores comerciales

Existen, pero **ninguno se ha verificado como fuente fiable para este caso**. No
se ha comprobado que contengan la valoración oficial vigente de Ulzama amarillas
caballeros, y hay evidencia de lo contrario (ver sección 5).

| Proveedor | Acceso | Coste observado | Notas |
|---|---|---|---|
| GolfCourseAPI (golfcourseapi.com) | API, registro con email | Capa gratuita de prueba | ~30.000 campos declarados; cobertura española sin verificar |
| golfapi.io | API con documentación | Sin verificar | Declara par, índices, tees, distancias, slope y ratings; permite cachear |
| Golf Intelligence | API por créditos | 49 $ / 50 créditos de prueba; 399 $/mes plan inicial | Datos de StrackaGolf; 7 endpoints; incluye tarjetas multi-tee |
| SportsFirst | API + servicios | Sin publicar | Orientado a integraciones a medida |
| golf-course-database.com | Compra de BD + suscripción de actualizaciones | Sin verificar | Documentación de API de 2015, señal de abandono |

Ninguno es **fuente oficial**. Un proveedor comercial es, como máximo,
prioridad 4 en la jerarquía de la sección 20, por debajo de RFEG y del club.

## 5. Por qué los agregadores no sirven aquí

Evidencia concreta encontrada durante la investigación: GolfPass publica hoy para
Ulzama «rating 73,1 / slope 135». Esos son los valores de las barras **blancas**
de la ficha de **2014**. Dos errores a la vez: valoración obsoleta y barras
equivocadas.

Un dato que decide una clasificación no puede venir de ahí.

## 6. Scraping

**No se implementa.** El microsite de RFEG se ha consultado manualmente para esta
investigación, lo cual es una consulta normal de una página pública, pero el
producto no va a raspar rfegolf.es de forma automática y recurrente:

- No hay autorización.
- No hay API pública que respalde el uso.
- El dato cambia con una frecuencia de años, no de minutos: automatizarlo no
  aporta nada y añade un punto de fallo.

## 7. Decisión de arquitectura

Se mantiene la interfaz `GolfCourseDataProvider` prevista en la sección 22, con
**una sola implementación real: el adaptador manual** (introducción validada +
importación por CSV/JSON + snapshot con procedencia).

Cualquier proveedor externo se añadiría después, detrás de la misma interfaz, y
solo tras verificar que devuelve la valoración oficial vigente para este campo.
El funcionamiento principal de la aplicación **no depende de ninguna integración
externa**, tal como exige la sección 21.

Las claves de cualquier proveedor futuro irían solo en variables de entorno del
servidor: nunca en el cliente, nunca en el repositorio, nunca en el ZIP.
