from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict
from ..project_utils import require_project
from ..utils import local_minute, new_id, now_iso
from ..workspace import request_workspace_id

router = APIRouter(prefix="/notes", tags=["notes"])


def _now() -> str:
    return now_iso()


def _current_local_minute() -> str:
    return local_minute()


def _id(prefix: str) -> str:
    return new_id(prefix)


class NoteIn(BaseModel):
    title: str = ""
    body_md: str = ""
    day: str | None = None  # local datetime (YYYY-MM-DDTHH:MM), default now
    project_id: str | None = None
    thread_ids: list[str] | None = None


class NotePatch(BaseModel):
    title: str | None = None
    body_md: str | None = None
    day: str | None = None
    project_id: str | None = None
    clear_project: bool | None = None
    thread_ids: list[str] | None = None


def _to_dict(row) -> dict:
    d = row_to_dict(row)
    raw = d.pop("thread_ids_json", "[]")
    try:
        d["thread_ids"] = json.loads(raw or "[]")
    except json.JSONDecodeError:
        d["thread_ids"] = []
    d["project_name"] = d.get("project_name")
    return d


def _normalize_thread_ids(conn, thread_ids: list[str] | None, workspace_id: str) -> list[str]:
    cleaned = [tid for tid in dict.fromkeys(thread_ids or []) if tid]
    if not cleaned:
        return []
    placeholders = ",".join("?" for _ in cleaned)
    found = conn.execute(
        f"SELECT id FROM thread WHERE workspace_id = ? AND id IN ({placeholders})",
        (workspace_id, *cleaned),
    ).fetchall()
    if len(found) != len(cleaned):
        raise HTTPException(404, "one or more threads not found")
    return cleaned


@router.get("")
def list_notes(
    project_id: str | None = None,
    workspace_id: str = Depends(request_workspace_id),
) -> list[dict]:
    conn = connect()
    try:
        sql = """
            SELECT n.*, p.name AS project_name
            FROM note n
            LEFT JOIN project p ON p.id = n.project_id
        """
        params: list[str] = [workspace_id]
        sql += " WHERE n.workspace_id = ?"
        if project_id:
            sql += " AND n.project_id = ?"
            params.append(project_id)
        sql += " ORDER BY n.day DESC, n.updated_at DESC"
        rows = conn.execute(sql, tuple(params)).fetchall()
        return [_to_dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/{note_id}")
def get_note(note_id: str, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            """
            SELECT n.*, p.name AS project_name
            FROM note n
            LEFT JOIN project p ON p.id = n.project_id
            WHERE n.id = ? AND n.workspace_id = ?
            """,
            (note_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "note not found")
        return _to_dict(row)
    finally:
        conn.close()


@router.post("", status_code=201)
def create_note(body: NoteIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        thread_ids = _normalize_thread_ids(conn, body.thread_ids, workspace_id)
        project_id = body.project_id
        if project_id:
            require_project(conn, project_id, workspace_id)
        note_id = _id("nt")
        now = _now()
        day = body.day or _current_local_minute()
        conn.execute(
            "INSERT INTO note (id,title,body_md,day,project_id,thread_ids_json,created_at,updated_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (
                note_id,
                body.title.strip(),
                body.body_md,
                day,
                project_id,
                json.dumps(thread_ids),
                now,
                now,
                workspace_id,
            ),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT n.*, p.name AS project_name
            FROM note n
            LEFT JOIN project p ON p.id = n.project_id
            WHERE n.id = ? AND n.workspace_id = ?
            """,
            (note_id, workspace_id),
        ).fetchone()
        return _to_dict(row)
    finally:
        conn.close()


@router.patch("/{note_id}")
def patch_note(note_id: str, patch: NotePatch, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM note WHERE id = ? AND workspace_id = ?",
            (note_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "note not found")
        current = _to_dict(row)

        new_title = patch.title if patch.title is not None else current["title"]
        new_body = patch.body_md if patch.body_md is not None else current["body_md"]
        new_day = patch.day if patch.day is not None else current["day"]
        if patch.clear_project:
            new_project_id = None
        elif patch.project_id is not None:
            require_project(conn, patch.project_id, workspace_id)
            new_project_id = patch.project_id
        else:
            new_project_id = current.get("project_id")

        if patch.thread_ids is not None:
            new_threads = _normalize_thread_ids(conn, patch.thread_ids, workspace_id)
        else:
            new_threads = current["thread_ids"]

        conn.execute(
            "UPDATE note SET title=?, body_md=?, day=?, project_id=?, thread_ids_json=?, updated_at=? WHERE id=? AND workspace_id=?",
            (new_title, new_body, new_day, new_project_id, json.dumps(new_threads), _now(), note_id, workspace_id),
        )
        conn.commit()
        updated = conn.execute(
            """
            SELECT n.*, p.name AS project_name
            FROM note n
            LEFT JOIN project p ON p.id = n.project_id
            WHERE n.id = ? AND n.workspace_id = ?
            """,
            (note_id, workspace_id),
        ).fetchone()
        return _to_dict(updated)
    finally:
        conn.close()


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, workspace_id: str = Depends(request_workspace_id)) -> None:
    conn = connect()
    try:
        cur = conn.execute(
            "DELETE FROM note WHERE id = ? AND workspace_id = ?",
            (note_id, workspace_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "note not found")
        conn.commit()
    finally:
        conn.close()
