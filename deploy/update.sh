#!/usr/bin/env bash
# One-command update on the server:   sudo /opt/choyxona/deploy/update.sh
#  1. backup of every database      4. restart the service
#  2. download the new version      5. check the site answers
#  3. run the tests                 6. if anything fails — go back to the previous version
# Data in data/ is never touched by the update itself; open devices reload by themselves.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/choyxona}"
APP_USER="${APP_USER:-choyxona}"
SERVICE="${SERVICE:-choyxona}"
PORT="${PORT:-3000}"
# Every git command runs as the app user, who owns the folder (git refuses a folder owned by someone else).
as_app() { sudo -u "$APP_USER" -H "$@"; }
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

cd "$APP_DIR"
BRANCH="${BRANCH:-$(as_app git rev-parse --abbrev-ref HEAD)}"
PREV="$(as_app git rev-parse HEAD)"

say "1/6 Zaxira nusxa olinmoqda"
as_app node --no-warnings scripts/backup.js

say "2/6 Yangi versiya yuklanmoqda ($BRANCH)"
# A steadier download: plain HTTP/1.1 (a long HTTP/2 stream breaks on weak links), and big files the program never
# uses (videos, pictures over 1 MB in the history) are not downloaded at all; three tries when the line drops.
as_app git config http.version HTTP/1.1
as_app git config remote.origin.promisor true
as_app git config remote.origin.partialclonefilter blob:limit=1m
fetched=0
for try in 1 2 3; do
  if as_app git fetch --quiet origin "$BRANCH"; then fetched=1; break; fi
  echo "Aloqa uzildi — qayta urinish ($try/3)…"; sleep 5
done
[ "$fetched" = 1 ] || { echo "Yangi versiyani yuklab bo'lmadi (internet). Sayt eski versiyada ishlayapti, hech narsa o'zgarmadi."; exit 1; }
NEXT="$(as_app git rev-parse "origin/$BRANCH")"
if [ "$PREV" = "$NEXT" ]; then
  echo "Yangi versiya yo'q — hammasi joyida."
  exit 0
fi
as_app git merge --ff-only --quiet "origin/$BRANCH"

rollback() {
  say "XATO: eski versiyaga qaytarilmoqda ($PREV)"
  as_app git reset --hard --quiet "$PREV"
  systemctl restart "$SERVICE"
  echo "Eski versiya qayta ishga tushirildi. Ma'lumotlar joyida (zaxira: data/backups/)."
  exit 1
}

say "3/6 Testlar"
as_app npm test --silent >/tmp/flowi-update-test.log 2>&1 || { tail -40 /tmp/flowi-update-test.log; rollback; }

say "4/6 Xizmat qayta ishga tushirilmoqda"
systemctl restart "$SERVICE"

say "5/6 Sayt tekshirilmoqda"
ok=0
for _ in $(seq 1 20); do
  sleep 1
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then ok=1; break; fi
done
[ "$ok" = 1 ] || rollback

say "6/6 Tayyor: FLOWI v$(node -p "require('./package.json').version") — $(as_app git log -1 --format='%h %s')"
echo "Ochiq qurilmalar bo'sh paytida o'zi yangilanadi (yuborilmagan buyurtma yo'qolmaydi)."
