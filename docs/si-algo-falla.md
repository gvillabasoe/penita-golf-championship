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

### El orden correcto de puesta en marcha

Con la base de datos de producción ya creada en Neon:

```bash
# 1. Variables en Vercel: DATABASE_URL, DIRECT_URL, AUTH_SECRET, NEXT_PUBLIC_APP_URL
# 2. Migración (contra la base de PRODUCCIÓN, con DIRECT_URL en el entorno local)
npx prisma migrate deploy

# 3. Restricciones que Prisma no expresa
psql "$DIRECT_URL" -f prisma/sql/constraints.sql

# 4. Seed
npm run db:seed && rm prisma/seed-credentials.json
```

`migrate deploy` y no `migrate dev`: en producción no se generan migraciones, se
aplican las que ya existen.

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
