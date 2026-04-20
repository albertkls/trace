#!/usr/bin/env bash
# Boot Trace backend + frontend together.  Ctrl-C stops both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "✗ backend/.venv not found — run 'make setup' first." >&2
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "✗ frontend/node_modules not found — run 'make setup' first." >&2
  exit 1
fi

cleanup() {
  echo
  echo "◆ stopping Trace…"
  [[ -n "${BACK_PID:-}" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "${FRONT_PID:-}" ]] && kill "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "◆ backend  → http://127.0.0.1:8787"
(cd "$BACKEND_DIR" && ./.venv/bin/trace-api --mode development --reload) &
BACK_PID=$!

echo "◆ frontend → http://127.0.0.1:5173"
(cd "$FRONTEND_DIR" && npm run dev --silent) &
FRONT_PID=$!

wait
