from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path):
    os.environ["TRACE_DB_PATH"] = str(tmp_path / "trace.sqlite")
    from trace_api.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c
    os.environ.pop("TRACE_DB_PATH", None)


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_threads_seeded(client):
    r = client.get("/api/threads")
    assert r.status_code == 200
    threads = r.json()
    assert len(threads) >= 2
    assert any("项目A" in t["title"] for t in threads)


def test_thread_detail(client):
    threads = client.get("/api/threads").json()
    first = threads[0]["id"]
    r = client.get(f"/api/threads/{first}")
    assert r.status_code == 200
    body = r.json()
    assert "evidence" in body
    assert "todos" in body


def test_report_patch(client):
    reports = client.get("/api/reports").json()
    assert reports
    rid = reports[0]["id"]
    r = client.patch(f"/api/reports/{rid}", json={"body_md": "new body"})
    assert r.status_code == 200
    assert r.json()["body_md"] == "new body"
