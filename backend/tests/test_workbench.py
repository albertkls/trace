from __future__ import annotations


def test_workbench_overview_empty_state(client):
    response = client.get("/api/workbench/overview?date=2026-06-16")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["date"] == "2026-06-16"
    assert body["week_label"] == "2026-W25"
    assert [metric["id"] for metric in body["metrics"]] == [
        "pending",
        "active_threads",
        "projects",
        "blocked",
    ]
    assert body["metrics"][0]["value"] == 0
    assert body["focus_items"][0]["id"] == "report-start"
    assert [column["id"] for column in body["workline_columns"]] == ["active", "blocked", "done"]
    assert body["week_plan"]["items"] == []
    assert body["threads_for_picker"] == []


def test_workbench_overview_collects_action_data(client):
    project = client.post("/api/projects", json={"name": "SRM"}).json()
    active_thread = client.post(
        "/api/threads",
        json={"title": "非生产物料跟进", "project_id": project["id"], "pinned": True},
    ).json()
    blocked_thread = client.post(
        "/api/threads",
        json={"title": "研发物料功耗确认", "project_id": project["id"]},
    ).json()
    patch_response = client.patch(
        f"/api/threads/{blocked_thread['id']}",
        json={"status": "blocked"},
    )
    assert patch_response.status_code == 200, patch_response.text

    inbox_response = client.post("/api/captures", json={"text": "供应商报价待归档"})
    assert inbox_response.status_code == 201, inbox_response.text
    todo_response = client.post(
        "/api/todos",
        json={
            "text": "整理物料评审下一步",
            "due_date": "2026-06-16",
            "thread_id": active_thread["id"],
        },
    )
    assert todo_response.status_code == 201, todo_response.text
    report_response = client.post(
        "/api/reports",
        json={
            "period_start": "2026-06-15",
            "period_end": "2026-06-21",
            "project_id": project["id"],
        },
    )
    assert report_response.status_code == 200, report_response.text

    response = client.get("/api/workbench/overview?date=2026-06-16")
    assert response.status_code == 200, response.text
    body = response.json()

    metrics = {metric["id"]: metric for metric in body["metrics"]}
    assert metrics["pending"]["value"] == 2
    assert metrics["active_threads"]["value"] == 1
    assert metrics["projects"]["value"] == 1
    assert metrics["blocked"]["value"] == 1
    assert {item["id"] for item in body["focus_items"]} >= {
        "due-today",
        "inbox",
        "blocked-threads",
    }
    columns = {column["id"]: column for column in body["workline_columns"]}
    assert columns["active"]["count"] == 1
    assert columns["active"]["items"][0]["title"] == "非生产物料跟进"
    assert columns["blocked"]["count"] == 1
    assert body["summary"][1]["tone"] == "stop"
    assert body["week_plan"]["due_today_count"] == 1
    assert body["week_plan"]["items"][0]["label"] == "整理物料评审下一步"
    assert body["threads_for_picker"][0]["title"] == "非生产物料跟进"
