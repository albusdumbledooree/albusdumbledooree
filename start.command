#!/bin/sh
# macOS / Linux: ikki marta bosib ishga tushirish
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "XATO: Node.js o'rnatilmagan. https://nodejs.org saytidan LTS versiyani o'rnating."
  read -r _; exit 1
fi
(sleep 2; open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) &
node --no-warnings server/index.js
