#!/bin/sh
# Fetches ffmpeg.wasm for running the server without Docker.
# The Dockerfile does this itself, so this is only for local development.
set -eu
FFMPEG_WASM=0.12.15
FFMPEG_CORE=0.12.10
DIR="$(dirname "$0")/public/vendor"
mkdir -p "$DIR"
curl -fsSL -o "$DIR/ffmpeg.js"        "https://unpkg.com/@ffmpeg/ffmpeg@$FFMPEG_WASM/dist/umd/ffmpeg.js"
curl -fsSL -o "$DIR/ffmpeg-core.js"   "https://unpkg.com/@ffmpeg/core@$FFMPEG_CORE/dist/umd/ffmpeg-core.js"
curl -fsSL -o "$DIR/ffmpeg-core.wasm" "https://unpkg.com/@ffmpeg/core@$FFMPEG_CORE/dist/umd/ffmpeg-core.wasm"
echo "vendored ffmpeg.wasm into $DIR"
