#!/bin/sh
set -eu
# Resolve the project root from this script's location so a revive works no
# matter where the workspace is mounted (it is not always /workspace).
cd "$(dirname "$0")"

# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true

# Already healthy? Nothing to do.
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi

npm run dev >>/tmp/app-startup.log 2>&1 &
