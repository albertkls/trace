from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from .helpers import create_project


def test_create_and_list_backups(client: TestClient) -> None:
    create_project(client, name="备份项目")

    response = client.post("/api/backups")
    assert response.status_code == 201, response.text
    backup = response.json()
    assert backup["name"].endswith(".sqlite")
    assert backup["size"] > 0
    assert len(backup["sha256"]) == 64
    assert Path(backup["path"]).is_file()

    listed = client.get("/api/backups")
    assert listed.status_code == 200, listed.text
    assert any(item["path"] == backup["path"] for item in listed.json())


def test_restore_backup_creates_safety_backup_and_restores_data(client: TestClient) -> None:
    project = create_project(client, name="恢复前项目")
    backup = client.post("/api/backups").json()

    deleted = client.delete(f"/api/projects/{project['id']}")
    assert deleted.status_code == 204, deleted.text
    assert client.get("/api/projects").json() == []

    restored = client.post("/api/backups/restore", json={"path": backup["path"]})
    assert restored.status_code == 200, restored.text
    body = restored.json()
    assert body["ok"] is True
    assert body["safety_backup"]["name"].endswith(".sqlite")

    projects = client.get("/api/projects").json()
    assert any(item["name"] == "恢复前项目" for item in projects)


def test_restore_rejects_files_outside_backup_dir(client: TestClient, tmp_path: Path) -> None:
    outside = tmp_path / "outside.sqlite"
    outside.write_bytes(b"not a real sqlite database")

    response = client.post("/api/backups/restore", json={"path": str(outside)})
    assert response.status_code == 403, response.text
