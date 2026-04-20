from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict

router = APIRouter(prefix="/captures", tags=["captures"])

TZ = timezone(timedelta(hours=8))
VALID_CATEGORIES = {"progress", "decision", "risk", "plan", "support"}


def _now() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def _current_local_minute() -> str:
    """Minute-precision local timestamp without tz suffix — matches the
    `YYYY-MM-DDTHH:MM` form the frontend stores in `event_date` / `due_date`."""
    return datetime.now(TZ).strftime("%Y-%m-%dT%H:%M")


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


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
def list_inbox() -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT e.*, s.title AS source_title, s.kind AS source_kind
               FROM evidence e
               LEFT JOIN capture c ON c.id = e.capture_id
               LEFT JOIN source  s ON s.id = c.source_id
               WHERE e.thread_id IS NULL
               ORDER BY e.created_at DESC"""
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
def create_capture(body: CaptureIn) -> dict:
    if not body.text.strip():
        raise HTTPException(400, "text is required")
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"invalid category: {body.category}")
    conn = connect()
    try:
        cur = conn.cursor()

        if body.thread_id:
            row = cur.execute("SELECT 1 FROM thread WHERE id = ?", (body.thread_id,)).fetchone()
            if not row:
                raise HTTPException(404, "thread not found")

        source_id = _id("src")
        capture_id = _id("cap")
        evidence_id = _id("ev")
        now = _now()
        event_date = body.event_date or _current_local_minute()
        source_hash = _hash(body.text)

        try:
            cur.execute(
                "INSERT INTO source (id,kind,title,raw_text,hash,imported_at,event_time,metadata_json) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (
                    source_id,
                    body.source_kind,
                    body.source_title or "闪记",
                    body.text,
                    source_hash,
                    now,
                    event_date,
                    "{}",
                ),
            )
        except sqlite3.IntegrityError as e:
            # Quick captures should tolerate repeated text instead of surfacing a 500
            # from the source.hash uniqueness constraint.
            if "source.hash" not in str(e):
                raise
            cur.execute(
                "INSERT INTO source (id,kind,title,raw_text,hash,imported_at,event_time,metadata_json) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (
                    source_id,
                    body.source_kind,
                    body.source_title or "闪记",
                    body.text,
                    _hash(f"{body.text}\n{event_date}\n{uuid.uuid4().hex}"),
                    now,
                    event_date,
                    "{}",
                ),
            )
        cur.execute(
            "INSERT INTO capture (id,source_id,seq,section_title,text,speaker,time_hint,confidence,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (capture_id, source_id, 0, None, body.text, None, event_date, 1.0, now),
        )
        cur.execute(
            "INSERT INTO evidence "
            "(id,capture_id,thread_id,text,event_date,owners_json,tags_json,category,status,importance,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
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
            ),
        )

        if body.thread_id:
            cur.execute(
                "UPDATE thread SET last_active_at = ? WHERE id = ?",
                (now, body.thread_id),
            )

        conn.commit()

        row = cur.execute(
            """SELECT e.*, s.title AS source_title, s.kind AS source_kind
               FROM evidence e
               LEFT JOIN capture c ON c.id = e.capture_id
               LEFT JOIN source  s ON s.id = c.source_id
               WHERE e.id = ?""",
            (evidence_id,),
        ).fetchone()
        d = row_to_dict(row)
        d["owners"] = json.loads(d.pop("owners_json") or "[]")
        d["tags"] = json.loads(d.pop("tags_json") or "[]")
        return d
    finally:
        conn.close()


@router.patch("/{evidence_id}")
def update_capture(evidence_id: str, patch: CaptureUpdate) -> dict:
    if patch.category and patch.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"invalid category: {patch.category}")
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
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
                tr = conn.execute("SELECT 1 FROM thread WHERE id = ?", (patch.thread_id,)).fetchone()
                if not tr:
                    raise HTTPException(404, "thread not found")
                new_thread = patch.thread_id
        else:
            new_thread = current["thread_id"]

        conn.execute(
            "UPDATE evidence SET text=?, event_date=?, category=?, thread_id=? WHERE id=?",
            (new_text, new_date, new_cat, new_thread, evidence_id),
        )
        if new_thread:
            conn.execute(
                "UPDATE thread SET last_active_at = ? WHERE id = ?",
                (_now(), new_thread),
            )
        conn.commit()
        updated = conn.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        d = row_to_dict(updated)
        d["owners"] = json.loads(d.pop("owners_json") or "[]")
        d["tags"] = json.loads(d.pop("tags_json") or "[]")
        return d
    finally:
        conn.close()


@router.delete("/{evidence_id}", status_code=204)
def delete_capture(evidence_id: str) -> None:
    conn = connect()
    try:
        cur = conn.execute("DELETE FROM evidence WHERE id = ?", (evidence_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "capture not found")
        conn.commit()
    finally:
        conn.close()


class PromoteTodoIn(BaseModel):
    due_date: str | None = None
    text: str | None = None


@router.post("/{evidence_id}/promote-todo", status_code=201)
def promote_to_todo(evidence_id: str, body: PromoteTodoIn) -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM evidence WHERE id = ?", (evidence_id,)).fetchone()
        if not row:
            raise HTTPException(404, "capture not found")
        ev = row_to_dict(row)
        text = (body.text or "").strip() or ev["text"]
        todo_id = _id("td")
        conn.execute(
            "INSERT INTO todo (id,thread_id,text,due_date,done,done_at,created_at) VALUES (?,?,?,?,?,?,?)",
            (todo_id, ev["thread_id"], text, body.due_date, 0, None, _now()),
        )
        conn.commit()
        todo = conn.execute("SELECT * FROM todo WHERE id = ?", (todo_id,)).fetchone()
        return row_to_dict(todo)
    finally:
        conn.close()
