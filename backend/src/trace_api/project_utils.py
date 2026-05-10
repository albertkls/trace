from __future__ import annotations

from fastapi import HTTPException

from .db import row_to_dict
from .utils import new_id, now_iso

PROJECT_STATUSES = {"active", "paused", "done", "archived"}


def new_project_id() -> str:
    return new_id("prj")


def clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def validate_project_status(status: str) -> str:
    cleaned = (status or "").strip()
    if cleaned not in PROJECT_STATUSES:
        raise HTTPException(400, f"status must be one of {sorted(PROJECT_STATUSES)}")
    return cleaned


def get_project_by_id(conn, project_id: str, workspace_id: str | None = None) -> dict | None:
    if workspace_id:
        row = conn.execute(
            "SELECT * FROM project WHERE id = ? AND workspace_id = ?",
            (project_id, workspace_id),
        ).fetchone()
    else:
        row = conn.execute("SELECT * FROM project WHERE id = ?", (project_id,)).fetchone()
    return row_to_dict(row) if row else None


def require_project(conn, project_id: str, workspace_id: str | None = None) -> dict:
    project = get_project_by_id(conn, project_id, workspace_id)
    if not project:
        raise HTTPException(404, "project not found")
    return project


def find_project_by_name(conn, name: str, workspace_id: str | None = None) -> dict | None:
    cleaned = clean_optional_text(name)
    if not cleaned:
        return None
    if workspace_id:
        row = conn.execute(
            "SELECT * FROM project WHERE workspace_id = ? AND name = ? COLLATE NOCASE LIMIT 1",
            (workspace_id, cleaned),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM project WHERE name = ? COLLATE NOCASE LIMIT 1",
            (cleaned,),
        ).fetchone()
    return row_to_dict(row) if row else None


def ensure_project_by_name(conn, name: str, workspace_id: str) -> dict:
    project = find_project_by_name(conn, name, workspace_id)
    if project:
        return project
    cleaned = clean_optional_text(name)
    if not cleaned:
        raise HTTPException(400, "project name is empty")
    now = now_iso()
    project = {
        "id": new_project_id(),
        "name": cleaned,
        "status": "active",
        "owner": None,
        "summary": "",
        "color": None,
        "created_at": now,
        "updated_at": now,
        "workspace_id": workspace_id,
    }
    conn.execute(
        "INSERT INTO project (id,name,status,owner,summary,color,created_at,updated_at,workspace_id) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (
            project["id"],
            project["name"],
            project["status"],
            project["owner"],
            project["summary"],
            project["color"],
            project["created_at"],
            project["updated_at"],
            project["workspace_id"],
        ),
    )
    return project


def resolve_project_reference(
    conn,
    *,
    project_id: str | None = None,
    project_name: str | None = None,
    workspace_id: str | None = None,
    create_from_name: bool = True,
) -> tuple[str | None, str | None]:
    cleaned_id = clean_optional_text(project_id)
    if cleaned_id:
        project = require_project(conn, cleaned_id, workspace_id)
        return project["id"], project["name"]

    cleaned_name = clean_optional_text(project_name)
    if cleaned_name:
        project = (
            ensure_project_by_name(conn, cleaned_name, workspace_id or "ws_default")
            if create_from_name
            else find_project_by_name(conn, cleaned_name, workspace_id)
        )
        if not project:
            raise HTTPException(404, "project not found")
        return project["id"], project["name"]

    return None, None
