# Despliegue

Estado: **pendiente de ejecutar**. Este documento describe el procedimiento; no
se ha ejecutado desde el entorno donde se generó el código porque no tiene red.

## 1. Neon

Crear proyecto y base de datos. Copiar las dos cadenas de conexión:

- `DATABASE_URL`: la de **pooling** (`-pooler` en el host). La usa la aplicación.
- `DIRECT_URL`: la **directa**, sin pooler. La usan las migraciones de Prisma.

Usar las dos no es opcional con Neon: `prisma migrate` sobre el pooler falla o se
comporta de forma errática porque necesita sesiones con estado.

## 2. Variables de entorno

```bash
cp .env.example .env
# Rellenar DATABASE_URL y DIRECT_URL desde Neon
openssl rand -base64 32   # -> AUTH_SECRET
```

## 3. Instalación y migración

```bash
npm install
npx prisma migrate dev --name init    # genera la migración inicial canónica
npm run db:constraints                # aplica prisma/sql/constraints.sql
npm run db:seed                       # ver docs/seed-credentials.md
npm run typecheck && npm test
npm run build
```

Dos avisos honestos sobre este bloque:

- **La migración inicial no está en el repositorio.** La genera `prisma migrate
  dev` contra tu base de datos. Escribirla a mano sin un PostgreSQL donde
  validarla habría metido en el repo un archivo que se aplica solo y que nadie ha
  comprobado. Es el tipo de fichero que rompe una base de datos de producción.
- **`prisma/sql/constraints.sql` tampoco se ha ejecutado nunca.** Aplícalo
  primero contra una rama de desarrollo de Neon. Las ramas de Neon son
  instantáneas y desechables, así que es gratis comprobarlo.

## 4. Vercel

- Importar el repositorio.
- Añadir `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` y `NEXT_PUBLIC_APP_URL`.
- El comando de build ya es `prisma generate && next build` (en `package.json`).
- Región: Frankfurt (`fra1`) o París (`cdg1`), la que esté más cerca de la región
  de Neon. Un torneo se juega en una mañana: la latencia entre la función y la
  base de datos se nota más que la que hay hasta el móvil.

### Argon2id en Vercel

`@node-rs/argon2` está declarado como dependencia **opcional** y en
`serverComponentsExternalPackages`. Si se instala correctamente en Vercel:

1. Cambiar `PREFERRED_ALGORITHM` a `'argon2id'` en `src/lib/auth/password.ts`.
2. Los hashes scrypt existentes siguen validando, y `needsRehash()` los marca
   para reescribirse tras el siguiente login correcto.

Ningún jugador tiene que hacer nada. Ver la cabecera de `password.ts` para el
razonamiento completo de la desviación.

## 5. Comprobación previa al torneo

Con la app desplegada y antes del día:

- [ ] Confirmar la valoración del campo desde el panel (sin esto no se puede
      empezar: hay una restricción en base de datos que lo impide).
- [ ] Fijar la política de redondeo. Ver `docs/rounding-divergence-table.md`.
- [ ] Introducir los 13 hándicaps exactos.
- [ ] Sortear partidos y poner horas de salida.
- [ ] Probar el login de cada jugador desde su propio móvil, en el campo, con
      cobertura real. Ulzama está en un valle: conviene saber de antemano dónde
      no hay señal.
- [ ] Probar la vuelta completa de un jugador de prueba y borrarla después.
