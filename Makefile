.PHONY: setup dev backend frontend reset test fmt clean

PY ?= python3.11
VENV := backend/.venv

setup: $(VENV) frontend/node_modules
	@echo "✓ Trace setup complete."

$(VENV):
	cd backend && $(PY) -m venv .venv && .venv/bin/pip install -U pip && .venv/bin/pip install -e '.[dev]'

frontend/node_modules:
	cd frontend && npm install

dev:
	@bash scripts/dev.sh

backend:
	cd backend && .venv/bin/trace-api

frontend:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest -q

fmt:
	cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .

reset:
	@echo "Removing ~/.trace/db.sqlite — will be re-seeded on next boot."
	rm -f $$HOME/.trace/db.sqlite

clean:
	rm -rf $(VENV) frontend/node_modules frontend/dist
