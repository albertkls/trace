from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..db import connect, cursor, row_to_dict
from ..llm import LLMError, build_provider
from ..llm.base import ChatMessage
from ..project_utils import resolve_project_reference
from ..utils import TZ, new_id, now_iso, today_iso
from .llm import get_default_profile

router = APIRouter(prefix="/threads", tags=["threads"])

ALLOWED_THREAD_STATUS = {"active", "blocked", "done", "archived"}


def _now() -> str:
    return now_iso()


def _today() -> str:
    return today_iso()


def _id(prefix: str) -> str:
    return new_id(prefix)


def _normalize_started_at(value: str) -> str:
    raw = value.strip()
    if not raw:
        raise HTTPException(400, "started_at is required")

    if len(raw) == 10:
        try:
            parsed = datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=TZ)
        except ValueError as exc:
            raise HTTPException(400, "started_at must be a valid local date or datetime") from exc
        normalized = raw
    else:
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError as exc:
            raise HTTPException(400, "started_at must be a valid local date or datetime") from exc

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=TZ)
        else:
            parsed = parsed.astimezone(TZ)
        normalized = parsed.strftime("%Y-%m-%dT%H:%M")

    if parsed > datetime.now(TZ):
        raise HTTPException(400, "started_at cannot be in the future")

    return normalized


class ThreadIn(BaseModel):
    title: str
    project: str | None = None
    project_id: str | None = None
    owner: str | None = None
    summary: str = ""
    pinned: bool = False
    adopt_evidence_id: str | None = None  # optional — move an inbox evidence into this new thread


class ThreadPatch(BaseModel):
    title: str | None = None
    project: str | None = None
    project_id: str | None = None
    clear_project: bool | None = None
    owner: str | None = None
    status: str | None = None
    summary: str | None = None
    pinned: bool | None = None
    started_at: str | None = None


@router.post("", status_code=201)
def create_thread(body: ThreadIn) -> dict:
    if not body.title.strip():
        raise HTTPException(400, "title is required")
    conn = connect()
    try:
        cur = conn.cursor()
        project_id, project_name = resolve_project_reference(
            cur,
            project_id=body.project_id,
            project_name=body.project,
        )
        thread_id = _id("th")
        now = _now()
        today = _today()
        cur.execute(
            "INSERT INTO thread (id,title,project,project_id,owner,status,started_at,last_active_at,summary,pinned) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                thread_id,
                body.title.strip(),
                project_name,
                project_id,
                body.owner,
                "active",
                today,
                now,
                body.summary,
                1 if body.pinned else 0,
            ),
        )
        if body.adopt_evidence_id:
            erow = cur.execute(
                "SELECT id FROM evidence WHERE id = ?", (body.adopt_evidence_id,)
            ).fetchone()
            if not erow:
                raise HTTPException(404, "evidence to adopt not found")
            cur.execute(
                "UPDATE evidence SET thread_id = ? WHERE id = ?",
                (thread_id, body.adopt_evidence_id),
            )
        conn.commit()
        row = cur.execute(
            """
            SELECT t.*, COALESCE(p.name, t.project) AS project_name
            FROM thread t
            LEFT JOIN project p ON p.id = t.project_id
            WHERE t.id = ?
            """,
            (thread_id,),
        ).fetchone()
        thread = row_to_dict(row)
        thread["project"] = thread.pop("project_name") or thread.get("project")
        return thread
    finally:
        conn.close()


@router.patch("/{thread_id}")
def patch_thread(thread_id: str, patch: ThreadPatch) -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM thread WHERE id = ?", (thread_id,)).fetchone()
        if not row:
            raise HTTPException(404, "thread not found")
        current = row_to_dict(row)
        provided = patch.model_fields_set

        if "title" in provided and not (patch.title or "").strip():
            raise HTTPException(400, "title is required")
        if "status" in provided and patch.status not in ALLOWED_THREAD_STATUS:
            raise HTTPException(
                400, f"status must be one of {sorted(ALLOWED_THREAD_STATUS)}"
            )
        if "started_at" in provided:
            started_at = _normalize_started_at(patch.started_at or "")
        else:
            started_at = current["started_at"]

        if patch.clear_project:
            project_id = None
            project_name = None
        elif "project_id" in provided or "project" in provided:
            if (
                ("project_id" in provided and patch.project_id is None)
                and "project" not in provided
            ) or (
                ("project" in provided and patch.project is None)
                and "project_id" not in provided
            ):
                project_id = None
                project_name = None
            else:
                project_id, project_name = resolve_project_reference(
                    conn,
                    project_id=patch.project_id,
                    project_name=patch.project,
                )
        else:
            project_id = current.get("project_id")
            project_name = current.get("project")

        fields = {
            "title": patch.title.strip() if "title" in provided else current["title"],
            "project": project_name,
            "project_id": project_id,
            "owner": (
                patch.owner.strip() or None
                if isinstance(patch.owner, str)
                else None
                if "owner" in provided
                else current["owner"]
            ),
            "status": patch.status if "status" in provided else current["status"],
            "summary": (
                patch.summary if patch.summary is not None else ""
                if "summary" in provided
                else current["summary"]
            ),
            "pinned": (
                (1 if patch.pinned else 0)
                if "pinned" in provided
                else current["pinned"]
            ),
            "started_at": started_at,
        }
        conn.execute(
            "UPDATE thread SET title=?, project=?, project_id=?, owner=?, status=?, started_at=?, summary=?, pinned=?, last_active_at=? WHERE id=?",
            (
                fields["title"],
                fields["project"],
                fields["project_id"],
                fields["owner"],
                fields["status"],
                fields["started_at"],
                fields["summary"],
                fields["pinned"],
                _now(),
                thread_id,
            ),
        )
        conn.commit()
        refreshed = conn.execute(
            """
            SELECT t.*, COALESCE(p.name, t.project) AS project_name
            FROM thread t
            LEFT JOIN project p ON p.id = t.project_id
            WHERE t.id = ?
            """,
            (thread_id,),
        ).fetchone()
        thread = row_to_dict(refreshed)
        thread["project"] = thread.pop("project_name") or thread.get("project")
        return thread
    finally:
        conn.close()


@router.get("")
def list_threads(project_id: str | None = None) -> list[dict]:
    conn = connect()
    try:
        sql = """
            SELECT t.*, COALESCE(p.name, t.project) AS project_name, COUNT(e.id) AS evidence_count
            FROM thread t
            LEFT JOIN project p ON p.id = t.project_id
            LEFT JOIN evidence e ON e.thread_id = t.id
        """
        params: list[str] = []
        if project_id:
            sql += " WHERE t.project_id = ?"
            params.append(project_id)
        sql += " GROUP BY t.id ORDER BY t.pinned DESC, t.last_active_at DESC"
        rows = conn.execute(sql, tuple(params)).fetchall()
        out = []
        for row in rows:
            thread = row_to_dict(row)
            thread["project"] = thread.pop("project_name") or thread.get("project")
            out.append(thread)
        return out
    finally:
        conn.close()


@router.post("/{thread_id}/summarize")
async def summarize_thread(thread_id: str) -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM thread WHERE id = ?", (thread_id,)).fetchone()
        if not row:
            raise HTTPException(404, "thread not found")
        thread = row_to_dict(row)
        evidences = [
            row_to_dict(r)
            for r in conn.execute(
                "SELECT * FROM evidence WHERE thread_id = ? ORDER BY event_date, id",
                (thread_id,),
            )
        ]
        for e in evidences:
            e["owners"] = json.loads(e.pop("owners_json") or "[]")
            e["tags"] = json.loads(e.pop("tags_json") or "[]")
    finally:
        conn.close()

    profile = get_default_profile()
    if not profile:
        raise HTTPException(400, "no llm profile configured")
    if not profile.api_key:
        raise HTTPException(400, f"profile '{profile.name}' has no api_key configured")
    provider = build_provider(profile)

    evidence_lines = [
        f"[{i+1}] [{e.get('category','')}] {e.get('event_date') or '未定日期'} — {e['text']}"
        for i, e in enumerate(evidences)
    ]

    messages = [
        ChatMessage(
            role="system",
            content=(
                "你是 Trace 的摘要助手。根据工作线的证据条目，"
                "生成 2-4 句话的精炼摘要，描述这条工作线的核心进展与现状。"
                "直接输出正文，不要前言或结语。"
            ),
        ),
        ChatMessage(
            role="user",
            content=(
                f"工作线：{thread['title']}\n\n证据：\n"
                + ("\n".join(evidence_lines) if evidence_lines else "（暂无证据）")
            ),
        ),
    ]

    summary_text = ""
    try:
        async for chunk in provider.stream_chat(messages):
            if chunk.delta:
                summary_text += chunk.delta
    except LLMError as e:
        raise HTTPException(502, f"LLM error: {e}") from e

    with cursor() as cur:
        cur.execute(
            "UPDATE thread SET summary=?, last_active_at=? WHERE id=?",
            (summary_text.strip(), _now(), thread_id),
        )
        refreshed = cur.execute("SELECT * FROM thread WHERE id=?", (thread_id,)).fetchone()
        return row_to_dict(refreshed)


@router.delete("/{thread_id}", status_code=204)
def delete_thread(thread_id: str) -> None:
    with cursor() as cur:
        row = cur.execute("SELECT id FROM thread WHERE id = ?", (thread_id,)).fetchone()
        if not row:
            raise HTTPException(404, "thread not found")
        # Manually cascade-delete evidence and todos (schema uses ON DELETE SET NULL)
        cur.execute("DELETE FROM evidence WHERE thread_id = ?", (thread_id,))
        cur.execute("DELETE FROM todo WHERE thread_id = ?", (thread_id,))
        # Scrub dead thread_id from note.thread_ids_json and report.thread_ids_json
        for note_row in cur.execute(
            "SELECT id, thread_ids_json FROM note WHERE thread_ids_json LIKE ?",
            (f"%{thread_id}%",),
        ).fetchall():
            try:
                ids: list[str] = json.loads(note_row["thread_ids_json"] or "[]")
                if thread_id in ids:
                    ids = [x for x in ids if x != thread_id]
                    cur.execute(
                        "UPDATE note SET thread_ids_json=? WHERE id=?",
                        (json.dumps(ids, ensure_ascii=False), note_row["id"]),
                    )
            except Exception:  # noqa: BLE001
                pass
        for report_row in cur.execute(
            "SELECT id, thread_ids_json FROM report WHERE thread_ids_json LIKE ?",
            (f"%{thread_id}%",),
        ).fetchall():
            try:
                ids = json.loads(report_row["thread_ids_json"] or "[]")
                if thread_id in ids:
                    ids = [x for x in ids if x != thread_id]
                    cur.execute(
                        "UPDATE report SET thread_ids_json=? WHERE id=?",
                        (json.dumps(ids, ensure_ascii=False), report_row["id"]),
                    )
            except Exception:  # noqa: BLE001
                pass
        cur.execute("DELETE FROM thread WHERE id = ?", (thread_id,))


@router.get("/{thread_id}")
def get_thread(thread_id: str) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            """
            SELECT t.*, COALESCE(p.name, t.project) AS project_name
            FROM thread t
            LEFT JOIN project p ON p.id = t.project_id
            WHERE t.id = ?
            """,
            (thread_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "thread not found")
        thread = row_to_dict(row)
        thread["project"] = thread.pop("project_name") or thread.get("project")
        evidences = [
            row_to_dict(r)
            for r in conn.execute(
                "SELECT * FROM evidence WHERE thread_id = ? ORDER BY event_date, id",
                (thread_id,),
            )
        ]
        for e in evidences:
            e["owners"] = json.loads(e.pop("owners_json") or "[]")
            e["tags"] = json.loads(e.pop("tags_json") or "[]")
        todos = [
            row_to_dict(r)
            for r in conn.execute(
                "SELECT * FROM todo WHERE thread_id = ? ORDER BY done, due_date",
                (thread_id,),
            )
        ]
        thread["evidence"] = evidences
        thread["todos"] = todos
        return thread
    finally:
        conn.close()
