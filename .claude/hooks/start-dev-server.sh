#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PORT=5173
LOG=/tmp/vite-dev.log

if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[start-dev-server] vite already listening on :$PORT"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "[start-dev-server] installing deps…"
  npm install --silent
fi

nohup npm run dev > "$LOG" 2>&1 &
disown
echo "[start-dev-server] vite booting on :$PORT (logs: $LOG)"
