#!/usr/bin/env bash
# Start Trace development environment: backend + frontend
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
VENV="$BACKEND_DIR/.venv"
PY="${PY:-python3.11}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}◆${NC} $*"; }
success() { echo -e "${GREEN}✓${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}✗${NC} $*" >&2; }

# Auto-setup if needed
setup_if_needed() {
  local needs_setup=false

  if [ ! -d "$VENV" ]; then
    info "Creating backend virtualenv..."
    (cd "$BACKEND_DIR" && "$PY" -m venv .venv) || return 1
    needs_setup=true
  fi

  if [ ! -f "$VENV/bin/trace-api" ]; then
    needs_setup=true
  fi

  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    info "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install) || return 1
    needs_setup=true
  fi

  if $needs_setup; then
    info "Installing backend dependencies..."
    (cd "$BACKEND_DIR" && "$VENV/bin/pip install -U pip >/dev/null 2>&1) || return 1
    (cd "$BACKEND_DIR" && "$VENV/bin/pip install -e '.[dev,desktop]' >/dev/null 2>&1) || return 1
    success "Setup complete"
  fi
}

# Check prerequisites
check_prereq() {
  if ! command -v "$PY" >/dev/null 2>&1; then
    error "Python 3.11 not found. Set PY env var to your python3.11 path."
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    error "npm not found."
    exit 1
  fi
}

# Cleanup on exit
cleanup() {
  echo
  info "Shutting down Trace..."
  [[ -n "${BACK_PID:-}" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "${FRONT_PID:-}" ]] && kill "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  success "Stopped"
}

# Wait for backend to be ready
wait_for_backend() {
  local max_wait=30
  local count=0
  while ! curl -s "http://127.0.0.1:8787/health" >/dev/null 2>&1; do
    sleep 0.5
    count=$((count + 1))
    if [ $count -ge $max_wait ]; then
      error "Backend failed to start within ${max_wait}s"
      return 1
    fi
  done
}

# Main
check_prereq
setup_if_needed

trap cleanup EXIT INT TERM

echo
echo -e "${BOLD}Starting Trace...${NC}"
echo

# Start backend
info "Backend  → http://127.0.0.1:8787"
(cd "$BACKEND_DIR" && "$VENV/bin/trace-api" --mode development --reload) &
BACK_PID=$!

# Wait for backend
wait_for_backend && success "Backend ready"

# Start frontend
info "Frontend → http://127.0.0.1:5173"
(cd "$FRONTEND_DIR" && npm run dev --silent) &
FRONT_PID=$!

echo
success "Trace is running"
echo
echo -e "  ${BOLD}Web UI${NC}   http://127.0.0.1:5173"
echo -e "  ${BOLD}API${NC}      http://127.0.0.1:8787"
echo
echo -e "Press ${BOLD}Ctrl+C${NC} to stop"
echo

wait
