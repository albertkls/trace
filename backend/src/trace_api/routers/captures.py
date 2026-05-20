from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict
import uuid

from ..utils import local_minute, new_id, now_iso
from ..workspace import request_workspace_id
from .attachments import delete_owner_attachments

router = APIRouter(prefix="/captures", tags=["captures"])

VALID_CATEGORIES = {"progress", "decision", "risk", "plan", "support"}


def _now() -> str:
    return now_iso()


def _current_local_minute() -> str:
    return local_minute()


def _id(prefix: str) -> str:
    return new_id(prefix)


def _hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def _insert_source(
    conn,
    *,
    source_id: str,
    kind: str,
    title: str,
    text: str,
    imported_at: str,
    event_time: str,
    workspace_id: str,
) -> None:
    try:
        conn.execute(
            "INSERT INTO source (id,kind,title,raw_text,hash,imported_at,event_time,metadata_json,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (source_id, kind, title, text, _hash(text), imported_at, event_time, "{}", workspace_id),
        )
    except sqlite3.IntegrityError as e:
        if "source.hash" not in str(e):
            raise
        conn.execute(
            "INSERT INTO source (id,kind,title,raw_text,hash,imported_at,event_time,metadata_json,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (
                source_id,
                kind,
                title,
                text,
                _hash(f"{text}\n{event_time}\n{uuid.uuid4().hex}"),
                imported_at,
                event_time,
                "{}",
                workspace_id,
            ),
        )


class CaptureIn(BaseModel):
    text: str
    event_date: str | None = None  # local datetime (YYYY-MM-DDTHH:MM), defaults to now
    category: str = "progress"
    thread_id: str | None = None  # if set, evidence is filed directly
    source_kind: Literal["quicknote", "meeting", "file", "import"] = "quicknote"
    source_title: str | None = None  # optional — defaults to "闪记"


class CaptureUpdate(BaseModel):
    text: str | None = None
    event_date: str | None = None
    category: str | None = None
    thread_id: str | None = None  # pass empty string "" to detach, any id to assign
    clear_thread: bool | None = None  # explicit unassign


@router.get("/inbox")
def list_inbox(workspace_id: str = Depends(request_workspace_id)) -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT e.*, s.title AS source_title, s.kind AS source_kind, s.file_path AS source_file_path
               FROM evidence e
               LEFT JOIN capture c ON c.id = e.capture_id
               LEFT JOIN source  s ON s.id = c.source_id
               WHERE e.workspace_id = ? AND e.thread_id IS NULL
               ORDER BY e.created_at DESC"""
            ,
            (workspace_id,),
        ).fetchall()
        out = []
        for r in rows:
            d = row_to_dict(r)
            d["owners"] = json.loads(d.pop("owners_json") or "[]")
            d["tags"] = json.loads(d.pop("tags_json") or "[]")
            out.append(d)
        return out
    finally:
        conn.close()


@router.post("", status_code=201)
def create_capture(body: CaptureIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    if not body.text.strip():
        raise HTTPException(400, "text is required")
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"invalid category: {body.category}")
    conn = connect()
    try:
        cur = conn.cursor()

        if body.thread_id:
            row = cur.execute(
                "SELECT 1 FROM thread WHERE id = ? AND workspace_id = ?",
                (body.thread_id, workspace_id),
            ).fetchone()
            if not row:
                raise HTTPException(404, "thread not found")

        source_id = _id("src")
        capture_id = _id("cap")
        evidence_id = _id("ev")
        now = _now()
        event_date = body.event_date or _current_local_minute()
        _insert_source(
            cur,
            source_id=source_id,
            kind=body.source_kind,
            title=body.source_title or "闪记",
            text=body.text,
            imported_at=now,
            event_time=event_date,
            workspace_id=workspace_id,
        )
        cur.execute(
            "INSERT INTO capture (id,source_id,seq,section_title,text,speaker,time_hint,confidence,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (capture_id, source_id, 0, None, body.text, None, event_date, 1.0, now),
        )
        cur.execute(
            "INSERT INTO evidence "
            "(id,capture_id,thread_id,text,event_date,owners_json,tags_json,category,status,importance,created_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                evidence_id,
                capture_id,
                body.thread_id,
                body.text,
                event_date,
                "[]",
                "[]",
                body.category,
                "ongoing",
                0.6,
                now,
                workspace_id,
            ),
        )

        if body.thread_id:
            cur.execute(
                "UPDATE thread SET last_active_at = ? WHERE id = ? AND workspace_id = ?",
                (now, body.thread_id, workspace_id),
            )

        conn.commit()

        row = cur.execute(
            """SELECT e.*, s.title AS source_title, s.kind AS source_kind, s.file_path AS source_file_path
               FROM evidence e
               LEFT JOIN capture c ON c.id = e.capture_id
               LEFT JOIN source  s ON s.id = c.source_id
               WHERE e.id = ? AND e.workspace_id = ?""",
            (evidence_id, workspace_id),
        ).fetchone()
        d = row_to_dict(row)
        d["owners"] = json.loads(d.pop("owners_json") or "[]")
        d["tags"] = json.loads(d.pop("tags_json") or "[]")
        return d
    finally:
        conn.close()


@router.patch("/{evidence_id}")
def update_capture(evidence_id: str, patch: CaptureUpdate, workspace_id: str = Depends(request_workspace_id)) -> dict:
    if patch.category and patch.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"invalid category: {patch.category}")
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM evidence WHERE id = ? AND workspace_id = ?",
            (evidence_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "capture not found")
        current = row_to_dict(row)

        new_text = patch.text if patch.text is not None else current["text"]
        new_date = patch.event_date if patch.event_date is not None else current["event_date"]
        new_cat = patch.category if patch.category is not None else current["category"]

        if patch.clear_thread:
            new_thread: str | None = None
        elif patch.thread_id is not None:
            if patch.thread_id == "":
                new_thread = None
            else:
                tr = conn.execute(
                    "SELECT 1 FROM thread WHERE id = ? AND workspace_id = ?",
                    (patch.thread_id, workspace_id),
                ).fetchone()
                if not tr:
                    raise HTTPException(404, "thread not found")
                new_thread = patch.thread_id
        else:
            new_thread = current["thread_id"]

        conn.execute(
            "UPDATE evidence SET text=?, event_date=?, category=?, thread_id=? WHERE id=? AND workspace_id=?",
            (new_text, new_date, new_cat, new_thread, evidence_id, workspace_id),
        )
        if new_thread:
            conn.execute(
                "UPDATE thread SET last_active_at = ? WHERE id = ? AND workspace_id = ?",
                (_now(), new_thread, workspace_id),
            )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM evidence WHERE id = ? AND workspace_id = ?",
            (evidence_id, workspace_id),
        ).fetchone()
        d = row_to_dict(updated)
        d["owners"] = json.loads(d.pop("owners_json") or "[]")
        d["tags"] = json.loads(d.pop("tags_json") or "[]")
        return d
    finally:
        conn.close()


@router.delete("/{evidence_id}", status_code=204)
def delete_capture(evidence_id: str, workspace_id: str = Depends(request_workspace_id)) -> None:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id FROM evidence WHERE id = ? AND workspace_id = ?",
            (evidence_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "capture not found")
        delete_owner_attachments(conn, "evidence", evidence_id, workspace_id)
        conn.execute(
            "DELETE FROM evidence WHERE id = ? AND workspace_id = ?",
            (evidence_id, workspace_id),
        )
        conn.commit()
    finally:
        conn.close()


class PromoteTodoIn(BaseModel):
    due_date: str | None = None
    text: str | None = None


@router.post("/{evidence_id}/promote-todo", status_code=201)
def promote_to_todo(evidence_id: str, body: PromoteTodoIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM evidence WHERE id = ? AND workspace_id = ?",
            (evidence_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "capture not found")
        ev = row_to_dict(row)
        text = (body.text or "").strip() or ev["text"]
        todo_id = _id("td")
        conn.execute(
            "INSERT INTO todo (id,thread_id,text,due_date,done,done_at,created_at,workspace_id) VALUES (?,?,?,?,?,?,?,?)",
            (todo_id, ev["thread_id"], text, body.due_date, 0, None, _now(), workspace_id),
        )
        conn.commit()
        todo = conn.execute(
            "SELECT * FROM todo WHERE id = ? AND workspace_id = ?",
            (todo_id, workspace_id),
        ).fetchone()
        return row_to_dict(todo)
    finally:
        conn.close()


class PromoteNoteIn(BaseModel):
    text: str | None = None
    category: str = "progress"
    event_date: str | None = None
    thread_id: str | None = None  # "" means explicit inbox; null falls back to note attachment


@router.post("/from-note/{note_id}", status_code=201)
def promote_note_to_evidence(note_id: str, body: PromoteNoteIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    """Promote a note to an evidence record."""
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM note WHERE id = ? AND workspace_id = ?",
            (note_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "note not found")
        note = row_to_dict(row)
        note_thread_ids = json.loads(note.get("thread_ids_json") or "[]")

        text = (body.text or "").strip() or note.get("body_md", "") or note.get("title", "")
        if not text:
            raise HTTPException(400, "note has no content to promote")

        if body.category not in VALID_CATEGORIES:
            raise HTTPException(400, f"invalid category: {body.category}")

        if body.thread_id == "":
            target_thread = None
        else:
            target_thread = body.thread_id

        if body.thread_id is None and not target_thread and note_thread_ids:
            target_thread = note_thread_ids[0]
        if target_thread:
            tr = conn.execute(
                "SELECT 1 FROM thread WHERE id = ? AND workspace_id = ?",
                (target_thread, workspace_id),
            ).fetchone()
            if not tr:
                raise HTTPException(404, "thread not found")

        event_date = body.event_date or note.get("day") or _current_local_minute()

        source_id = _id("src")
        capture_id = _id("cap")
        evidence_id = _id("ev")
        now = _now()

        _insert_source(
            conn,
            source_id=source_id,
            kind="quicknote",
            title=note.get("title") or "记事晋升",
            text=text,
            imported_at=now,
            event_time=event_date,
            workspace_id=workspace_id,
        )
        conn.execute(
            "INSERT INTO capture (id,source_id,seq,section_title,text,speaker,time_hint,confidence,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (capture_id, source_id, 0, None, text, None, event_date, 1.0, now),
        )
        conn.execute(
            "INSERT INTO evidence "
            "(id,capture_id,thread_id,text,event_date,owners_json,tags_json,category,status,importance,created_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (evidence_id, capture_id, target_thread, text, event_date, "[]", "[]", body.category, "ongoing", 0.6, now, workspace_id),
        )

        if target_thread:
            conn.execute(
                "UPDATE thread SET last_active_at = ? WHERE id = ? AND workspace_id = ?",
                (now, target_thread, workspace_id),
            )

        conn.commit()

        row = conn.execute(
            """SELECT e.*, s.title AS source_title, s.kind AS source_kind, s.file_path AS source_file_path
               FROM evidence e LEFT JOIN capture c ON c.id = e.capture_id LEFT JOIN source s ON s.id = c.source_id
               WHERE e.id = ? AND e.workspace_id = ?""",
            (evidence_id, workspace_id),
        ).fetchone()
        d = row_to_dict(row)
        d["owners"] = json.loads(d.pop("owners_json") or "[]")
        d["tags"] = json.loads(d.pop("tags_json") or "[]")
        return d
    finally:
        conn.close()
