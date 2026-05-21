from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect, cursor, row_to_dict
from ..llm import LLMError, build_provider
from ..llm.base import ChatMessage
from ..project_utils import (
    clean_optional_text,
    new_project_id,
    now_iso,
    require_project,
    validate_project_status,
)
from .llm import get_default_profile
from ..workspace import request_workspace_id
from .attachments import delete_owner_attachments

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectIn(BaseModel):
    name: str
    status: str = "active"
    owner: str | None = None
    summary: str = ""
    color: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = None
    status: str | None = None
    owner: str | None = None
    summary: str | None = None
    color: str | None = None


def _project_row_to_dict(row) -> dict:
    return row_to_dict(row)


def _project_health_snapshot(conn, project_id: str, workspace_id: str) -> dict:
    metrics = conn.execute(
        """
        SELECT
          COUNT(DISTINCT CASE WHEN t.status = 'blocked' THEN t.id END) AS blocked_thread_count,
          COUNT(DISTINCT CASE
            WHEN t.status IN ('active', 'blocked')
             AND datetime(t.last_active_at) < datetime('now', '-14 days')
            THEN t.id
          END) AS stale_thread_count,
          COUNT(DISTINCT CASE WHEN td.done = 0 THEN td.id END) AS open_todo_count,
          COUNT(DISTINCT CASE WHEN r.status = 'draft' THEN r.id END) AS draft_report_count,
          COUNT(DISTINCT CASE
            WHEN datetime(COALESCE(e.event_date, e.created_at)) >= datetime('now', '-6 days')
            THEN e.id
          END) AS week_evidence_count,
          COUNT(DISTINCT CASE
            WHEN td.done = 1 AND td.done_at IS NOT NULL AND datetime(td.done_at) >= datetime('now', '-6 days')
            THEN td.id
          END) AS week_done_todo_count,
          COUNT(DISTINCT CASE
            WHEN datetime(t.last_active_at) >= datetime('now', '-6 days')
            THEN t.id
          END) AS week_active_thread_count
        FROM project p
        LEFT JOIN thread t ON t.project_id = p.id AND t.workspace_id = p.workspace_id
        LEFT JOIN evidence e ON e.thread_id = t.id AND e.workspace_id = p.workspace_id
        LEFT JOIN todo td ON td.thread_id = t.id AND td.workspace_id = p.workspace_id
        LEFT JOIN report r ON r.project_id = p.id AND r.workspace_id = p.workspace_id
        WHERE p.id = ? AND p.workspace_id = ?
        GROUP BY p.id
        """,
        (project_id, workspace_id),
    ).fetchone()
    data = row_to_dict(metrics) if metrics else {}
    for key in (
        "blocked_thread_count",
        "stale_thread_count",
        "open_todo_count",
        "draft_report_count",
        "week_evidence_count",
        "week_done_todo_count",
        "week_active_thread_count",
    ):
        data[key] = int(data.get(key) or 0)

    if data["blocked_thread_count"] > 0:
        status = "blocked"
        next_action = f"处理 {data['blocked_thread_count']} 条阻塞线程"
    elif data["stale_thread_count"] > 0:
        status = "quiet"
        next_action = f"复盘 {data['stale_thread_count']} 条沉默线程"
    elif data["draft_report_count"] > 0:
        status = "reporting"
        next_action = f"定稿 {data['draft_report_count']} 份报告草稿"
    elif data["open_todo_count"] > 0:
        status = "active"
        next_action = f"推进 {data['open_todo_count']} 项待办"
    else:
        status = "healthy"
        next_action = "暂无紧急动作"

    return {**data, "health_status": status, "next_action": next_action}


def _attach_project_health(conn, projects: list[dict], workspace_id: str) -> list[dict]:
    for project in projects:
        project["health"] = _project_health_snapshot(conn, project["id"], workspace_id)
    return projects


@router.get("")
def list_projects(workspace_id: str = Depends(request_workspace_id)) -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """
            SELECT p.*,
                   COUNT(DISTINCT t.id) AS thread_count,
                   COUNT(DISTINCT n.id) AS note_count,
                   COUNT(DISTINCT r.id) AS report_count
            FROM project p
            LEFT JOIN thread t ON t.project_id = p.id AND t.workspace_id = p.workspace_id
            LEFT JOIN note n ON n.project_id = p.id AND n.workspace_id = p.workspace_id
            LEFT JOIN report r ON r.project_id = p.id AND r.workspace_id = p.workspace_id
            WHERE p.workspace_id = ?
            GROUP BY p.id
            ORDER BY
              CASE p.status
                WHEN 'active' THEN 0
                WHEN 'paused' THEN 1
                WHEN 'done' THEN 2
                ELSE 3
              END,
              p.updated_at DESC,
              p.name COLLATE NOCASE ASC
            """,
            (workspace_id,),
        ).fetchall()
        return _attach_project_health(conn, [_project_row_to_dict(row) for row in rows], workspace_id)
    finally:
        conn.close()


@router.post("", status_code=201)
def create_project(body: ProjectIn, workspace_id: str = Depends(request_workspace_id)) -> dict:
    name = clean_optional_text(body.name)
    if not name:
        raise HTTPException(400, "name is required")
    status = validate_project_status(body.status)
    owner = clean_optional_text(body.owner)
    color = clean_optional_text(body.color)
    now = now_iso()
    project_id = new_project_id()

    conn = connect()
    try:
        exists = conn.execute(
            "SELECT id FROM project WHERE workspace_id = ? AND name = ? COLLATE NOCASE LIMIT 1",
            (workspace_id, name),
        ).fetchone()
        if exists:
            raise HTTPException(409, "project already exists")
        conn.execute(
            "INSERT INTO project (id,name,status,owner,summary,color,created_at,updated_at,workspace_id) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (
                project_id,
                name,
                status,
                owner,
                body.summary or "",
                color,
                now,
                now,
                workspace_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return get_project(project_id, workspace_id)


@router.get("/{project_id}")
def get_project(project_id: str, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            """
            SELECT p.*,
                   COUNT(DISTINCT t.id) AS thread_count,
                   COUNT(DISTINCT n.id) AS note_count,
                   COUNT(DISTINCT r.id) AS report_count
            FROM project p
            LEFT JOIN thread t ON t.project_id = p.id AND t.workspace_id = p.workspace_id
            LEFT JOIN note n ON n.project_id = p.id AND n.workspace_id = p.workspace_id
            LEFT JOIN report r ON r.project_id = p.id AND r.workspace_id = p.workspace_id
            WHERE p.id = ? AND p.workspace_id = ?
            GROUP BY p.id
            """,
            (project_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "project not found")
        project = _project_row_to_dict(row)

        thread_rows = conn.execute(
            """
            SELECT t.*, COALESCE(p.name, t.project) AS project_name, COUNT(e.id) AS evidence_count
            FROM thread t
            LEFT JOIN project p ON p.id = t.project_id
            LEFT JOIN evidence e ON e.thread_id = t.id
            WHERE t.project_id = ? AND t.workspace_id = ?
            GROUP BY t.id
            ORDER BY t.pinned DESC, t.last_active_at DESC
            """,
            (project_id, workspace_id),
        ).fetchall()
        threads: list[dict] = []
        for thread_row in thread_rows:
            thread = row_to_dict(thread_row)
            thread["project"] = thread.pop("project_name") or thread.get("project")
            threads.append(thread)

        note_rows = conn.execute(
            """
            SELECT n.*, p.name AS project_name
            FROM note n
            LEFT JOIN project p ON p.id = n.project_id
            WHERE n.project_id = ? AND n.workspace_id = ?
            ORDER BY n.updated_at DESC
            """,
            (project_id, workspace_id),
        ).fetchall()
        notes: list[dict] = []
        for note_row in note_rows:
            note = row_to_dict(note_row)
            raw_thread_ids = note.pop("thread_ids_json", "[]")
            note["thread_ids"] = []
            note["project_name"] = note.pop("project_name", None)
            try:
                note["thread_ids"] = json.loads(raw_thread_ids or "[]")
            except Exception:  # noqa: BLE001
                note["thread_ids"] = []
            notes.append(note)

        report_rows = conn.execute(
            """
            SELECT r.id, r.period_label, r.period_start, r.period_end, r.audience,
                   r.project_id, p.name AS project_name, r.thread_ids_json, r.title, r.status, r.updated_at
            FROM report r
            LEFT JOIN project p ON p.id = r.project_id
            WHERE r.project_id = ? AND r.workspace_id = ?
            ORDER BY r.updated_at DESC
            """,
            (project_id, workspace_id),
        ).fetchall()
        reports: list[dict] = []
        for report_row in report_rows:
            report = row_to_dict(report_row)
            report["thread_ids"] = json.loads(report.pop("thread_ids_json") or "[]")
            reports.append(report)

        todo_rows = conn.execute(
            """
            SELECT td.*, th.title AS thread_title
            FROM todo td
            LEFT JOIN thread th ON th.id = td.thread_id
            WHERE td.workspace_id = ? AND td.thread_id IN (SELECT id FROM thread WHERE project_id = ? AND workspace_id = ?)
            ORDER BY td.done ASC, (td.due_date IS NULL), td.due_date ASC, td.created_at DESC
            """,
            (workspace_id, project_id, workspace_id),
        ).fetchall()
        todos = [row_to_dict(row) for row in todo_rows]

        evidence_rows = conn.execute(
            """
            SELECT e.*, th.title AS thread_title, COALESCE(p.name, th.project) AS thread_project
            FROM evidence e
            LEFT JOIN thread th ON th.id = e.thread_id
            LEFT JOIN project p ON p.id = th.project_id
            WHERE e.workspace_id = ? AND th.project_id = ?
            ORDER BY
              CASE
                WHEN e.event_date IS NOT NULL THEN datetime(e.event_date)
                ELSE datetime(e.created_at)
              END DESC,
              e.created_at DESC
            """,
            (workspace_id, project_id),
        ).fetchall()
        evidence: list[dict] = []
        for evidence_row in evidence_rows:
            item = row_to_dict(evidence_row)
            raw_owners = item.pop("owners_json", "[]")
            raw_tags = item.pop("tags_json", "[]")
            try:
                item["owners"] = json.loads(raw_owners or "[]")
            except Exception:  # noqa: BLE001
                item["owners"] = []
            try:
                item["tags"] = json.loads(raw_tags or "[]")
            except Exception:  # noqa: BLE001
                item["tags"] = []
            evidence.append(item)

        project["threads"] = threads
        project["notes"] = notes
        project["reports"] = reports
        project["todos"] = todos
        project["evidence"] = evidence
        project["health"] = _project_health_snapshot(conn, project_id, workspace_id)
        return project
    finally:
        conn.close()


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, workspace_id: str = Depends(request_workspace_id)) -> None:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id FROM project WHERE id = ? AND workspace_id = ?",
            (project_id, workspace_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "project not found")
        # Clear denormalised thread.project text so list views don't show the ghost name.
        # ON DELETE SET NULL handles thread.project_id / note.project_id / report.project_id.
        conn.execute(
            "UPDATE thread SET project = NULL WHERE project_id = ? AND workspace_id = ?",
            (project_id, workspace_id),
        )
        delete_owner_attachments(conn, "project", project_id, workspace_id)
        conn.execute(
            "DELETE FROM project WHERE id = ? AND workspace_id = ?",
            (project_id, workspace_id),
        )
        conn.commit()
    finally:
        conn.close()


@router.patch("/{project_id}")
def patch_project(project_id: str, patch: ProjectPatch, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        current = require_project(conn, project_id, workspace_id)
        provided = patch.model_fields_set

        if "name" in provided:
            name = clean_optional_text(patch.name)
            if not name:
                raise HTTPException(400, "name is required")
        else:
            name = current["name"]

        if "status" in provided:
            status = validate_project_status(patch.status or "")
        else:
            status = current["status"]

        owner = clean_optional_text(patch.owner) if "owner" in provided else current["owner"]
        color = clean_optional_text(patch.color) if "color" in provided else current["color"]
        summary = patch.summary if "summary" in provided else current["summary"]

        if name.lower() != current["name"].lower():
            exists = conn.execute(
                "SELECT id FROM project WHERE workspace_id = ? AND name = ? COLLATE NOCASE AND id != ? LIMIT 1",
                (workspace_id, name, project_id),
            ).fetchone()
            if exists:
                raise HTTPException(409, "project already exists")

        now = now_iso()
        conn.execute(
            "UPDATE project SET name=?, status=?, owner=?, summary=?, color=?, updated_at=? WHERE id=? AND workspace_id=?",
            (name, status, owner, summary or "", color, now, project_id, workspace_id),
        )
        conn.execute(
            "UPDATE thread SET project = ? WHERE project_id = ? AND workspace_id = ?",
            (name, project_id, workspace_id),
        )
        conn.commit()
    finally:
        conn.close()
    return get_project(project_id, workspace_id)


@router.post("/{project_id}/summarize")
async def summarize_project(project_id: str, workspace_id: str = Depends(request_workspace_id)) -> dict:
    conn = connect()
    try:
        project = require_project(conn, project_id, workspace_id)
        thread_rows = conn.execute(
            """
            SELECT t.id, t.title, t.status, t.summary, COUNT(e.id) AS evidence_count
            FROM thread t
            LEFT JOIN evidence e ON e.thread_id = t.id
            WHERE t.project_id = ? AND t.workspace_id = ?
            GROUP BY t.id
            ORDER BY t.pinned DESC, t.last_active_at DESC
            """,
            (project_id, workspace_id),
        ).fetchall()
        evidence_rows = conn.execute(
            """
            SELECT e.id, e.text, e.category, e.event_date, th.title AS thread_title
            FROM evidence e
            LEFT JOIN thread th ON th.id = e.thread_id
            WHERE e.workspace_id = ? AND th.project_id = ?
            ORDER BY datetime(COALESCE(e.event_date, e.created_at)) DESC, e.created_at DESC
            LIMIT 24
            """,
            (workspace_id, project_id),
        ).fetchall()
    finally:
        conn.close()

    profile = get_default_profile()
    if not profile:
        raise HTTPException(400, "no llm profile configured")
    if not profile.api_key:
        raise HTTPException(400, f"profile '{profile.name}' has no api_key configured")
    provider = build_provider(profile)

    thread_lines = [
        f"- {row['title']}（{row['status']}，{row['evidence_count']} 条证据）"
        for row in thread_rows
    ]
    evidence_lines = [
        f"[{idx + 1}] [{row['category']}] {row['event_date'] or '未定日期'} · {row['thread_title'] or '未挂线程'} · {row['text']}"
        for idx, row in enumerate(evidence_rows)
    ]
    thread_block = "\n".join(thread_lines) if thread_lines else "（暂无线程）"
    evidence_block = "\n".join(evidence_lines) if evidence_lines else "（暂无证据）"

    messages = [
        ChatMessage(
            role="system",
            content=(
                "你是 Trace 的项目摘要助手。"
                "请根据项目下的线程与证据，生成 3-5 句精炼摘要，描述："
                "这个项目在做什么、最近推进到哪、当前风险或阻塞、下一步重点。"
                "直接输出正文，不要前言或结语。"
            ),
        ),
        ChatMessage(
            role="user",
            content=(
                f"项目：{project['name']}\n"
                f"项目状态：{project['status']}\n"
                f"已有摘要：{project.get('summary') or '（无）'}\n\n"
                f"线程概览：\n{thread_block}\n\n"
                f"最近证据：\n{evidence_block}"
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
            "UPDATE project SET summary=?, updated_at=? WHERE id=? AND workspace_id=?",
            (summary_text.strip(), now_iso(), project_id, workspace_id),
        )
    return get_project(project_id, workspace_id)
