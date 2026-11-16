#!/usr/bin/env bash
# FLOWI marketing: video asboblarini bitta buyruq bilan o'rnatish (Linux / macOS / bulut sessiya).
# Ishga tushirish: bash marketing/setup.sh   (repo ildizidan yoki istalgan joydan)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v ffmpeg >/dev/null || { command -v apt-get >/dev/null && sudo apt-get install -y ffmpeg || brew install ffmpeg; }
python3 -m pip install -q --break-system-packages edge-tts numpy opencv-python-headless mediapipe 2>/dev/null \
  || python3 -m pip install -q edge-tts numpy opencv-python-headless mediapipe
cd "$HERE/hyperframes"
npm ci --no-audit --no-fund
npx hyperframes browser ensure
npx hyperframes skills >/dev/null 2>&1 || true   # HyperFrames + GSAP skill'lari (Claude Code uchun)
M="$HOME/.cache/hyperframes/whisper/models"; mkdir -p "$M"
for m in small medium; do
  [ -s "$M/ggml-$m.bin" ] || curl -sSL --retry 4 -o "$M/ggml-$m.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$m.bin"
done
echo "TAYYOR: ffmpeg, HyperFrames+GSAP, skill'lar, edge-tts, OpenCV, MediaPipe, Whisper (small, medium)."
