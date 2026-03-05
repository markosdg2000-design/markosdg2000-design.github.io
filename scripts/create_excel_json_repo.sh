#!/usr/bin/env bash
set -euo pipefail

DEST="${1:-}"

if [[ -z "$DEST" ]]; then
  echo "Uso: $0 <ruta-destino>"
  exit 1
fi

mkdir -p "$DEST"
cp index.html "$DEST/index.html"

cat > "$DEST/README.md" <<'README'
# Excel a JSON | ES05/ES0304

App web estática para convertir archivos Excel (material grande y mediano) a JSON.

## Ejecutar en local

Como es una app estática, basta con abrir `index.html` en navegador.
Si quieres evitar restricciones de seguridad del navegador para archivos locales:

```bash
python3 -m http.server 4173
```

Y abrir `http://localhost:4173`.
README

if [[ ! -d "$DEST/.git" ]]; then
  git -C "$DEST" init -b main >/dev/null
fi

git -C "$DEST" add index.html README.md
git -C "$DEST" commit -m "Initial commit: Excel to JSON web app" >/dev/null || true

echo "Repositorio creado en: $DEST"
