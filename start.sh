#!/usr/bin/env bash
# Trace launcher — bootstrap deps if needed, boot backend + frontend together,
# tee prefixed logs to ./logs/, wait for backend health, optionally open browser.
# Ctrl-C stops everything cleanly.
#
# Usage:
#   ./start.sh              # start both (api + web)
#   ./start.sh --open       # ...and open the browser when ready
#   ./start.sh --api        # only backend
#   ./start.sh --web        # only frontend
#   ./start.sh --reinstall  # force re-run deps install
#   ./start.sh -h           # help

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
LOG_DIR="$ROOT/logs"

API_HOST="127.0.0.1"
API_PORT="8787"
WEB_HOST="localhost"   # vite binds to localhost by default; use it for browser-open
WEB_PORT="5173"
HEALTH_URL="http://${API_HOST}:${API_PORT}/api/health"
WEB_URL="http://${WEB_HOST}:${WEB_PORT}/"

PY="${PY:-python3.11}"

# ── args ──────────────────────────────────────────────────────────────────────
OPEN_BROWSER=0
REINSTALL=0
RUN_API=1
RUN_WEB=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --open)       OPEN_BROWSER=1 ;;
    --reinstall)  REINSTALL=1 ;;
    --api|--api-only)  RUN_WEB=0 ;;
    --web|--web-only)  RUN_API=0 ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# ── ansi ──────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_DIM=$'\033[2m'; C_RST=$'\033[0m'; C_BOLD=$'\033[1m'
  C_CYAN=$'\033[36m'; C_MAG=$'\033[35m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'
else
  C_DIM=""; C_RST=""; C_BOLD=""; C_CYAN=""; C_MAG=""; C_GREEN=""; C_RED=""
fi

log()   { printf "%s◆%s %s\n" "$C_CYAN" "$C_RST" "$*"; }
warn()  { printf "%s!%s %s\n" "$C_MAG"  "$C_RST" "$*"; }
fail()  { printf "%s✗%s %s\n" "$C_RED"  "$C_RST" "$*" >&2; exit 1; }
ok()    { printf "%s✓%s %s\n" "$C_GREEN" "$C_RST" "$*"; }

# ── port hygiene ──────────────────────────────────────────────────────────────
free_port() {
  local port="$1" name="$2"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  [[ -z "$pids" ]] && return 0
  warn "port $port busy (${name}) → killing: $pids"
  kill $pids 2>/dev/null || true
  sleep 0.4
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
}

# ── bootstrap ─────────────────────────────────────────────────────────────────
bootstrap_backend() {
  if [[ $REINSTALL -eq 1 || ! -x "$BACKEND_DIR/.venv/bin/trace-api" ]]; then
    log "backend · creating venv ($PY) + installing deps"
    command -v "$PY" >/dev/null 2>&1 \
      || fail "python interpreter '$PY' not found — install it, or run: PY=python3 ./start.sh"
    (cd "$BACKEND_DIR" \
      && "$PY" -m venv .venv \
      && ./.venv/bin/pip install -U pip >/dev/null \
      && ./.venv/bin/pip install -e '.[dev]' >/dev/null)
    ok "backend deps ready"
  fi
}

bootstrap_frontend() {
  if [[ $REINSTALL -eq 1 || ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "frontend · npm install"
    command -v npm >/dev/null 2>&1 || fail "npm not found — install Node.js first"
    (cd "$FRONTEND_DIR" && npm install --silent)
    ok "frontend deps ready"
  fi
}

# ── runner: prefixed, colored, tee'd to logs/ ─────────────────────────────────
#   Usage: run_prefixed <label> <color> <logfile> -- <cmd...>
run_prefixed() {
  local label="$1" color="$2" logfile="$3"
  shift 3
  [[ "$1" == "--" ]] && shift
  # start cmd in its own process group so we can nuke children on exit
  (
    set +e
    "$@" 2>&1 | while IFS= read -r line; do
      printf "%s[%s]%s %s\n" "$color" "$label" "$C_RST" "$line"
      printf "%s\n" "$line" >> "$logfile"
    done
  ) &
}

# ── readiness waits ───────────────────────────────────────────────────────────
wait_for_url() {
  local url="$1" tries="${2:-60}"  # default ~30s @ 0.5s
  while (( tries-- > 0 )); do
    if curl -sf -o /dev/null "$url"; then return 0; fi
    sleep 0.5
  done
  return 1
}

# ── cleanup ───────────────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  echo
  log "stopping Trace…"
  # kill our children + their groups
  for pid in "${PIDS[@]:-}"; do
    [[ -n "$pid" ]] && kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
  # also flush any stragglers on our ports
  free_port "$API_PORT" api >/dev/null 2>&1 || true
  free_port "$WEB_PORT" web >/dev/null 2>&1 || true
  wait 2>/dev/null || true
  ok "bye."
}
trap cleanup EXIT INT TERM

# ── go ────────────────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
printf "\n%s%sTrace%s %s· launcher%s\n" "$C_BOLD" "$C_CYAN" "$C_RST" "$C_DIM" "$C_RST"

(( RUN_API )) && bootstrap_backend
(( RUN_WEB )) && bootstrap_frontend

if (( RUN_API )); then
  free_port "$API_PORT" api
  log "backend  → http://${API_HOST}:${API_PORT}   log → logs/backend.log"
  : > "$LOG_DIR/backend.log"
  run_prefixed api "$C_CYAN" "$LOG_DIR/backend.log" -- \
    bash -c "cd '$BACKEND_DIR' && exec ./.venv/bin/trace-api"
  PIDS+=("$!")

  if ! wait_for_url "$HEALTH_URL"; then
    warn "backend didn't answer /api/health in time — see logs/backend.log"
  else
    ok "backend healthy"
  fi
fi

if (( RUN_WEB )); then
  free_port "$WEB_PORT" web
  log "frontend → ${WEB_URL}                log → logs/frontend.log"
  : > "$LOG_DIR/frontend.log"
  run_prefixed web "$C_MAG" "$LOG_DIR/frontend.log" -- \
    bash -c "cd '$FRONTEND_DIR' && exec npm run dev --silent"
  PIDS+=("$!")
fi

if (( OPEN_BROWSER && RUN_WEB )); then
  # wait until vite actually serves, then open the browser
  (if wait_for_url "$WEB_URL" 40; then
     if   command -v open     >/dev/null 2>&1; then open "$WEB_URL"
     elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$WEB_URL"
     fi
   fi) &
fi

printf "%s%s──%s  ready. Ctrl-C to stop.\n\n" "$C_DIM" "$C_DIM" "$C_RST"
wait
