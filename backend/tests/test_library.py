from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from .helpers import db_path


def test_markdown_library_scan_creates_and_updates_inbox_items(client: TestClient, tmp_path: Path) -> None:
    library = tmp_path / "vault"
    library.mkdir()
    (library / "Daily.md").write_text("今天完成了同步入口。", encoding="utf-8")
    (library / ".obsidian").mkdir()
    (library / ".obsidian" / "config.md").write_text("ignore me", encoding="utf-8")

    configured = client.post("/api/library/config", json={"path": str(library)})
    assert configured.status_code == 200, configured.text

    first_scan = client.post("/api/library/scan", json={})
    assert first_scan.status_code == 200, first_scan.text
    assert first_scan.json()["path"] == str(library)
    assert first_scan.json()["scanned"] == 1
    assert first_scan.json()["created"] == 1

    inbox = client.get("/api/captures/inbox")
    assert inbox.status_code == 200, inbox.text
    items = inbox.json()
    assert len(items) == 1
    assert items[0]["text"] == "今天完成了同步入口。"
    assert items[0]["source_title"] == "Daily.md"
    assert items[0]["source_file_path"] == str(library / "Daily.md")

    second_scan = client.post("/api/library/scan", json={})
    assert second_scan.status_code == 200, second_scan.text
    assert second_scan.json()["unchanged"] == 1

    (library / "Daily.md").write_text("今天完成了同步入口和回归测试。", encoding="utf-8")
    updated_scan = client.post("/api/library/scan", json={})
    assert updated_scan.status_code == 200, updated_scan.text
    assert updated_scan.json()["updated"] == 1

    inbox = client.get("/api/captures/inbox").json()
    assert len(inbox) == 1
    assert inbox[0]["text"] == "今天完成了同步入口和回归测试。"


def test_markdown_library_is_scoped_by_workspace(client: TestClient, tmp_path: Path) -> None:
    library = tmp_path / "vault"
    library.mkdir()
    (library / "Plan.md").write_text("默认工作区计划", encoding="utf-8")

    workspace_response = client.post("/api/workspaces", json={"name": "副工作区"})
    assert workspace_response.status_code == 201, workspace_response.text
    workspace_id = workspace_response.json()["id"]

    response = client.post("/api/library/scan", json={"path": str(library)})
    assert response.status_code == 200, response.text
    assert response.json()["created"] == 1

    (library / "Plan.md").write_text("副工作区计划", encoding="utf-8")
    side_response = client.post(
        "/api/library/scan",
        headers={"X-Trace-Workspace": workspace_id},
        json={"path": str(library)},
    )
    assert side_response.status_code == 200, side_response.text
    assert side_response.json()["created"] == 1

    default_inbox = client.get("/api/captures/inbox").json()
    side_inbox = client.get(
        "/api/captures/inbox",
        headers={"X-Trace-Workspace": workspace_id},
    ).json()
    assert [item["text"] for item in default_inbox] == ["默认工作区计划"]
    assert [item["text"] for item in side_inbox] == ["副工作区计划"]

    conn = sqlite3.connect(db_path())
    try:
        source_count = conn.execute(
            "SELECT COUNT(*) FROM source WHERE file_path = ?",
            (str(library / "Plan.md"),),
        ).fetchone()[0]
    finally:
        conn.close()
    assert source_count == 2
