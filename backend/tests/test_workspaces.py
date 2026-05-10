from __future__ import annotations


def test_default_workspace_exists(client):
    response = client.get("/api/workspaces")
    assert response.status_code == 200
    workspaces = response.json()
    assert workspaces[0]["id"] == "ws_default"
    assert workspaces[0]["name"] == "默认工作区"


def test_workspace_isolates_core_lists(client):
    created = client.post("/api/workspaces", json={"name": "Side Space"})
    assert created.status_code == 201
    side_id = created.json()["id"]

    default_project = client.post("/api/projects", json={"name": "Default Project"}).json()
    side_project = client.post(
        "/api/projects",
        headers={"X-Trace-Workspace": side_id},
        json={"name": "Side Project"},
    ).json()

    default_thread = client.post(
        "/api/threads",
        json={"title": "Default Thread", "project_id": default_project["id"]},
    ).json()
    side_thread = client.post(
        "/api/threads",
        headers={"X-Trace-Workspace": side_id},
        json={"title": "Side Thread", "project_id": side_project["id"]},
    ).json()

    client.post("/api/captures", json={"text": "default inbox"})
    client.post(
        "/api/captures",
        headers={"X-Trace-Workspace": side_id},
        json={"text": "side inbox"},
    )
    client.post("/api/todos", json={"text": "default todo", "thread_id": default_thread["id"]})
    client.post(
        "/api/todos",
        headers={"X-Trace-Workspace": side_id},
        json={"text": "side todo", "thread_id": side_thread["id"]},
    )

    assert [p["name"] for p in client.get("/api/projects").json()] == ["Default Project"]
    assert [p["name"] for p in client.get("/api/projects", headers={"X-Trace-Workspace": side_id}).json()] == ["Side Project"]

    assert [t["title"] for t in client.get("/api/threads").json()] == ["Default Thread"]
    assert [t["title"] for t in client.get("/api/threads", headers={"X-Trace-Workspace": side_id}).json()] == ["Side Thread"]

    assert [i["text"] for i in client.get("/api/captures/inbox").json()] == ["default inbox"]
    assert [i["text"] for i in client.get("/api/captures/inbox", headers={"X-Trace-Workspace": side_id}).json()] == ["side inbox"]

    assert [t["text"] for t in client.get("/api/todos").json()] == ["default todo"]
    assert [t["text"] for t in client.get("/api/todos", headers={"X-Trace-Workspace": side_id}).json()] == ["side todo"]


def test_workspace_rejects_cross_workspace_links(client):
    side_id = client.post("/api/workspaces", json={"name": "Other"}).json()["id"]
    side_project = client.post(
        "/api/projects",
        headers={"X-Trace-Workspace": side_id},
        json={"name": "Side Project"},
    ).json()
    response = client.post("/api/threads", json={"title": "Bad Link", "project_id": side_project["id"]})
    assert response.status_code == 404

    side_thread = client.post(
        "/api/threads",
        headers={"X-Trace-Workspace": side_id},
        json={"title": "Side Thread", "project_id": side_project["id"]},
    ).json()
    response = client.post("/api/todos", json={"text": "Bad Todo", "thread_id": side_thread["id"]})
    assert response.status_code == 404
