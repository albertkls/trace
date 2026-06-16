from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from .helpers import create_capture, create_project, create_thread


def test_project_attachment_lifecycle(client, tmp_path: Path):
    project = create_project(client, name="附件项目")
    file_path = tmp_path / "brief.pdf"
    file_path.write_text("hello", encoding="utf-8")

    created = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(file_path),
        },
    )
    assert created.status_code == 201, created.text
    attachment = created.json()
    assert attachment["owner_type"] == "project"
    assert attachment["owner_id"] == project["id"]
    assert attachment["display_name"] == "brief.pdf"
    assert attachment["file_kind"] == "pdf"
    assert attachment["file_size"] == 5
    assert attachment["exists"] is True

    listed = client.get(
        "/api/attachments",
        params={"owner_type": "project", "owner_id": project["id"]},
    )
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [attachment["id"]]

    deleted = client.delete(f"/api/attachments/{attachment['id']}")
    assert deleted.status_code == 204
    assert file_path.exists()

    listed = client.get(
        "/api/attachments",
        params={"owner_type": "project", "owner_id": project["id"]},
    )
    assert listed.json() == []


def test_attachment_supports_thread_and_evidence_owners(client, tmp_path: Path):
    thread = create_thread(client, title="附件线程")
    evidence = create_capture(client, text="证据附件", thread_id=thread["id"])
    thread_file = tmp_path / "thread.md"
    evidence_file = tmp_path / "evidence.txt"
    thread_file.write_text("# thread", encoding="utf-8")
    evidence_file.write_text("evidence", encoding="utf-8")

    thread_response = client.post(
        "/api/attachments",
        json={
            "owner_type": "thread",
            "owner_id": thread["id"],
            "file_path": str(thread_file),
        },
    )
    evidence_response = client.post(
        "/api/attachments",
        json={
            "owner_type": "evidence",
            "owner_id": evidence["id"],
            "file_path": str(evidence_file),
            "display_name": "原始证据.txt",
        },
    )

    assert thread_response.status_code == 201, thread_response.text
    assert evidence_response.status_code == 201, evidence_response.text
    assert evidence_response.json()["display_name"] == "原始证据.txt"
    assert client.get(
        "/api/attachments",
        params={"owner_type": "thread", "owner_id": thread["id"]},
    ).json()[0]["file_path"] == str(thread_file.resolve())
    assert client.get(
        "/api/attachments",
        params={"owner_type": "evidence", "owner_id": evidence["id"]},
    ).json()[0]["file_path"] == str(evidence_file.resolve())


def test_attachment_rejects_missing_file_and_unknown_owner(client, tmp_path: Path):
    project = client.post("/api/projects", json={"name": "Attachment Project"}).json()
    file_path = tmp_path / "side.txt"
    file_path.write_text("side", encoding="utf-8")

    missing = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(tmp_path / "missing.txt"),
        },
    )
    assert missing.status_code == 400

    unknown_owner = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": "prj_missing",
            "file_path": str(file_path),
        },
    )
    assert unknown_owner.status_code == 404


def test_attachment_reports_missing_existing_record(client, tmp_path: Path):
    project = create_project(client, name="丢失附件项目")
    file_path = tmp_path / "later-moved.txt"
    file_path.write_text("gone soon", encoding="utf-8")
    attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(file_path),
        },
    ).json()

    file_path.unlink()
    listed = client.get(
        "/api/attachments",
        params={"owner_type": "project", "owner_id": project["id"]},
    ).json()
    assert listed[0]["id"] == attachment["id"]
    assert listed[0]["exists"] is False

    opened = client.post(f"/api/attachments/{attachment['id']}/open")
    assert opened.status_code in {400, 404}


def test_attachment_open_and_reveal_use_macos_open(client, tmp_path: Path, monkeypatch):
    from trace_api.routers import attachments

    project = create_project(client, name="打开附件项目")
    file_path = tmp_path / "open-me.txt"
    spreadsheet_path = tmp_path / "plan.xlsx"
    file_path.write_text("open", encoding="utf-8")
    spreadsheet_path.write_text("sheet", encoding="utf-8")
    attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(file_path),
        },
    ).json()
    spreadsheet_attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(spreadsheet_path),
        },
    ).json()
    calls: list[list[str]] = []

    monkeypatch.setattr(attachments.platform, "system", lambda: "Darwin")

    def fake_run(args, **_kwargs):
        calls.append(args)
        return None

    monkeypatch.setattr(attachments.subprocess, "run", fake_run)

    opened = client.post(f"/api/attachments/{attachment['id']}/open")
    spreadsheet_opened = client.post(f"/api/attachments/{spreadsheet_attachment['id']}/open")
    revealed = client.post(f"/api/attachments/{attachment['id']}/reveal")

    assert opened.status_code == 200, opened.text
    assert opened.json()["ok"] is True
    assert opened.json()["last_opened_at"]
    assert spreadsheet_opened.status_code == 200, spreadsheet_opened.text
    assert revealed.status_code == 200, revealed.text
    assert calls == [
        ["open", str(file_path.resolve())],
        ["open", str(spreadsheet_path.resolve())],
        ["open", "-R", str(file_path.resolve())],
    ]

    listed = client.get(
        "/api/attachments",
        params={"owner_type": "project", "owner_id": project["id"]},
    ).json()
    by_name = {item["display_name"]: item for item in listed}
    assert by_name["open-me.txt"]["last_opened_at"] == opened.json()["last_opened_at"]
    assert by_name["plan.xlsx"]["can_open"] is True


def test_attachment_open_blocks_unsafe_file_types(client, tmp_path: Path, monkeypatch):
    from trace_api.routers import attachments

    project = create_project(client, name="危险附件项目")
    command_path = tmp_path / "run.command"
    docm_path = tmp_path / "macro.docm"
    command_path.write_text("echo nope", encoding="utf-8")
    docm_path.write_text("macro", encoding="utf-8")
    command_attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(command_path),
        },
    ).json()
    docm_attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(docm_path),
        },
    ).json()
    calls: list[list[str]] = []

    monkeypatch.setattr(attachments.platform, "system", lambda: "Darwin")

    def fake_run(args, **_kwargs):
        calls.append(args)
        return None

    monkeypatch.setattr(attachments.subprocess, "run", fake_run)

    command_opened = client.post(f"/api/attachments/{command_attachment['id']}/open")
    docm_opened = client.post(f"/api/attachments/{docm_attachment['id']}/open")
    revealed = client.post(f"/api/attachments/{command_attachment['id']}/reveal")

    assert command_opened.status_code == 400
    assert "unsafe file type" in command_opened.text
    assert docm_opened.status_code == 400
    assert "unsafe file type" in docm_opened.text
    assert revealed.status_code == 200
    assert calls == [["open", "-R", str(command_path.resolve())]]

    listed = client.get(
        "/api/attachments",
        params={"owner_type": "project", "owner_id": project["id"]},
    ).json()
    assert {item["display_name"]: item["can_open"] for item in listed} == {
        "run.command": False,
        "macro.docm": False,
    }


def test_owner_deletion_removes_attachment_records(client, tmp_path: Path):
    project = create_project(client, name="删除附件项目")
    file_path = tmp_path / "project.txt"
    file_path.write_text("project", encoding="utf-8")
    attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "project",
            "owner_id": project["id"],
            "file_path": str(file_path),
        },
    ).json()

    deleted = client.delete(f"/api/projects/{project['id']}")
    assert deleted.status_code == 204

    conn = sqlite3.connect(os.environ["TRACE_DB_PATH"])
    try:
        row = conn.execute("SELECT id FROM attachment WHERE id = ?", (attachment["id"],)).fetchone()
        assert row is None
    finally:
        conn.close()


def test_thread_deletion_removes_thread_and_evidence_attachment_records(client, tmp_path: Path):
    thread = create_thread(client, title="删除附件线程")
    evidence = create_capture(client, text="删除附件证据", thread_id=thread["id"])
    thread_file = tmp_path / "thread.txt"
    evidence_file = tmp_path / "evidence.txt"
    thread_file.write_text("thread", encoding="utf-8")
    evidence_file.write_text("evidence", encoding="utf-8")
    thread_attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "thread",
            "owner_id": thread["id"],
            "file_path": str(thread_file),
        },
    ).json()
    evidence_attachment = client.post(
        "/api/attachments",
        json={
            "owner_type": "evidence",
            "owner_id": evidence["id"],
            "file_path": str(evidence_file),
        },
    ).json()

    deleted = client.delete(f"/api/threads/{thread['id']}")
    assert deleted.status_code == 204

    conn = sqlite3.connect(os.environ["TRACE_DB_PATH"])
    try:
        rows = conn.execute(
            "SELECT id FROM attachment WHERE id IN (?,?)",
            (thread_attachment["id"], evidence_attachment["id"]),
        ).fetchall()
        assert rows == []
    finally:
        conn.close()


def test_attachment_schema_migration_adds_table(tmp_path: Path):
    from trace_api.db import ensure_schema

    db_file = tmp_path / "old.sqlite"
    conn = sqlite3.connect(db_file)
    try:
        conn.execute(
            """
            CREATE TABLE workspace (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                theme_color TEXT,
                default_llm_profile_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()

    ensure_schema(db_file)

    conn = sqlite3.connect(db_file)
    try:
        table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='attachment'"
        ).fetchone()
        assert table is not None
    finally:
        conn.close()
