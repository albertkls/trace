from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient

from trace_api.config import reset_settings_cache
from trace_api.main import create_app


def test_frontend_static_fallback(tmp_path: Path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>trace-release</body></html>", encoding="utf-8")
    (dist / "app.js").write_text("console.log('ok')", encoding="utf-8")

    os.environ["TRACE_FRONTEND_DIST"] = str(dist)
    os.environ["TRACE_DB_PATH"] = str(tmp_path / "trace.sqlite")
    reset_settings_cache()

    app = create_app()
    with TestClient(app) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert "trace-release" in root.text

        nested = client.get("/reports/some-id")
        assert nested.status_code == 200
        assert "trace-release" in nested.text

        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["version"] == "1.1.1"

    os.environ.pop("TRACE_FRONTEND_DIST", None)
    os.environ.pop("TRACE_DB_PATH", None)
    reset_settings_cache()
