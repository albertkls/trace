from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from .db import row_to_dict

TZ = timezone(timedelta(hours=8))
PROJECT_STATUSES = {"active", "paused", "done", "archived"}


def now_iso() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def new_project_id() -> str:
    return f"prj_{uuid.uuid4().hex[:12]}"


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


def get_project_by_id(conn, project_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM project WHERE id = ?", (project_id,)).fetchone()
    return row_to_dict(row) if row else None


def require_project(conn, project_id: str) -> dict:
    project = get_project_by_id(conn, project_id)
    if not project:
        raise HTTPException(404, "project not found")
    return project


def find_project_by_name(conn, name: str) -> dict | None:
    cleaned = clean_optional_text(name)
    if not cleaned:
        return None
    row = conn.execute(
        "SELECT * FROM project WHERE name = ? COLLATE NOCASE LIMIT 1",
        (cleaned,),
    ).fetchone()
    return row_to_dict(row) if row else None


def ensure_project_by_name(conn, name: str) -> dict:
    project = find_project_by_name(conn, name)
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
    }
    conn.execute(
        "INSERT INTO project (id,name,status,owner,summary,color,created_at,updated_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (
            project["id"],
            project["name"],
            project["status"],
            project["owner"],
            project["summary"],
            project["color"],
            project["created_at"],
            project["updated_at"],
        ),
    )
    return project


def resolve_project_reference(
    conn,
    *,
    project_id: str | None = None,
    project_name: str | None = None,
    create_from_name: bool = True,
) -> tuple[str | None, str | None]:
    cleaned_id = clean_optional_text(project_id)
    if cleaned_id:
        project = require_project(conn, cleaned_id)
        return project["id"], project["name"]

    cleaned_name = clean_optional_text(project_name)
    if cleaned_name:
        project = (
            ensure_project_by_name(conn, cleaned_name)
            if create_from_name
            else find_project_by_name(conn, cleaned_name)
        )
        if not project:
            raise HTTPException(404, "project not found")
        return project["id"], project["name"]

    return None, None
