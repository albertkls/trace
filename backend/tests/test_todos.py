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


def test_todo_crud(client):
    # Create a standalone todo
    r = client.post("/api/todos", json={"text": "写下周计划"})
    assert r.status_code == 201
    t = r.json()
    assert t["text"] == "写下周计划"
    assert t["done"] == 0
    assert t["thread_id"] is None
    assert t["thread_title"] is None

    # List returns it
    todos = client.get("/api/todos").json()
    assert any(x["id"] == t["id"] for x in todos)

    # Attach to a thread
    thread_id = client.get("/api/threads").json()[0]["id"]
    r = client.patch(f"/api/todos/{t['id']}", json={"thread_id": thread_id})
    assert r.status_code == 200
    body = r.json()
    assert body["thread_id"] == thread_id
    assert body["thread_title"] is not None  # populated via JOIN

    # Set due_date
    r = client.patch(f"/api/todos/{t['id']}", json={"due_date": "2026-04-25"})
    assert r.status_code == 200
    assert r.json()["due_date"] == "2026-04-25"

    # Mark done — done_at stamped
    r = client.patch(f"/api/todos/{t['id']}", json={"done": True})
    assert r.status_code == 200
    body = r.json()
    assert body["done"] == 1
    assert body["done_at"] is not None

    # Un-mark done — done_at cleared
    r = client.patch(f"/api/todos/{t['id']}", json={"done": False})
    assert r.status_code == 200
    body = r.json()
    assert body["done"] == 0
    assert body["done_at"] is None

    # Detach thread
    r = client.patch(f"/api/todos/{t['id']}", json={"clear_thread": True})
    assert r.status_code == 200
    assert r.json()["thread_id"] is None

    # Clear due_date
    r = client.patch(f"/api/todos/{t['id']}", json={"clear_due_date": True})
    assert r.status_code == 200
    assert r.json()["due_date"] is None

    # Delete
    r = client.delete(f"/api/todos/{t['id']}")
    assert r.status_code == 204
    r = client.delete(f"/api/todos/{t['id']}")
    assert r.status_code == 404


def test_todo_create_validates_thread(client):
    r = client.post(
        "/api/todos", json={"text": "任务", "thread_id": "th_nonexistent"}
    )
    assert r.status_code == 404


def test_todo_create_rejects_empty_text(client):
    r = client.post("/api/todos", json={"text": "   "})
    assert r.status_code == 400


def test_todo_list_filter_by_done(client):
    client.post("/api/todos", json={"text": "A"})
    b = client.post("/api/todos", json={"text": "B"}).json()
    client.patch(f"/api/todos/{b['id']}", json={"done": True})

    open_todos = client.get("/api/todos?done=0").json()
    done_todos = client.get("/api/todos?done=1").json()
    assert all(x["done"] == 0 for x in open_todos)
    assert all(x["done"] == 1 for x in done_todos)
    assert any(x["id"] == b["id"] for x in done_todos)


def test_todo_list_ordering(client):
    a = client.post("/api/todos", json={"text": "A", "due_date": "2026-05-01"}).json()
    b = client.post("/api/todos", json={"text": "B", "due_date": "2026-04-20"}).json()
    c = client.post("/api/todos", json={"text": "C"}).json()  # no due_date
    d = client.post("/api/todos", json={"text": "D"}).json()
    client.patch(f"/api/todos/{d['id']}", json={"done": True})  # done should sink

    ids = [t["id"] for t in client.get("/api/todos").json()]
    # Earlier due first, then no-due, then done last
    assert ids.index(b["id"]) < ids.index(a["id"])
    assert ids.index(a["id"]) < ids.index(c["id"])
    assert ids.index(d["id"]) == len(ids) - 1
