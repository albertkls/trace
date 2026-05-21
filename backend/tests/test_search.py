from __future__ import annotations

from .helpers import create_capture, create_project


def test_search_includes_projects(client):
    project = create_project(client, name="权限平台")
    thread = client.post(
        "/api/threads",
        json={"title": "权限改造", "project_id": project["id"]},
    ).json()

    result = client.get("/api/search?q=权限")
    assert result.status_code == 200
    body = result.json()
    assert any(item["id"] == project["id"] for item in body["projects"])
    assert any(item["id"] == thread["id"] for item in body["threads"])
    prefix_result = client.get("/api/search?q=权限平").json()
    assert any(item["id"] == project["id"] for item in prefix_result["projects"])


def test_search_uses_full_text_index_across_content_types(client):
    capture = create_capture(client, text="AlphaLaunch 风险已经关闭")
    todo = client.post("/api/todos", json={"text": "补充 AlphaLaunch 验收清单"}).json()
    note = client.post(
        "/api/notes",
        json={"title": "发布记录", "body_md": "AlphaLaunch 已完成灰度"},
    ).json()

    result = client.get("/api/search?q=AlphaLaunch")
    assert result.status_code == 200, result.text
    body = result.json()
    assert any(item["id"] == capture["id"] for item in body["evidence"])
    assert any(item["id"] == todo["id"] for item in body["todos"])
    assert any(item["id"] == note["id"] for item in body["notes"])


def test_search_is_scoped_by_workspace(client):
    workspace = client.post("/api/workspaces", json={"name": "隔离区"}).json()
    create_capture(client, text="WorkspaceOnly 默认区")
    side_capture = client.post(
        "/api/captures",
        headers={"X-Trace-Workspace": workspace["id"]},
        json={"text": "WorkspaceOnly 隔离区"},
    ).json()

    default_result = client.get("/api/search?q=WorkspaceOnly").json()
    side_result = client.get(
        "/api/search?q=WorkspaceOnly",
        headers={"X-Trace-Workspace": workspace["id"]},
    ).json()

    assert all(item["id"] != side_capture["id"] for item in default_result["evidence"])
    assert any(item["id"] == side_capture["id"] for item in side_result["evidence"])


def test_search_index_tracks_updates_and_deletes(client):
    capture = create_capture(client, text="DeltaSignal 初始记录")
    assert any(
        item["id"] == capture["id"]
        for item in client.get("/api/search?q=DeltaSignal").json()["evidence"]
    )

    updated = client.patch(
        f"/api/captures/{capture['id']}",
        json={"text": "OmegaSignal 更新记录"},
    )
    assert updated.status_code == 200, updated.text

    old_result = client.get("/api/search?q=DeltaSignal").json()
    new_result = client.get("/api/search?q=OmegaSignal").json()
    assert all(item["id"] != capture["id"] for item in old_result["evidence"])
    assert any(item["id"] == capture["id"] for item in new_result["evidence"])

    deleted = client.delete(f"/api/captures/{capture['id']}")
    assert deleted.status_code == 204, deleted.text
    deleted_result = client.get("/api/search?q=OmegaSignal").json()
    assert all(item["id"] != capture["id"] for item in deleted_result["evidence"])
