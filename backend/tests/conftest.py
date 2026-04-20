from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path):
    os.environ["TRACE_DB_PATH"] = str(tmp_path / "trace.sqlite")
    os.environ["TRACE_SEED_DEMO"] = "0"

    from trace_api.config import reset_settings_cache
    from trace_api.main import create_app

    reset_settings_cache()
    app = create_app()
    with TestClient(app) as c:
        yield c

    os.environ.pop("TRACE_DB_PATH", None)
    os.environ.pop("TRACE_SEED_DEMO", None)
    reset_settings_cache()
