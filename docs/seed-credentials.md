# Credenciales iniciales del seed

## Por qué no están en el repositorio

La sección 15 del pliego lo exige: las contraseñas iniciales solo pueden usarse
para generar hashes, y no pueden aparecer en el repositorio, ni en el README, ni
en el CHANGELOG, ni en los tests, ni en el ZIP.

Por eso `src/lib/seed/roster.ts` contiene los 13 nombres y **ninguna contraseña**.
Tampoco contiene el patrón para deducirlas: escribir en el código
`inicial + apellido + índice` equivaldría a guardar las contraseñas.

## Cómo ejecutar el seed

**El archivo no existe en el repositorio. Lo creas tú.** Está en `.gitignore`
precisamente porque contiene contraseñas, así que no viene al clonar.

La forma rápida:

```bash
cp prisma/seed-credentials.example.json prisma/seed-credentials.json
# abre el archivo, rellena las 13 contraseñas
npm run db:seed
rm prisma/seed-credentials.json
```

La plantilla trae los 13 slugs con valores vacíos y hay un test que comprueba
que son exactamente los del roster y que ninguno lleva contraseña.

Si intentas ejecutar el seed sin el archivo, el error imprime la plantilla lista
para copiar, así que no hace falta venir aquí a buscar los slugs.

El contenido, para referencia:

```json
{
  "gvillabaso": "...",
  "apagadi": "...",
  "jolabarri": "...",
  "liribarren": "...",
  "gsuarez": "...",
  "prodriguezrey": "...",
  "iurzay": "...",
  "azabala": "...",
  "jcancio": "...",
  "tmolina": "...",
  "gayesa": "...",
  "sguerra": "...",
  "mpalomino": "..."
}
```

Las claves son los `slug` de `roster.ts`, no los nombres. Después:

```bash
npm run db:seed
rm prisma/seed-credentials.json   # borra el archivo en cuanto termine
```

Si prefieres no crear el archivo, apunta `SEED_CREDENTIALS_FILE` a una ruta fuera
del proyecto:

```bash
SEED_CREDENTIALS_FILE=~/.config/pgc/credenciales.json npm run db:seed
```

## Garantía de idempotencia

El seed **solo establece contraseña al crear un usuario**. Nunca la reescribe.

Consecuencia práctica: si Alfonso cambia la suya y alguien vuelve a ejecutar el
seed, la de Alfonso sigue siendo la que él eligió. No hace falta detectar si fue
modificada, porque nunca se toca. Hay un test que comprueba exactamente esto
(`ningun plan contiene una accion que reescriba una contrasena existente`).

El seed tampoco borra usuarios que no estén en la lista, ni reactiva a nadie
desactivado, ni cambia roles asignados a mano. Todo eso lo reporta como
divergencia por consola y lo deja como está.

## Las contraseñas del pliego: decisión tomada

**Se mantienen las 13 contraseñas de la sección 14.** Decidido por el organizador
el 17/09/2026. Este apartado queda como constancia de lo que se sabía al
decidirlo, no como una propuesta pendiente.

Siguen un patrón predecible: inicial del nombre, apellido y un índice. Quien
conozca la suya puede deducir las otras doce, y la lista de participantes es
pública dentro de la peña.

Para este torneo es una decisión razonable. Lo peor que puede pasar es que alguien
entre con la cuenta de otro, y contra eso hay tres cosas que ya están puestas:

- **Toda escritura queda auditada** con actor, fecha, valor anterior y valor
  nuevo. Una tarjeta tocada por quien no debía se ve en el historial.
- **La revisión cruzada.** Una tarjeta la valida otro jugador del mismo partido, y
  si cambia después de revisarse, la revisión queda marcada como desactualizada y
  hace falta otra antes de bloquearla.
- **El bloqueo.** Una vez bloqueada la tarjeta, el jugador no puede escribir.

Con trece amigos que se conocen, el riesgo real es un despiste, no un ataque. Y
un despiste se detecta con la auditoría.

Lo que cambiaría la valoración: si el enlace de la app llegase a circular fuera
de la peña. En ese caso, el arreglo son 13 contraseñas aleatorias en el archivo
de credenciales y volver a ejecutar el seed sobre una base vacía. Cero cambios de
código.
