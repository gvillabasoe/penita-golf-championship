#!/bin/bash
# Comprueba que todos los archivos mencionados en el repositorio existen.
#
# Nacio de un fallo real: package.json tenia un script `gen:icons` apuntando a
# scripts/generate-icons.ts, que no existia, y el manifest declaraba tres iconos
# que tampoco. Nada de eso lo detectaban los tests.
#
#   npm run check:refs
set -u

# Archivos que se mencionan a proposito y NO deben existir en el repositorio.
EXCLUIDOS="prisma/seed-credentials.json"

# Documentos cuyo contenido es, por definicion, una lista de archivos que
# todavia no existen. Escanearlos daria falsos positivos.
#
# docs/lo-que-falta.md enumera lo que queda por escribir. Cuando esos archivos
# existan, el documento se queda corto, no el comprobador.
FUENTES_EXCLUIDAS="docs/lo-que-falta.md"

faltan=0
for ref in $(grep -rhoE '(src|docs|prisma|public|scripts|data)/[A-Za-z0-9_./-]+\.(ts|tsx|md|json|sql|css|js|prisma|webmanifest|png|svg|sh)' \
    --exclude="$(basename "$FUENTES_EXCLUIDAS")" \
    README.md CHANGELOG.md docs/ package.json src/ prisma/ scripts/ 2>/dev/null \
    | sed 's/[.,;:)]*$//' | sort -u); do
  case " $EXCLUIDOS " in *" $ref "*) continue ;; esac
  if [ ! -e "$ref" ]; then
    echo "FALTA: $ref"
    faltan=$((faltan + 1))
  fi
done

# Recursos que declara el manifest de la PWA.
if [ -f public/manifest.webmanifest ]; then
  for src in $(grep -oE '"src": *"/[^"]+"' public/manifest.webmanifest | sed 's/.*"\/\(.*\)"/\1/'); do
    if [ ! -e "public/$src" ]; then
      echo "FALTA (manifest): public/$src"
      faltan=$((faltan + 1))
    fi
  done
fi

if [ "$faltan" -eq 0 ]; then
  echo "Sin referencias rotas."
  exit 0
fi
echo "---"
echo "referencias rotas: $faltan"
exit 1
