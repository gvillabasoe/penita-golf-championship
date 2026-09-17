# Si algo falla

## Primero: `/api/diagnostico`

```
https://penita-golf-championship.vercel.app/api/diagnostico
```

Dice exactamente qué falta. Devuelve algo así:

```json
{
  "environment": { "DATABASE_URL": true, "DIRECT_URL": true, "AUTH_SECRET": false, "NEXT_PUBLIC_APP_URL": true },
  "database": { "state": "NO_TABLES" },
  "data": null,
  "ready": false,
  "nextStep": "La base de datos está vacía. Ejecuta: npx prisma migrate deploy, luego psql \"$DIRECT_URL\" -f prisma/sql/constraints.sql, y después npm run db:seed."
}
```

Es público a propósito: se necesita justo cuando la autenticación no funciona. No
devuelve mensajes de la base de datos, ni cadenas de conexión, ni trazas: solo
booleanos, recuentos y el siguiente paso.

## Los logs de Vercel

`/api/diagnostico` clasifica el fallo, pero el mensaje literal está en los logs:

- Panel de Vercel → el deployment → pestaña **Logs** (Runtime Logs).
- O desde la terminal: `vercel logs penita-golf-championship.vercel.app`.

## «Application error: a server-side exception has occurred»

Ese es el mensaje genérico de Next cuando algo revienta en el servidor. Con la
aplicación recién desplegada y la base de datos vacía, la causa es casi siempre
una de estas tres:

| `database.state` | Qué pasa | Qué hacer |
|---|---|---|
| `NO_URL` | Falta `DATABASE_URL` en Vercel | Añadirla (la cadena **con** `-pooler` de Neon) y volver a desplegar |
| `NO_TABLES` | Conecta pero no hay tablas | `npx prisma migrate deploy` + `constraints.sql` + `npm run db:seed` |
| `NO_ENGINE` | El motor de Prisma no viajó en el despliegue | Comprobar `binaryTargets` en `prisma/schema.prisma` y volver a desplegar **sin caché** |
| `UNREACHABLE` | No conecta | Revisar `DATABASE_URL`. Si el proyecto de Neon estaba dormido, recargar: el primer arranque tarda unos segundos |

### Crear las tablas: dos caminos

**Camino A, recomendado.** Un comando, sin SQL y sin archivos de migración:

```bash
npx prisma db push
```

`db push` lleva el esquema a la base de datos tal cual. No necesita shadow
database ni migraciones previas, y es exactamente para esto. Es el camino con
menos riesgo porque el SQL lo genera Prisma, no una persona.

(`migrate deploy` no sirve aquí: no hay archivos de migración en el repositorio,
deliberadamente. `migrate dev` los generaría, pero necesita una shadow database
en Neon y añade fricción que no hace falta.)

**Camino B, pegar SQL en Neon.** Si prefieres no instalar nada y ver exactamente
qué se crea:

1. Abre el editor SQL de Neon.
2. Pega **`prisma/sql/schema.sql`** entero y ejecútalo.
3. Pega **`prisma/sql/constraints.sql`** entero y ejecútalo.

Los dos van en una transacción y los dos son re-ejecutables: si algo falla no
queda nada a medias, y pegarlos dos veces no rompe nada.

`schema.sql` está **generado** desde el esquema por `npm run gen:sql`, no escrito
a mano: son 20 tablas, 255 campos y 24 claves foráneas, y transcribir eso a mano
es garantizar una errata. Hay 31 tests que comprueban que cubre cada modelo,
campo, enum, índice y relación, y que no añade nada.

Lo que esos tests **no** pueden comprobar es que PostgreSQL lo acepte: no hay
base de datos donde se generó. Pruébalo primero en una **rama de desarrollo de
Neon** — son instantáneas y desechables.

### Y después, en los dos casos

```bash
npm run db:seed && rm prisma/seed-credentials.json
```

Luego abre `/api/diagnostico` para comprobar que todo está.

Una nota si vas por el camino B: Prisma no sabrá que las tablas existen y avisará
de «drift» si algún día cambias el esquema. Para eso, `npx prisma db push`
reconcilia sin perder datos.

## Qué ve un jugador si algo falla a mitad de la vuelta

No una pantalla en blanco. La pantalla de error dice lo único que necesita saber:
**sus resultados están guardados en el móvil** y se enviarán solos. Con un botón
para reintentar y otro para volver a su tarjeta.

Eso es real, no un consuelo: la tarjeta se escribe en IndexedDB antes de intentar
la red. Un fallo del servidor no pierde un hoyo confirmado.

## Respaldo el día del torneo

Si algo se rompe y no hay tiempo de arreglarlo:

1. `/admin/exportacion` genera el PDF de cada tarjeta y de la clasificación.
2. Con eso se puede terminar el torneo a mano.

Y si la clasificación se bloquea a mitad de la revelación, es porque se corrigió
una tarjeta: reinicia la presentación desde `/admin/revelacion`. Los datos
deportivos no se tocan.
