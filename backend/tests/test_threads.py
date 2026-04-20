from __future__ import annotations

import os
from datetime import date, timedelta
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


def _first_thread_id(client: TestClient) -> str:
    return client.get("/api/threads").json()[0]["id"]


def test_patch_thread_updates_editable_fields(client: TestClient):
    thread_id = _first_thread_id(client)

    r = client.patch(
        f"/api/threads/{thread_id}",
        json={
            "title": "工作线编辑已接入",
            "project": "平台侧",
            "owner": "Albert",
            "status": "blocked",
            "pinned": True,
            "started_at": "2026-04-01",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "工作线编辑已接入"
    assert body["project"] == "平台侧"
    assert body["owner"] == "Albert"
    assert body["status"] == "blocked"
    assert body["pinned"] == 1
    assert body["started_at"] == "2026-04-01"


def test_patch_thread_can_clear_optional_fields(client: TestClient):
    thread_id = _first_thread_id(client)

    seeded = client.patch(
        f"/api/threads/{thread_id}",
        json={"project": "平台侧", "owner": "Albert"},
    )
    assert seeded.status_code == 200, seeded.text

    cleared = client.patch(
        f"/api/threads/{thread_id}",
        json={"project": None, "owner": None},
    )
    assert cleared.status_code == 200, cleared.text
    body = cleared.json()
    assert body["project"] is None
    assert body["owner"] is None


def test_patch_thread_rejects_future_started_at(client: TestClient):
    thread_id = _first_thread_id(client)
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    r = client.patch(
        f"/api/threads/{thread_id}",
        json={"started_at": tomorrow},
    )
    assert r.status_code == 400
    assert "future" in r.text
