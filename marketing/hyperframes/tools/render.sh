#!/bin/sh
# FLOWI reels: voice → build → audio → render. Run from marketing/hyperframes.
#   sh tools/render.sh           (uses the voice files already in flowi-reels/assets)
set -e
OUT=../instagram
node tools/build.js
for r in r1 r2; do
  python3 tools/audio.py flowi-reels/assets $r
  cp reels-src/$r.html flowi-reels/index.html
  (cd flowi-reels && npx hyperframes render -q delivery -o "$PWD/../$OUT/.tmp-$r.mp4" --quiet)
  case $r in r1) n=r1-kassa ;; r2) n=r2-buyurtma-yoli ;; esac
  ffmpeg -y -loglevel error -i $OUT/.tmp-$r.mp4 -c:v copy -c:a aac -b:a 192k -movflags +faststart $OUT/$n.mp4
  ffmpeg -y -loglevel error -i $OUT/.tmp-$r.mp4 -i flowi-reels/assets/$r-nomusic.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $OUT/$n-musiqasiz.mp4
  rm -f $OUT/.tmp-$r.mp4
  echo "$n ok"
done
