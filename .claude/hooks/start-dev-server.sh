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

# Install when deps are missing OR the lockfile changed since the last install
# (npm copies the lockfile to node_modules/.package-lock.json on install). This
# catches branches/pulls that add or bump dependencies — a plain existence check
# would skip them and leave new packages unresolved.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "[start-dev-server] installing deps…"
  npm install --silent
fi

nohup npm run dev > "$LOG" 2>&1 &
disown
echo "[start-dev-server] vite booting on :$PORT (logs: $LOG)"
