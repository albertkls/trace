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


def test_capture_flow(client):
    # 1. Create a capture without a thread — goes to inbox
    r = client.post(
        "/api/captures",
        json={"text": "和平台同步 3/15 上线风险", "category": "risk"},
    )
    assert r.status_code == 201
    cap = r.json()
    assert cap["thread_id"] is None
    assert cap["category"] == "risk"

    inbox = client.get("/api/captures/inbox").json()
    assert any(e["id"] == cap["id"] for e in inbox)

    # 2. Patch to reassign category and date
    r = client.patch(
        f"/api/captures/{cap['id']}",
        json={"category": "plan", "event_date": "2026-04-18"},
    )
    assert r.status_code == 200
    assert r.json()["category"] == "plan"
    assert r.json()["event_date"] == "2026-04-18"

    # 3. Assign to an existing thread
    threads = client.get("/api/threads").json()
    tid = threads[0]["id"]
    r = client.patch(f"/api/captures/{cap['id']}", json={"thread_id": tid})
    assert r.status_code == 200
    assert r.json()["thread_id"] == tid

    inbox = client.get("/api/captures/inbox").json()
    assert not any(e["id"] == cap["id"] for e in inbox)

    # 4. Promote to a todo
    r = client.post(
        f"/api/captures/{cap['id']}/promote-todo",
        json={"due_date": "2026-04-20"},
    )
    assert r.status_code == 201
    todo = r.json()
    assert todo["text"] == "和平台同步 3/15 上线风险"
    assert todo["due_date"] == "2026-04-20"
    assert todo["thread_id"] == tid

    # 5. Delete capture
    r = client.delete(f"/api/captures/{cap['id']}")
    assert r.status_code == 204


def test_capture_direct_to_thread(client):
    threads = client.get("/api/threads").json()
    tid = threads[0]["id"]
    r = client.post(
        "/api/captures",
        json={"text": "直接归入线程", "category": "progress", "thread_id": tid},
    )
    assert r.status_code == 201
    assert r.json()["thread_id"] == tid
    inbox = client.get("/api/captures/inbox").json()
    assert not any(e["id"] == r.json()["id"] for e in inbox)


def test_capture_rejects_empty_text(client):
    r = client.post("/api/captures", json={"text": "   "})
    assert r.status_code == 400


def test_capture_rejects_bad_category(client):
    r = client.post("/api/captures", json={"text": "x", "category": "foo"})
    assert r.status_code == 400


def test_capture_allows_duplicate_text(client):
    first = client.post(
        "/api/captures",
        json={"text": "重复文本", "category": "progress"},
    )
    second = client.post(
        "/api/captures",
        json={"text": "重复文本", "category": "progress"},
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


def test_create_thread_with_adopt(client):
    # make an inbox capture, then create a thread that adopts it
    cap = client.post(
        "/api/captures",
        json={"text": "新课题：供应链洞察", "category": "plan"},
    ).json()
    r = client.post(
        "/api/threads",
        json={"title": "供应链洞察", "adopt_evidence_id": cap["id"]},
    )
    assert r.status_code == 201
    new_thread = r.json()
    detail = client.get(f"/api/threads/{new_thread['id']}").json()
    assert any(e["id"] == cap["id"] for e in detail["evidence"])


def test_patch_thread(client):
    threads = client.get("/api/threads").json()
    tid = threads[0]["id"]
    r = client.patch(f"/api/threads/{tid}", json={"summary": "new summary", "status": "done"})
    assert r.status_code == 200
    assert r.json()["summary"] == "new summary"
    assert r.json()["status"] == "done"


def test_patch_thread_rejects_bad_status(client):
    tid = client.get("/api/threads").json()[0]["id"]
    r = client.patch(f"/api/threads/{tid}", json={"status": "bogus"})
    assert r.status_code == 400
