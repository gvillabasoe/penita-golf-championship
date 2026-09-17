# Lo que falta para estar al 100 %

Estado a 17/09/2026. **427 tests, 83 suites, todos pasando.**

**La aplicación está completa.** Lo que queda son cuatro pasos de puesta en
marcha, no código, y todos están detallados en
[`primer-despliegue.md`](./primer-despliegue.md).

---

## Los cuatro pasos

| Paso | Comando | Dónde |
|---|---|---|
| 1. Dependencias | `npm install && npx prisma generate` | tu máquina |
| 2. Migración | `npx prisma migrate dev --name init` + `constraints.sql` | Neon |
| 3. Seed | `npm run db:seed` con las credenciales fuera del repo | tu máquina |
| 4. Despliegue | importar en Vercel con las 4 variables | Vercel |

---

## Qué está verificado y qué no

Conviene tenerlo claro antes del primer build.

### Verificado: 427 tests y type-check estricto

`src/lib/golf`, `src/lib/auth` (menos `server.ts`), `src/lib/seed`,
`src/lib/scorecard`, `src/lib/sync`, `src/lib/admin`, `src/lib/reveal`,
`src/lib/export`, `src/lib/pwa`, `src/lib/http`, `src/lib/storage`.

Ahí está todo lo que decide algo: hándicaps, Stableford, desempates,
autorización, idempotencia, conflictos, persistencia, permisos de exportación,
política de caché.

### Verificado renderizando: 40 tests

`src/components/*.tsx`. Se renderizan con React 19 y se comprueba el marcado.
No se **type-checkean**: `@types/react` necesita `npm install`.

### Verificado como política, no compilado

Las 26 rutas están declaradas en `src/lib/http/routes.ts` con su nivel de acceso,
y hay un guardián que compara el manifiesto con los archivos reales de
`src/app`. Comprobado rompiéndolo a propósito: si aparece una ruta sin declarar,
la suite falla.

### No compilado

- Los 16 `page.tsx` y los 10 `route.ts`.
- `src/lib/db.ts`, `src/lib/data/queries.ts`, `src/lib/actions/*`,
  `src/lib/auth/server.ts`: necesitan el cliente de Prisma generado.
- `src/middleware.ts`.

Todo eso son envoltorios finos sobre funciones probadas. Donde es más probable
que salte `tsc` es en nombres de campos de Prisma, campos `Json` y conversiones
de enums. Son errores de tipos, no de lógica.

### Nunca ejecutado contra un PostgreSQL

`prisma/sql/constraints.sql`. Aplícalo primero contra una rama de desarrollo de
Neon: son instantáneas y desechables.

### Nunca ejecutado en un navegador

`src/lib/storage/indexeddb.ts`, 70 líneas de fontanería. Se mantuvo pequeño a
propósito. La lógica que hay detrás tiene 23 tests. Se comprueba apuntando una
vuelta en modo avión, cerrando la app a mitad y reabriéndola.

---

## Decisiones: todas cerradas

| Decisión | Estado |
|---|---|
| Política de redondeo | ✅ `ROUND_TWICE` |
| Valoración del campo | ✅ 72,6 / 139, confirmada con actor y fecha |
| Fecha de vigencia | ✅ julio de 2024, confirmada |
| Contraseñas iniciales | ✅ se mantienen las del pliego |
| Tercer criterio de desempate | ✅ golpes ajustados, rayas como doble bogey neto |

---

## Lo único que no depende de ti ni de mí

**Recorrer los 18 hoyos comprobando dónde no hay cobertura.** Ulzama es un valle
con robledal, y toda la arquitectura offline está construida sobre esa
suposición. Merece la pena saberlo antes del día del torneo.
