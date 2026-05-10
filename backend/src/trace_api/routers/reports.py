from __future__ import annotations

import json
from datetime import date as date_cls, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..db import connect, row_to_dict
from ..llm import LLMError, build_provider
from ..llm.prompts import (
    REWRITE_OPS,
    build_report_messages,
    build_rewrite_messages,
    rewrite_apply_mode,
)
from ..project_utils import require_project
from ..utils import TZ, new_id, now_iso
from .llm import get_default_profile
from ..workspace import request_workspace_id

router = APIRouter(prefix="/reports", tags=["reports"])

ALLOWED_AUDIENCES = {"boss", "internal", "1on1", "retro", "self"}
ALLOWED_STATUS = {"draft", "final", "archived"}

AUDIENCE_SUFFIX = {
    "boss": "老板版",
    "internal": "团队版",
    "1on1": "1on1",
    "retro": "复盘",
    "self": "自留",
}


def _new_id() -> str:
    return new_id("rp")


def _now_iso() -> str:
    return now_iso()


def _parse_iso_date(s: str) -> date_cls:
    """Accept both `YYYY-MM-DD` and `YYYY-MM-DDTHH:MM[:SS]` — returns the date portion."""
    try:
        if "T" in s:
            return datetime.fromisoformat(s).date()
        return date_cls.fromisoformat(s)
    except ValueError:
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        except ValueError as e:
            raise HTTPException(400, f"invalid date '{s}': {e}") from None
    except TypeError as e:
        raise HTTPException(400, f"invalid date '{s}': {e}") from None


def _parse_iso_moment(s: str) -> datetime:
    """Accept date-only or minute/second-precision timestamps. Used for range checks."""
    try:
        if "T" in s:
            return datetime.fromisoformat(s)
        return datetime.combine(date_cls.fromisoformat(s), datetime.min.time())
    except ValueError as e:
        raise HTTPException(400, f"invalid datetime '{s}': {e}") from None


def _validated_thread_ids(
    conn,
    thread_ids: list[str] | None,
    project_id: str | None = None,
    workspace_id: str | None = None,
) -> list[str]:
    """De-duplicate + verify each id exists. Empty list means all-scope."""
    cleaned = [tid for tid in dict.fromkeys(thread_ids or []) if tid]
    if not cleaned:
        return []
    placeholders = ",".join("?" for _ in cleaned)
    if workspace_id:
        rows = conn.execute(
            f"SELECT id, project_id FROM thread WHERE workspace_id = ? AND id IN ({placeholders})",
            (workspace_id, *cleaned),
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT id, project_id FROM thread WHERE id IN ({placeholders})",
            tuple(cleaned),
        ).fetchall()
    found = {r["id"] for r in rows}
    missing = [tid for tid in cleaned if tid not in found]
    if missing:
        raise HTTPException(404, f"threads not found: {', '.join(missing)}")
    if project_id is not None:
        outside = [r["id"] for r in rows if r["project_id"] != project_id]
        if outside:
            raise HTTPException(
                400, f"threads do not belong to project: {', '.join(outside)}"
            )
    return cleaned


def _iso_week_label(d: date_cls) -> str:
    year, week, _ = d.isocalendar()
    return f"{year}-W{week:02d}"


def _default_label(period_start: str, period_end: str) -> str:
    ds = _parse_iso_date(period_start)
    de = _parse_iso_date(period_end)
    if de < ds:
        raise HTTPException(400, "period_end must be on or after period_start")
    span = (de - ds).days + 1
    # weekly (7 days aligned roughly) — use ISO week of start
    if span <= 7:
        return _iso_week_label(ds)
    # monthly (in same calendar month)
    if ds.year == de.year and ds.month == de.month:
        return f"{ds.year}-{ds.month:02d}"
    # otherwise range
    return f"{ds.isoformat()}~{de.isoformat()}"


def _default_title(period_label: str, audience: str) -> str:
    # e.g. "2026-W16 周报（老板版）"
    suffix = AUDIENCE_SUFFIX.get(audience, audience)
    if period_label.startswith(tuple(str(y) for y in range(2000, 2100))) and "-W" in period_label:
        kind = "周报"
    elif period_label.count("-") == 1 and len(period_label) == 7:
        kind = "月报"
    else:
        kind = "报告"
    return f"{period_label} {kind}（{suffix}）"


class ReportCreate(BaseModel):
    period_start: str
    period_end: str
    audience: str = "boss"
    project_id: str | None = None
    thread_ids: list[str] | None = None
    period_label: str | None = None
    title: str | None = None
    body_md: str | None = None


class ReportPatch(BaseModel):
    title: str | None = None
    body_md: str | None = None
    outline: list[dict] | None = None
    status: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    period_label: str | None = None
    audience: str | None = None
    project_id: str | None = None
    clear_project: bool | None = None
    thread_ids: list[str] | None = None


@router.get("")
def list_reports(
    project_id: str | None = None,
    workspace_id: str = Depends(request_workspace_id),
) -> list[dict]:
    conn = connect()
    try:
        sql = (
            "SELECT r.id, r.period_label, r.period_start, r.period_end, r.audience, "
            "r.project_id, p.name AS project_name, r.thread_ids_json, r.title, r.status, r.updated_at "
            "FROM report r LEFT JOIN project p ON p.id = r.project_id"
        )
        params: list[str] = [workspace_id]
        sql += " WHERE r.workspace_id = ?"
        if project_id:
            sql += " AND r.project_id = ?"
            params.append(project_id)
        sql += " ORDER BY r.updated_at DESC"
        rows = conn.execute(sql, tuple(params)).fetchall()
        out = []
        for row in rows:
            report = row_to_dict(row)
            report["thread_ids"] = json.loads(report.pop("thread_ids_json") or "[]")
            out.append(report)
        return out
    finally:
        conn.close()


@router.post("")
def create_report(body: ReportCreate, workspace_id: str = Depends(request_workspace_id)) -> dict:
    ds = _parse_iso_moment(body.period_start)
    de = _parse_iso_moment(body.period_end)
    if de < ds:
        raise HTTPException(400, "period_end must be on or after period_start")
    audience = (body.audience or "boss").strip()
    if audience not in ALLOWED_AUDIENCES:
        raise HTTPException(400, f"audience must be one of {sorted(ALLOWED_AUDIENCES)}")
    label = (body.period_label or _default_label(body.period_start, body.period_end)).strip()
    if not label:
        raise HTTPException(400, "period_label is empty")
    title = (body.title or _default_title(label, audience)).strip()
    if not title:
        raise HTTPException(400, "title is empty")

    rp_id = _new_id()
    now = _now_iso()
    conn = connect()
    try:
        project_id = body.project_id
        if project_id:
            require_project(conn, project_id, workspace_id)
        thread_ids = _validated_thread_ids(conn, body.thread_ids, project_id, workspace_id)
        conn.execute(
            "INSERT INTO report (id,period_label,period_start,period_end,audience,project_id,thread_ids_json,"
            "title,body_md,outline_json,cited_evidence_json,status,created_at,updated_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                rp_id,
                label,
                body.period_start,
                body.period_end,
                audience,
                project_id,
                json.dumps(thread_ids, ensure_ascii=False),
                title,
                body.body_md or "",
                "[]",
                "[]",
                "draft",
                now,
                now,
                workspace_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return get_report(rp_id, workspace_id)


@router.get("/{report_id}")
def get_report(report_id: str, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            """
            SELECT r.*, p.name AS project_name
            FROM report r
            LEFT JOIN project p ON p.id = r.project_id
            WHERE r.id = ? AND r.workspace_id = ?
            """,
            (report_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "report not found")
        report = row_to_dict(row)
        report["thread_ids"] = json.loads(report.pop("thread_ids_json") or "[]")
        report["outline"] = json.loads(report.pop("outline_json"))
        report["cited_evidence"] = json.loads(report.pop("cited_evidence_json"))
        report["cited_evidence_detail"] = _hydrate_evidence(conn, report["cited_evidence"], workspace_id)
        return report
    finally:
        conn.close()


def _hydrate_evidence(conn, ids: list[str], workspace_id: str) -> list[dict]:
    """Look up full evidence rows by id, preserving the input order.

    Missing ids (e.g. deleted evidence) produce a tombstone stub so the
    frontend can still render the slot + its citation number.
    """
    if not ids:
        return []
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"""SELECT e.id, e.text, e.event_date, e.category, e.status, e.importance,
                   e.owners_json, e.tags_json, e.thread_id,
                   t.title AS thread_title, COALESCE(p.name, t.project) AS thread_project
            FROM evidence e
            LEFT JOIN thread t ON t.id = e.thread_id
            LEFT JOIN project p ON p.id = t.project_id
            WHERE e.workspace_id = ? AND e.id IN ({placeholders})""",
        (workspace_id, *ids),
    ).fetchall()
    by_id: dict[str, dict] = {}
    for r in rows:
        d = row_to_dict(r)
        d["owners"] = json.loads(d.pop("owners_json") or "[]")
        d["tags"] = json.loads(d.pop("tags_json") or "[]")
        by_id[d["id"]] = d
    out: list[dict] = []
    for eid in ids:
        if eid in by_id:
            out.append(by_id[eid])
        else:
            out.append(
                {
                    "id": eid,
                    "text": "（证据已删除）",
                    "event_date": None,
                    "category": "progress",
                    "status": "ongoing",
                    "importance": 0.0,
                    "owners": [],
                    "tags": [],
                    "thread_id": None,
                    "thread_title": None,
                    "thread_project": None,
                    "missing": True,
                }
            )
    return out


class ComposeRequest(BaseModel):
    profile_id: str | None = None
    note: str | None = None


class RewriteRequest(BaseModel):
    op: str  # "continue" | "compress" | "retone" | "custom"
    profile_id: str | None = None
    target_chars: int | None = None
    target_audience: str | None = None
    instruction: str | None = None


def _resolve_profile(profile_id: str | None):
    """Load the LLM profile by id or fall back to default. Raises HTTPException."""
    if profile_id:
        conn = connect()
        try:
            prow = conn.execute(
                "SELECT id,name,provider,protocol,base_url,api_key,model,temperature,max_tokens,is_default "
                "FROM llm_profile WHERE id = ?",
                (profile_id,),
            ).fetchone()
        finally:
            conn.close()
        if not prow:
            raise HTTPException(404, "llm profile not found")
        from ..llm import Profile  # local import to avoid cycles
        profile = Profile.from_row(row_to_dict(prow))
    else:
        profile = get_default_profile()
    if not profile:
        raise HTTPException(400, "no llm profile configured")
    if not profile.api_key:
        raise HTTPException(400, f"profile '{profile.name}' has no api_key configured")
    return profile


def _collect_evidence_lines(
    conn,
    period_start: str,
    period_end: str,
    thread_ids: list[str] | None = None,
    project_id: str | None = None,
    workspace_id: str | None = None,
) -> tuple[list[str], list[str]]:
    """Return (lines, evidence_ids) for evidence whose event_date falls in [start, end].

    `datetime(...)` wrapping makes the range check work uniformly across legacy
    `YYYY-MM-DD` and new `YYYY-MM-DDTHH:MM` stored values. Empty/None `thread_ids`
    means all-scope; a non-empty list narrows to those threads only.
    """
    sql = """
        SELECT e.id, e.text, e.event_date, e.category, e.owners_json,
               t.title AS thread_title, COALESCE(p.name, t.project) AS thread_project
        FROM evidence e LEFT JOIN thread t ON t.id = e.thread_id
        LEFT JOIN project p ON p.id = t.project_id
        WHERE e.event_date IS NOT NULL
          AND datetime(e.event_date) BETWEEN datetime(?) AND datetime(?)
    """
    params: list[str] = [period_start, period_end]
    if workspace_id:
        sql += " AND e.workspace_id = ?"
        params.append(workspace_id)
    if project_id:
        sql += " AND t.project_id = ?"
        params.append(project_id)
    if thread_ids:
        placeholders = ",".join("?" for _ in thread_ids)
        sql += f" AND e.thread_id IN ({placeholders})"
        params.extend(thread_ids)
    sql += " ORDER BY datetime(e.event_date) ASC, e.id ASC"
    rows = conn.execute(sql, tuple(params)).fetchall()
    lines: list[str] = []
    ids: list[str] = []
    for idx, r in enumerate(rows, start=1):
        cat = {
            "progress": "进展",
            "decision": "决定",
            "risk": "风险",
            "plan": "计划",
            "support": "协同",
        }.get(r["category"], r["category"])
        try:
            owners = ", ".join(json.loads(r["owners_json"] or "[]")) or "—"
        except (json.JSONDecodeError, TypeError):
            owners = "—"
        project = r["thread_project"] or "—"
        thread_title = r["thread_title"] or "（散点）"
        lines.append(
            f"[{idx}] {r['event_date']} · {cat} · {project} / {thread_title} · "
            f"{r['text']}（owners: {owners}）"
        )
        ids.append(r["id"])
    return lines, ids


@router.post("/{report_id}/compose")
async def compose_report(report_id: str, body: ComposeRequest, workspace_id: str = Depends(request_workspace_id)):
    """Stream a fresh draft via the configured LLM and persist the final body when done.

    Response is Server-Sent Events:
        event: delta  data: {"text": "..."}
        event: done   data: {"body_md": "...", "cited_evidence": [...]}
        event: error  data: {"message": "..."}
    """
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM report WHERE id = ? AND workspace_id = ?",
            (report_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "report not found")
        report = row_to_dict(row)
        thread_ids = json.loads(report.get("thread_ids_json") or "[]")
        project_id = report.get("project_id")
        lines, ev_ids = _collect_evidence_lines(
            conn, report["period_start"], report["period_end"], thread_ids, project_id, workspace_id
        )
        project_context = None
        if project_id:
            prow = conn.execute(
                "SELECT id, name, status, summary FROM project WHERE id = ? AND workspace_id = ?",
                (project_id, workspace_id),
            ).fetchone()
            if prow:
                thread_rows = conn.execute(
                    "SELECT title FROM thread WHERE project_id = ? ORDER BY pinned DESC, last_active_at DESC",
                    (project_id,),
                ).fetchall()
                project_context = row_to_dict(prow)
                project_context["thread_titles"] = [r["title"] for r in thread_rows]
    finally:
        conn.close()

    profile = _resolve_profile(body.profile_id)

    messages = build_report_messages(
        period_label=report["period_label"],
        period_start=report["period_start"],
        period_end=report["period_end"],
        audience=report["audience"],
        evidence_lines=lines,
        project_context=project_context,
        context_note=body.note,
    )
    provider = build_provider(profile)

    async def event_stream():
        pieces: list[str] = []
        try:
            async for chunk in provider.stream_chat(messages):
                if chunk.delta:
                    pieces.append(chunk.delta)
                    yield _sse("delta", {"text": chunk.delta})
                if chunk.done:
                    break
        except LLMError as e:
            yield _sse("error", {"message": str(e)})
            return
        except Exception as e:  # noqa: BLE001
            yield _sse("error", {"message": f"{type(e).__name__}: {e}"})
            return

        body_md = "".join(pieces).strip()
        now = datetime.now(TZ).isoformat(timespec="seconds")
        conn2 = connect()
        try:
            conn2.execute(
                "UPDATE report SET body_md=?, cited_evidence_json=?, updated_at=? WHERE id=? AND workspace_id=?",
                (body_md, json.dumps(ev_ids, ensure_ascii=False), now, report_id, workspace_id),
            )
            conn2.commit()
        finally:
            conn2.close()
        yield _sse("done", {"body_md": body_md, "cited_evidence": ev_ids, "updated_at": now})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/{report_id}/rewrite")
async def rewrite_report(report_id: str, body: RewriteRequest, workspace_id: str = Depends(request_workspace_id)):
    """Stream a rewrite of the current draft without persisting.

    The client decides whether to apply the result (via PATCH /reports/{id}).
    Response is Server-Sent Events:
        event: delta  data: {"text": "..."}
        event: done   data: {"text": "...", "mode": "append" | "replace"}
        event: error  data: {"message": "..."}
    """
    if body.op not in REWRITE_OPS:
        raise HTTPException(400, f"op must be one of {sorted(REWRITE_OPS)}")

    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM report WHERE id = ? AND workspace_id = ?",
            (report_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "report not found")
        report = row_to_dict(row)
        thread_ids = json.loads(report.get("thread_ids_json") or "[]")
        project_id = report.get("project_id")
        lines, _ev_ids = _collect_evidence_lines(
            conn, report["period_start"], report["period_end"], thread_ids, project_id, workspace_id
        )
        project_context = None
        if project_id:
            prow = conn.execute(
                "SELECT id, name, status, summary FROM project WHERE id = ? AND workspace_id = ?",
                (project_id, workspace_id),
            ).fetchone()
            if prow:
                thread_rows = conn.execute(
                    "SELECT title FROM thread WHERE project_id = ? ORDER BY pinned DESC, last_active_at DESC",
                    (project_id,),
                ).fetchall()
                project_context = row_to_dict(prow)
                project_context["thread_titles"] = [r["title"] for r in thread_rows]
    finally:
        conn.close()

    if body.target_audience is not None and body.target_audience not in ALLOWED_AUDIENCES:
        raise HTTPException(
            400, f"target_audience must be one of {sorted(ALLOWED_AUDIENCES)}"
        )

    profile = _resolve_profile(body.profile_id)

    try:
        messages = build_rewrite_messages(
            op=body.op,
            current_body=report["body_md"] or "",
            period_label=report["period_label"],
            period_start=report["period_start"],
            period_end=report["period_end"],
            audience=report["audience"],
            evidence_lines=lines,
            project_context=project_context,
            target_chars=body.target_chars,
            target_audience=body.target_audience,
            instruction=body.instruction,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from None

    provider = build_provider(profile)
    mode = rewrite_apply_mode(body.op)

    async def event_stream():
        pieces: list[str] = []
        try:
            async for chunk in provider.stream_chat(messages):
                if chunk.delta:
                    pieces.append(chunk.delta)
                    yield _sse("delta", {"text": chunk.delta})
                if chunk.done:
                    break
        except LLMError as e:
            yield _sse("error", {"message": str(e)})
            return
        except Exception as e:  # noqa: BLE001
            yield _sse("error", {"message": f"{type(e).__name__}: {e}"})
            return

        text = "".join(pieces).strip()
        yield _sse("done", {"text": text, "mode": mode, "op": body.op})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch("/{report_id}")
def patch_report(report_id: str, patch: ReportPatch, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM report WHERE id = ? AND workspace_id = ?",
            (report_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "report not found")
        current = row_to_dict(row)

        new_title = patch.title if patch.title is not None else current["title"]
        new_body = patch.body_md if patch.body_md is not None else current["body_md"]
        new_outline = (
            json.dumps(patch.outline, ensure_ascii=False)
            if patch.outline is not None
            else current["outline_json"]
        )
        new_status = patch.status or current["status"]
        if new_status not in ALLOWED_STATUS:
            raise HTTPException(400, f"status must be one of {sorted(ALLOWED_STATUS)}")

        new_start = current["period_start"]
        new_end = current["period_end"]
        if patch.period_start is not None:
            new_start = patch.period_start
            _parse_iso_moment(new_start)
        if patch.period_end is not None:
            new_end = patch.period_end
            _parse_iso_moment(new_end)
        if _parse_iso_moment(new_end) < _parse_iso_moment(new_start):
            raise HTTPException(400, "period_end must be on or after period_start")

        new_audience = current["audience"]
        if patch.audience is not None:
            if patch.audience not in ALLOWED_AUDIENCES:
                raise HTTPException(
                    400, f"audience must be one of {sorted(ALLOWED_AUDIENCES)}"
                )
            new_audience = patch.audience

        if patch.clear_project:
            new_project_id = None
        elif patch.project_id is not None:
            require_project(conn, patch.project_id, workspace_id)
            new_project_id = patch.project_id
        else:
            new_project_id = current.get("project_id")

        new_label = current["period_label"]
        if patch.period_label is not None:
            if not patch.period_label.strip():
                raise HTTPException(400, "period_label is empty")
            new_label = patch.period_label.strip()
        elif patch.period_start is not None or patch.period_end is not None:
            # auto-regenerate label when period changed and user didn't override
            new_label = _default_label(new_start, new_end)

        if patch.thread_ids is not None:
            new_thread_ids_json = json.dumps(
                _validated_thread_ids(conn, patch.thread_ids, new_project_id, workspace_id),
                ensure_ascii=False,
            )
        else:
            current_thread_ids = json.loads(current.get("thread_ids_json") or "[]")
            # Filter out dead thread ids silently (threads may have been deleted)
            # instead of raising 404 and blocking report edits.
            if current_thread_ids:
                placeholders = ",".join("?" for _ in current_thread_ids)
                existing_rows = conn.execute(
                    f"SELECT id FROM thread WHERE workspace_id = ? AND id IN ({placeholders})",
                    (workspace_id, *current_thread_ids),
                ).fetchall()
                existing_ids = {r["id"] for r in existing_rows}
                current_thread_ids = [t for t in current_thread_ids if t in existing_ids]
            new_thread_ids_json = json.dumps(current_thread_ids, ensure_ascii=False)

        conn.execute(
            "UPDATE report SET title=?, body_md=?, outline_json=?, status=?, "
            "period_start=?, period_end=?, period_label=?, audience=?, project_id=?, "
            "thread_ids_json=?, updated_at=? "
            "WHERE id=? AND workspace_id=?",
            (
                new_title,
                new_body,
                new_outline,
                new_status,
                new_start,
                new_end,
                new_label,
                new_audience,
                new_project_id,
                new_thread_ids_json,
                _now_iso(),
                report_id,
                workspace_id,
            ),
        )
        conn.commit()
        return get_report(report_id, workspace_id)
    finally:
        conn.close()


@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: str, workspace_id: str = Depends(request_workspace_id)) -> None:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id FROM report WHERE id = ? AND workspace_id = ?",
            (report_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "report not found")
        conn.execute(
            "DELETE FROM report WHERE id = ? AND workspace_id = ?",
            (report_id, workspace_id),
        )
        conn.commit()
    finally:
        conn.close()
