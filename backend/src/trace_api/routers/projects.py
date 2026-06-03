from __future__ import annotations

import io
import json
import re
import time
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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
    return _parse_health_metrics(metrics)


def _project_health_snapshot_batch(conn, project_ids: list[str], workspace_id: str) -> dict[str, dict]:
    """Batch version - single query for all projects, O(1) DB calls instead of O(n)."""
    if not project_ids:
        return {}

    placeholders = ",".join(["?"] * len(project_ids))
    metrics = conn.execute(
        f"""
        SELECT
          p.id AS project_id,
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
        WHERE p.id IN ({placeholders}) AND p.workspace_id = ?
        GROUP BY p.id
        """,
        (*project_ids, workspace_id),
    ).fetchall()

    result = {}
    for row in metrics:
        data = row_to_dict(row)
        result[data["project_id"]] = _parse_health_metrics_from_dict(data)
    return result


def _parse_health_metrics(metrics) -> dict:
    """Parse health metrics from cursor row (single project)."""
    data = row_to_dict(metrics) if metrics else {}
    return _parse_health_metrics_from_dict(data)


def _parse_health_metrics_from_dict(data: dict) -> dict:
    """Parse health metrics dict and compute status/action."""
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
    """Attach health data to projects using batch query with TTL cache.

    The snapshot query joins 4 tables, so we cache the per-project result
    for HEALTH_TTL_SECONDS to avoid repeated work on rapid list-refreshes.
    """
    if not projects:
        return projects

    project_ids = [p["id"] for p in projects]
    health_map = _project_health_snapshot_batch_cached(conn, project_ids, workspace_id)

    for project in projects:
        project["health"] = health_map.get(project["id"], {
            "health_status": "unknown",
            "next_action": "无法获取健康状态",
            "blocked_thread_count": 0,
            "stale_thread_count": 0,
            "open_todo_count": 0,
            "draft_report_count": 0,
            "week_evidence_count": 0,
            "week_done_todo_count": 0,
            "week_active_thread_count": 0,
        })
    return projects


HEALTH_TTL_SECONDS = 30
_HEALTH_CACHE: dict[tuple[str, str], tuple[float, dict]] = {}


def _project_health_snapshot_batch_cached(
    conn, project_ids: list[str], workspace_id: str
) -> dict[str, dict]:
    """Batch snapshot with per-project TTL cache.

    Each (project_id, workspace_id) entry is cached for HEALTH_TTL_SECONDS.
    Misses (or expired entries) are filled in via a single batched query
    against the underlying DB.
    """
    now = time.monotonic()
    misses: list[str] = []
    result: dict[str, dict] = {}

    for pid in project_ids:
        key = (pid, workspace_id)
        cached = _HEALTH_CACHE.get(key)
        if cached and (now - cached[0]) < HEALTH_TTL_SECONDS:
            result[pid] = cached[1]
        else:
            misses.append(pid)

    if misses:
        fresh = _project_health_snapshot_batch(conn, misses, workspace_id)
        for pid, snapshot in fresh.items():
            _HEALTH_CACHE[(pid, workspace_id)] = (now, snapshot)
            result[pid] = snapshot

    return result


def invalidate_project_health_cache(workspace_id: str | None = None) -> None:
    """Invalidate cached health data, called from write paths."""
    if workspace_id is None:
        _HEALTH_CACHE.clear()
        return
    keys_to_drop = [k for k in _HEALTH_CACHE if k[1] == workspace_id]
    for k in keys_to_drop:
        _HEALTH_CACHE.pop(k, None)


def _safe_filename(value: str, fallback: str) -> str:
    text = (value or fallback).strip() or fallback
    text = re.sub(r'[\\/:*?"<>|\n\r\t]+', "_", text)
    return text[:120] or fallback


def _project_export_markdown(project: dict, reports: list[dict]) -> bytes:
    project_name = project.get("name") or "project"
    root = _safe_filename(project_name, "project")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        health = project.get("health") or {}
        readme = [
            f"# {project_name}",
            "",
            f"- 状态：{project.get('status') or 'unknown'}",
            f"- 负责人：{project.get('owner') or '未设置'}",
            f"- 线程：{project.get('thread_count') or len(project.get('threads') or [])}",
            f"- 记事：{project.get('note_count') or len(project.get('notes') or [])}",
            f"- 汇报：{project.get('report_count') or len(project.get('reports') or [])}",
            f"- 健康度：{health.get('health_status') or 'unknown'}",
            f"- 下一步：{health.get('next_action') or '暂无'}",
            "",
            "## 摘要",
            "",
            project.get("summary") or "暂无摘要。",
            "",
            "## 本周指标",
            "",
            f"- 新增证据：{health.get('week_evidence_count') or 0}",
            f"- 完成待办：{health.get('week_done_todo_count') or 0}",
            f"- 活跃线程：{health.get('week_active_thread_count') or 0}",
            "",
            "## 文件索引",
            "",
            "- `threads/`：项目工作线和线索",
            "- `notes/`：项目记事",
            "- `reports/`：项目报告",
            "- `evidence.md`：全部证据",
            "- `todos.md`：全部待办",
        ]
        zf.writestr(f"{root}/README.md", "\n".join(readme) + "\n")

        evidence_by_thread: dict[str, list[dict]] = {}
        for evidence in project.get("evidence") or []:
            evidence_by_thread.setdefault(evidence.get("thread_id") or "", []).append(evidence)
        todos_by_thread: dict[str, list[dict]] = {}
        for todo in project.get("todos") or []:
            todos_by_thread.setdefault(todo.get("thread_id") or "", []).append(todo)

        for idx, thread in enumerate(project.get("threads") or [], start=1):
            title = thread.get("title") or f"thread-{idx}"
            lines = [
                f"# {title}",
                "",
                f"- 状态：{thread.get('status') or 'unknown'}",
                f"- 负责人：{thread.get('owner') or '未设置'}",
                f"- 开始时间：{thread.get('started_at') or '未知'}",
                f"- 最近活跃：{thread.get('last_active_at') or '未知'}",
                f"- 证据数：{thread.get('evidence_count') or 0}",
                "",
                "## 摘要",
                "",
                thread.get("summary") or "暂无摘要。",
                "",
                "## 证据",
                "",
            ]
            thread_evidence = evidence_by_thread.get(thread.get("id") or "", [])
            if thread_evidence:
                for n, item in enumerate(thread_evidence, start=1):
                    lines.append(
                        f"{n}. {item.get('event_date') or item.get('created_at') or '无日期'} · "
                        f"{item.get('category') or 'progress'} · {item.get('text') or ''}"
                    )
            else:
                lines.append("暂无证据。")
            lines.extend(["", "## 待办", ""])
            thread_todos = todos_by_thread.get(thread.get("id") or "", [])
            if thread_todos:
                for todo in thread_todos:
                    mark = "x" if todo.get("done") else " "
                    due = f" · 截止 {todo.get('due_date')}" if todo.get("due_date") else ""
                    lines.append(f"- [{mark}] {todo.get('text') or ''}{due}")
            else:
                lines.append("暂无待办。")
            zf.writestr(
                f"{root}/threads/{idx:02d}-{_safe_filename(title, f'thread-{idx}')}.md",
                "\n".join(lines) + "\n",
            )

        evidence_lines = [f"# {project_name} · 证据", ""]
        for idx, item in enumerate(project.get("evidence") or [], start=1):
            evidence_lines.append(
                f"{idx}. {item.get('event_date') or item.get('created_at') or '无日期'} · "
                f"{item.get('thread_title') or '未挂线程'} · {item.get('category') or 'progress'} · "
                f"{item.get('text') or ''}"
            )
        if len(evidence_lines) == 2:
            evidence_lines.append("暂无证据。")
        zf.writestr(f"{root}/evidence.md", "\n".join(evidence_lines) + "\n")

        todo_lines = [f"# {project_name} · 待办", ""]
        for item in project.get("todos") or []:
            mark = "x" if item.get("done") else " "
            due = f" · 截止 {item.get('due_date')}" if item.get("due_date") else ""
            todo_lines.append(f"- [{mark}] {item.get('thread_title') or '未挂线程'} · {item.get('text') or ''}{due}")
        if len(todo_lines) == 2:
            todo_lines.append("暂无待办。")
        zf.writestr(f"{root}/todos.md", "\n".join(todo_lines) + "\n")

        for idx, note in enumerate(project.get("notes") or [], start=1):
            title = note.get("title") or f"note-{idx}"
            content = [
                f"# {title}",
                "",
                f"- 日期：{note.get('day') or '未知'}",
                f"- 更新时间：{note.get('updated_at') or '未知'}",
                "",
                note.get("body_md") or "",
            ]
            zf.writestr(
                f"{root}/notes/{idx:02d}-{_safe_filename(title, f'note-{idx}')}.md",
                "\n".join(content).rstrip() + "\n",
            )

        for idx, report in enumerate(reports, start=1):
            title = report.get("title") or f"report-{idx}"
            body = (report.get("body_md") or "").strip()
            content = [
                f"# {title}",
                "",
                f"- 周期：{report.get('period_label') or ''}（{report.get('period_start') or ''} — {report.get('period_end') or ''}）",
                f"- 状态：{report.get('status') or 'draft'}",
                f"- 受众：{report.get('audience') or 'boss'}",
                "",
                body or "暂无正文。",
            ]
            zf.writestr(
                f"{root}/reports/{idx:02d}-{_safe_filename(title, f'report-{idx}')}.md",
                "\n".join(content).rstrip() + "\n",
            )
    buffer.seek(0)
    return buffer.getvalue()


@router.get("")
def list_projects(
    workspace_id: str = Depends(request_workspace_id),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    conn = connect()
    try:
        count_row = conn.execute(
            "SELECT COUNT(*) AS total FROM project WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
        total = int(count_row["total"])

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
            LIMIT ? OFFSET ?
            """,
            (workspace_id, limit, offset),
        ).fetchall()
        return {
            "items": _attach_project_health(conn, [_project_row_to_dict(row) for row in rows], workspace_id),
            "total": total,
        }
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
            except (json.JSONDecodeError, TypeError, ValueError):
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
            except (json.JSONDecodeError, TypeError, ValueError):
                item["owners"] = []
            try:
                item["tags"] = json.loads(raw_tags or "[]")
            except (json.JSONDecodeError, TypeError, ValueError):
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


@router.get("/{project_id}/export")
def export_project(project_id: str, workspace_id: str = Depends(request_workspace_id)):
    project = get_project(project_id, workspace_id)
    conn = connect()
    try:
        report_rows = conn.execute(
            """
            SELECT r.*
            FROM report r
            WHERE r.project_id = ? AND r.workspace_id = ?
            ORDER BY r.updated_at DESC
            """,
            (project_id, workspace_id),
        ).fetchall()
        reports = [row_to_dict(row) for row in report_rows]
    finally:
        conn.close()

    raw_filename = f"Trace-{_safe_filename(project.get('name') or project_id, 'project')}.zip"
    ascii_filename = f"Trace-{project_id}.zip"
    content = _project_export_markdown(project, reports)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"{ascii_filename}\"; "
                f"filename*=UTF-8''{quote(raw_filename)}"
            )
        },
    )


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
