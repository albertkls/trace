from __future__ import annotations

from pathlib import Path

from trace_api.db import connect, ensure_schema
from trace_api.utils import now_iso
from trace_api.workspace import DEFAULT_WORKSPACE_ID


def test_workspaces_api_is_removed(client):
    response = client.get("/api/workspaces")
    assert response.status_code == 404


def test_workspace_header_is_ignored(client):
    response = client.post(
        "/api/projects",
        headers={"X-Trace-Workspace": "ws_other"},
        json={"name": "固定默认工作台"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["workspace_id"] == DEFAULT_WORKSPACE_ID

    projects = client.get("/api/projects").json()["items"]
    assert [project["name"] for project in projects] == ["固定默认工作台"]


def test_non_default_workspace_data_is_purged_on_schema(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("TRACE_DB_PATH", str(tmp_path / "trace.sqlite"))
    ensure_schema()

    now = now_iso()
    conn = connect()
    try:
        conn.execute(
            """
            INSERT INTO workspace (id,name,theme_color,default_llm_profile_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?)
            """,
            ("ws_side", "Side Space", "#000000", None, now, now),
        )
        conn.execute(
            "INSERT INTO project (id,name,status,summary,created_at,updated_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?)",
            ("prj_default", "Default Project", "active", "", now, now, DEFAULT_WORKSPACE_ID),
        )
        conn.execute(
            "INSERT INTO project (id,name,status,summary,created_at,updated_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?)",
            ("prj_side", "Side Project", "active", "", now, now, "ws_side"),
        )
        conn.execute(
            "INSERT INTO thread (id,title,status,started_at,last_active_at,workspace_id,project_id) "
            "VALUES (?,?,?,?,?,?,?)",
            ("th_side", "Side Thread", "active", now, now, "ws_side", "prj_side"),
        )
        conn.execute(
            "INSERT INTO todo (id,thread_id,text,due_date,done,created_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?)",
            ("td_side", "th_side", "Side Todo", None, 0, now, "ws_side"),
        )
        conn.execute(
            "INSERT INTO settings (key,value) VALUES (?,?)",
            ("library.path:ws_side", "/tmp/side-library"),
        )
        conn.commit()
    finally:
        conn.close()

    ensure_schema()

    conn = connect()
    try:
        workspaces = conn.execute("SELECT id FROM workspace ORDER BY id").fetchall()
        projects = conn.execute("SELECT id FROM project ORDER BY id").fetchall()
        side_todos = conn.execute("SELECT id FROM todo WHERE workspace_id = 'ws_side'").fetchall()
        side_settings = conn.execute(
            "SELECT key FROM settings WHERE key = 'library.path:ws_side'"
        ).fetchall()
    finally:
        conn.close()

    assert [row["id"] for row in workspaces] == [DEFAULT_WORKSPACE_ID]
    assert [row["id"] for row in projects] == ["prj_default"]
    assert side_todos == []
    assert side_settings == []
