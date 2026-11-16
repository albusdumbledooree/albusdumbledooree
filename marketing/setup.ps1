# FLOWI marketing: video asboblarini bitta buyruq bilan o'rnatish (Windows).
# PowerShell'da repo ildizidan:  powershell -ExecutionPolicy Bypass -File marketing\setup.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Need($cmd, $id) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { winget install -e --id $id --accept-source-agreements --accept-package-agreements } }
Need ffmpeg  Gyan.FFmpeg
Need node    OpenJS.NodeJS.LTS
Need python  Python.Python.3.12
Need git     Git.Git
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
python -m pip install -q edge-tts numpy opencv-python-headless mediapipe
Push-Location "$here\hyperframes"
npm ci --no-audit --no-fund
npx hyperframes browser ensure
try { npx hyperframes skills | Out-Null } catch {}
Pop-Location
$m = Join-Path $HOME ".cache\hyperframes\whisper\models"; New-Item -ItemType Directory -Force $m | Out-Null
foreach ($n in "small","medium") {
  $f = Join-Path $m "ggml-$n.bin"
  if (-not (Test-Path $f)) { curl.exe -sSL --retry 4 -o $f "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$n.bin" }
}
Write-Host "TAYYOR: ffmpeg, HyperFrames+GSAP, skill'lar, edge-tts, OpenCV, MediaPipe, Whisper (small, medium)."
