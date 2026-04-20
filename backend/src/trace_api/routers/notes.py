from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict

router = APIRouter(prefix="/notes", tags=["notes"])

TZ = timezone(timedelta(hours=8))


def _now() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def _current_local_minute() -> str:
    """Minute-precision local timestamp matching the frontend's datetime-local form."""
    return datetime.now(TZ).strftime("%Y-%m-%dT%H:%M")


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class NoteIn(BaseModel):
    title: str = ""
    body_md: str = ""
    day: str | None = None  # local datetime (YYYY-MM-DDTHH:MM), default now
    thread_ids: list[str] | None = None


class NotePatch(BaseModel):
    title: str | None = None
    body_md: str | None = None
    day: str | None = None
    thread_ids: list[str] | None = None


def _to_dict(row) -> dict:
    d = row_to_dict(row)
    raw = d.pop("thread_ids_json", "[]")
    try:
        d["thread_ids"] = json.loads(raw or "[]")
    except json.JSONDecodeError:
        d["thread_ids"] = []
    return d


@router.get("")
def list_notes() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT * FROM note ORDER BY day DESC, updated_at DESC"
        ).fetchall()
        return [_to_dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/{note_id}")
def get_note(note_id: str) -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM note WHERE id = ?", (note_id,)).fetchone()
        if not row:
            raise HTTPException(404, "note not found")
        return _to_dict(row)
    finally:
        conn.close()


@router.post("", status_code=201)
def create_note(body: NoteIn) -> dict:
    conn = connect()
    try:
        thread_ids = body.thread_ids or []
        if thread_ids:
            placeholders = ",".join("?" for _ in thread_ids)
            found = conn.execute(
                f"SELECT id FROM thread WHERE id IN ({placeholders})",
                tuple(thread_ids),
            ).fetchall()
            if len(found) != len(thread_ids):
                raise HTTPException(404, "one or more threads not found")
        note_id = _id("nt")
        now = _now()
        day = body.day or _current_local_minute()
        conn.execute(
            "INSERT INTO note (id,title,body_md,day,thread_ids_json,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                note_id,
                body.title.strip(),
                body.body_md,
                day,
                json.dumps(thread_ids),
                now,
                now,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM note WHERE id = ?", (note_id,)).fetchone()
        return _to_dict(row)
    finally:
        conn.close()


@router.patch("/{note_id}")
def patch_note(note_id: str, patch: NotePatch) -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM note WHERE id = ?", (note_id,)).fetchone()
        if not row:
            raise HTTPException(404, "note not found")
        current = _to_dict(row)

        new_title = patch.title if patch.title is not None else current["title"]
        new_body = patch.body_md if patch.body_md is not None else current["body_md"]
        new_day = patch.day if patch.day is not None else current["day"]

        if patch.thread_ids is not None:
            if patch.thread_ids:
                placeholders = ",".join("?" for _ in patch.thread_ids)
                found = conn.execute(
                    f"SELECT id FROM thread WHERE id IN ({placeholders})",
                    tuple(patch.thread_ids),
                ).fetchall()
                if len(found) != len(patch.thread_ids):
                    raise HTTPException(404, "one or more threads not found")
            new_threads = patch.thread_ids
        else:
            new_threads = current["thread_ids"]

        conn.execute(
            "UPDATE note SET title=?, body_md=?, day=?, thread_ids_json=?, updated_at=? WHERE id=?",
            (new_title, new_body, new_day, json.dumps(new_threads), _now(), note_id),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM note WHERE id = ?", (note_id,)).fetchone()
        return _to_dict(updated)
    finally:
        conn.close()


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str) -> None:
    conn = connect()
    try:
        cur = conn.execute("DELETE FROM note WHERE id = ?", (note_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "note not found")
        conn.commit()
    finally:
        conn.close()
