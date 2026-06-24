from __future__ import annotations

import hashlib
import json
import sqlite3
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect, row_to_dict
import uuid

from ..llm import LLMError, build_provider
from ..llm.base import ChatMessage
from ..utils import local_minute, new_id, now_iso
from ..workspace import request_workspace_id
from .attachments import delete_owner_attachments
from .llm import get_default_profile

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


class CaptureBatchIn(BaseModel):
    ids: list[str]
    action: Literal["assign_thread", "category", "delete", "promote_todo"]
    thread_id: str | None = None
    category: str | None = None
    due_date: str | None = None


class CaptureBatchResult(BaseModel):
    updated: int = 0
    deleted: int = 0
    promoted: int = 0


class CaptureAISuggestion(BaseModel):
    category: str
    project_id: str | None = None
    thread_id: str | None = None
    new_thread_title: str | None = None
    todo_text: str | None = None
    summary: str
    reason: str
    confidence: float = 0.0


def _json_object_from_text(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            raise HTTPException(502, "LLM did not return JSON") from None
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise HTTPException(502, f"LLM returned invalid JSON: {exc}") from None
    if not isinstance(parsed, dict):
        raise HTTPException(502, "LLM returned non-object JSON")
    return parsed


def _clean_suggestion(raw: dict, *, project_ids: set[str], thread_ids: set[str]) -> dict:
    category = str(raw.get("category") or "progress").strip()
    if category not in VALID_CATEGORIES:
        category = "progress"

    project_id = raw.get("project_id")
    project_id = str(project_id).strip() if project_id else None
    if project_id not in project_ids:
        project_id = None

    thread_id = raw.get("thread_id")
    thread_id = str(thread_id).strip() if thread_id else None
    if thread_id not in thread_ids:
        thread_id = None

    if thread_id:
        new_thread_title = None
    else:
        new_thread_title = str(raw.get("new_thread_title") or "").strip()[:80] or None

    todo_text = str(raw.get("todo_text") or "").strip()[:240] or None
    summary = str(raw.get("summary") or "").strip()[:240]
    reason = str(raw.get("reason") or "").strip()[:240]
    try:
        confidence = float(raw.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    return CaptureAISuggestion(
        category=category,
        project_id=project_id,
        thread_id=thread_id,
        new_thread_title=new_thread_title,
        todo_text=todo_text,
        summary=summary or "建议已生成，但模型没有给出摘要。",
        reason=reason or "根据证据文本和当前项目/线程上下文推断。",
        confidence=confidence,
    ).model_dump()


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


@router.post("/{evidence_id}/ai-suggest")
async def suggest_capture_organization(
    evidence_id: str,
    workspace_id: str = Depends(request_workspace_id),
) -> dict:
    conn = connect()
    try:
        evidence_row = conn.execute(
            """SELECT e.*, s.title AS source_title, s.kind AS source_kind
               FROM evidence e
               LEFT JOIN capture c ON c.id = e.capture_id
               LEFT JOIN source s ON s.id = c.source_id
               WHERE e.id = ? AND e.workspace_id = ?""",
            (evidence_id, workspace_id),
        ).fetchone()
        if not evidence_row:
            raise HTTPException(404, "capture not found")
        evidence = row_to_dict(evidence_row)
        project_rows = conn.execute(
            "SELECT id, name, status, summary FROM project WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 24",
            (workspace_id,),
        ).fetchall()
        thread_rows = conn.execute(
            """SELECT t.id, t.title, t.project_id, COALESCE(p.name, t.project) AS project_name,
                      t.status, t.summary, COUNT(e.id) AS evidence_count
               FROM thread t
               LEFT JOIN project p ON p.id = t.project_id
               LEFT JOIN evidence e ON e.thread_id = t.id
               WHERE t.workspace_id = ?
               GROUP BY t.id
               ORDER BY t.pinned DESC, t.last_active_at DESC
               LIMIT 36""",
            (workspace_id,),
        ).fetchall()
        projects = [row_to_dict(row) for row in project_rows]
        threads = [row_to_dict(row) for row in thread_rows]
    finally:
        conn.close()

    profile = get_default_profile()
    if not profile:
        raise HTTPException(400, "no llm profile configured")
    if not profile.api_key:
        raise HTTPException(400, f"profile '{profile.name}' has no api_key configured")

    project_lines = [
        f"- id={p['id']} name={p['name']} status={p['status']} summary={p.get('summary') or ''}"
        for p in projects
    ]
    thread_lines = [
        f"- id={t['id']} title={t['title']} project_id={t.get('project_id') or ''} "
        f"project={t.get('project_name') or ''} status={t['status']} evidence_count={t['evidence_count']} "
        f"summary={t.get('summary') or ''}"
        for t in threads
    ]
    messages = [
        ChatMessage(
            role="system",
            content=(
                "你是 Trace 的收件箱整理员。你的任务是把一条工作证据整理成可执行建议。"
                "只能返回 JSON 对象，不能输出 Markdown 或解释文字。"
                "category 只能是 progress/decision/risk/plan/support。"
                "project_id 和 thread_id 只能使用用户给出的现有 id；如果没有合适对象就返回 null。"
                "如果没有合适 thread_id，但适合创建新线程，请给 new_thread_title。"
                "如果证据明显包含待办动作，请给 todo_text，否则为 null。"
            ),
        ),
        ChatMessage(
            role="user",
            content=(
                "证据：\n"
                f"id={evidence['id']}\n"
                f"source={evidence.get('source_title') or evidence.get('source_kind') or '未知'}\n"
                f"date={evidence.get('event_date') or '未定日期'}\n"
                f"text={evidence['text']}\n\n"
                "现有项目：\n"
                + ("\n".join(project_lines) if project_lines else "（无）")
                + "\n\n现有线程：\n"
                + ("\n".join(thread_lines) if thread_lines else "（无）")
                + "\n\n请返回 JSON，字段："
                '{"category":"progress","project_id":null,"thread_id":null,'
                '"new_thread_title":null,"todo_text":null,"summary":"一句话摘要",'
                '"reason":"为什么这样整理","confidence":0.0}'
            ),
        ),
    ]

    provider = build_provider(profile)
    text = ""
    try:
        async for chunk in provider.stream_chat(messages):
            if chunk.delta:
                text += chunk.delta
            if chunk.done:
                break
    except LLMError as e:
        raise HTTPException(502, f"LLM error: {e}") from e

    raw = _json_object_from_text(text)
    return _clean_suggestion(
        raw,
        project_ids={p["id"] for p in projects},
        thread_ids={t["id"] for t in threads},
    )


@router.post("/batch")
def batch_update_captures(
    body: CaptureBatchIn,
    workspace_id: str = Depends(request_workspace_id),
) -> dict:
    ids = [item_id for item_id in dict.fromkeys(body.ids) if item_id]
    if not ids:
        raise HTTPException(400, "ids are required")
    conn = connect()
    try:
        placeholders = ",".join("?" for _ in ids)
        rows = conn.execute(
            f"SELECT * FROM evidence WHERE workspace_id = ? AND id IN ({placeholders})",
            (workspace_id, *ids),
        ).fetchall()
        by_id = {row["id"]: row for row in rows}
        missing = [item_id for item_id in ids if item_id not in by_id]
        if missing:
            raise HTTPException(404, f"captures not found: {', '.join(missing)}")

        result = CaptureBatchResult()
        now = _now()

        if body.action == "assign_thread":
            if not body.thread_id:
                raise HTTPException(400, "thread_id is required")
            thread = conn.execute(
                "SELECT id FROM thread WHERE id = ? AND workspace_id = ?",
                (body.thread_id, workspace_id),
            ).fetchone()
            if not thread:
                raise HTTPException(404, "thread not found")
            conn.execute(
                f"UPDATE evidence SET thread_id = ? WHERE workspace_id = ? AND id IN ({placeholders})",
                (body.thread_id, workspace_id, *ids),
            )
            conn.execute(
                "UPDATE thread SET last_active_at = ? WHERE id = ? AND workspace_id = ?",
                (now, body.thread_id, workspace_id),
            )
            result.updated = len(ids)

        elif body.action == "category":
            if body.category not in VALID_CATEGORIES:
                raise HTTPException(400, f"invalid category: {body.category}")
            conn.execute(
                f"UPDATE evidence SET category = ? WHERE workspace_id = ? AND id IN ({placeholders})",
                (body.category, workspace_id, *ids),
            )
            result.updated = len(ids)

        elif body.action == "delete":
            for evidence_id in ids:
                delete_owner_attachments(conn, "evidence", evidence_id, workspace_id)
            conn.execute(
                f"DELETE FROM evidence WHERE workspace_id = ? AND id IN ({placeholders})",
                (workspace_id, *ids),
            )
            result.deleted = len(ids)

        elif body.action == "promote_todo":
            for evidence_id in ids:
                ev = by_id[evidence_id]
                conn.execute(
                    "INSERT INTO todo (id,thread_id,text,due_date,done,done_at,created_at,workspace_id) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (
                        _id("td"),
                        ev["thread_id"],
                        ev["text"],
                        body.due_date,
                        0,
                        None,
                        now,
                        workspace_id,
                    ),
                )
            result.promoted = len(ids)

        conn.commit()
        return result.model_dump()
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
