from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from ..db import connect, row_to_dict
from ..utils import TZ, today_iso
from ..workspace import DEFAULT_WORKSPACE_ID

router = APIRouter(prefix="/workbench", tags=["workbench"])


def _parse_date(value: str | None) -> date_cls:
    raw = value or today_iso()
    try:
        return date_cls.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(400, "date must use YYYY-MM-DD") from exc


def _iso_week_label(value: date_cls) -> str:
    year, week, _ = value.isocalendar()
    return f"{year}-W{week:02d}"


def _preview(text: str, max_chars: int = 34) -> str:
    clean = " ".join(text.split())
    if len(clean) <= max_chars:
        return clean
    return f"{clean[: max_chars - 1]}…"


def _thread_item(row) -> dict:
    item = row_to_dict(row)
    item["project"] = item.pop("project_name") or item.get("project")
    return item


def _count(conn, sql: str, *params: object) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row["n"] if row else 0)


def _workline_columns(conn, workspace_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT t.id, t.title, t.project_id, COALESCE(p.name, t.project) AS project_name,
               t.owner, t.status, t.started_at, t.last_active_at, t.summary, t.pinned,
               COUNT(e.id) AS evidence_count
        FROM thread t
        LEFT JOIN project p ON p.id = t.project_id
        LEFT JOIN evidence e ON e.thread_id = t.id AND e.workspace_id = t.workspace_id
        WHERE t.workspace_id = ?
        GROUP BY t.id
        ORDER BY t.pinned DESC, datetime(t.last_active_at) DESC
        LIMIT 80
        """,
        (workspace_id,),
    ).fetchall()
    threads = [_thread_item(row) for row in rows]
    specs = [
        ("active", "进行中", lambda item: item["status"] == "active"),
        ("blocked", "已阻塞", lambda item: item["status"] == "blocked"),
        ("done", "已完成", lambda item: item["status"] in {"done", "archived"}),
    ]
    return [
        {
            "id": key,
            "title": title,
            "count": sum(1 for item in threads if predicate(item)),
            "items": [item for item in threads if predicate(item)][:4],
        }
        for key, title, predicate in specs
    ]


def _project_alerts(conn, workspace_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT p.id, p.name,
               (
                 SELECT COUNT(*)
                 FROM thread t
                 WHERE t.workspace_id = ? AND t.project_id = p.id AND t.status = 'blocked'
               ) AS blocked_thread_count,
               (
                 SELECT COUNT(*)
                 FROM todo td
                 JOIN thread th ON th.id = td.thread_id
                 WHERE td.workspace_id = ? AND th.project_id = p.id AND td.done = 0
               ) AS open_todo_count,
               (
                 SELECT COUNT(*)
                 FROM report r
                 WHERE r.workspace_id = ? AND r.project_id = p.id AND r.status = 'draft'
               ) AS draft_report_count
        FROM project p
        WHERE p.workspace_id = ?
        ORDER BY datetime(p.updated_at) DESC
        LIMIT 50
        """,
        (workspace_id, workspace_id, workspace_id, workspace_id),
    ).fetchall()
    alerts: list[dict] = []
    for row in rows:
        item = row_to_dict(row)
        if item["blocked_thread_count"] > 0:
            item["tone"] = "stop"
            item["next_action"] = f"{item['blocked_thread_count']} 条工作线阻塞"
        elif item["open_todo_count"] > 0:
            item["tone"] = "warn"
            item["next_action"] = f"{item['open_todo_count']} 个待办待推进"
        elif item["draft_report_count"] > 0:
            item["tone"] = "warn"
            item["next_action"] = "有周报草稿待完善"
        else:
            continue
        alerts.append(item)
    return sorted(
        alerts,
        key=lambda item: (
            0 if item["tone"] == "stop" else 1,
            -int(item["blocked_thread_count"]),
            -int(item["open_todo_count"]),
        ),
    )


def _week_plan(conn, workspace_id: str, target: date_cls) -> dict:
    rows = conn.execute(
        """
        SELECT td.id, td.thread_id, td.text, td.due_date, td.done, td.done_at, td.created_at,
               th.title AS thread_title, COALESCE(p.name, th.project) AS project
        FROM todo td
        LEFT JOIN thread th ON th.id = td.thread_id
        LEFT JOIN project p ON p.id = th.project_id
        WHERE td.workspace_id = ? AND td.done = 0
        ORDER BY (td.due_date IS NULL), td.due_date ASC, datetime(td.created_at) DESC
        LIMIT 80
        """,
        (workspace_id,),
    ).fetchall()
    todos = [row_to_dict(row) for row in rows]
    target_iso = target.isoformat()
    days = []
    weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    for index in range(7):
        current = target + timedelta(days=index)
        current_iso = current.isoformat()
        days.append(
            {
                "date": current_iso,
                "day": str(current.day),
                "weekday": weekdays[current.weekday()],
                "count": sum(1 for todo in todos if todo["due_date"] == current_iso),
                "is_today": current_iso == target_iso,
            }
        )
    return {
        "days": days,
        "items": [
            {
                "id": todo["id"],
                "text": todo["text"],
                "label": _preview(todo["text"]),
                "due_date": todo["due_date"],
                "thread_id": todo["thread_id"],
                "thread_title": todo["thread_title"],
                "project": todo["project"],
                "tone": "moss" if todo["thread_id"] else "amber",
            }
            for todo in todos[:8]
        ],
        "due_today_count": sum(
            1 for todo in todos if todo["due_date"] and todo["due_date"] <= target_iso
        ),
        "unplanned_count": sum(1 for todo in todos if not todo["due_date"]),
    }


@router.get("/overview")
def overview(date: str | None = None) -> dict:
    workspace_id = DEFAULT_WORKSPACE_ID
    target = _parse_date(date)
    target_iso = target.isoformat()
    conn = connect()
    try:
        inbox_count = _count(
            conn,
            "SELECT COUNT(*) AS n FROM evidence WHERE workspace_id = ? AND thread_id IS NULL",
            workspace_id,
        )
        open_todo_count = _count(
            conn,
            "SELECT COUNT(*) AS n FROM todo WHERE workspace_id = ? AND done = 0",
            workspace_id,
        )
        thread_count = _count(
            conn,
            "SELECT COUNT(*) AS n FROM thread WHERE workspace_id = ?",
            workspace_id,
        )
        active_thread_count = _count(
            conn,
            "SELECT COUNT(*) AS n FROM thread WHERE workspace_id = ? AND status = 'active'",
            workspace_id,
        )
        blocked_thread_count = _count(
            conn,
            "SELECT COUNT(*) AS n FROM thread WHERE workspace_id = ? AND status = 'blocked'",
            workspace_id,
        )
        project_count = _count(
            conn,
            "SELECT COUNT(*) AS n FROM project WHERE workspace_id = ?",
            workspace_id,
        )
        project_alerts = _project_alerts(conn, workspace_id)
        draft_report = conn.execute(
            """
            SELECT id, period_label, title
            FROM report
            WHERE workspace_id = ? AND status = 'draft'
            ORDER BY datetime(updated_at) DESC
            LIMIT 1
            """,
            (workspace_id,),
        ).fetchone()
        draft_report_data = row_to_dict(draft_report) if draft_report else None
        week_plan = _week_plan(conn, workspace_id, target)

        focus_items: list[dict] = []
        if week_plan["due_today_count"] > 0:
            focus_items.append(
                {
                    "id": "due-today",
                    "label": "今日待办",
                    "detail": f"{week_plan['due_today_count']} 个待办到期或已过期",
                    "to": "/todos",
                    "tone": "warn",
                }
            )
        if inbox_count > 0:
            focus_items.append(
                {
                    "id": "inbox",
                    "label": "收件箱待归档",
                    "detail": f"{inbox_count} 条闪记需要归入工作线",
                    "to": "/inbox",
                    "tone": "accent",
                }
            )
        if blocked_thread_count > 0:
            focus_items.append(
                {
                    "id": "blocked-threads",
                    "label": "工作线阻塞",
                    "detail": f"{blocked_thread_count} 条工作线等待下一步",
                    "to": "/threads",
                    "tone": "stop",
                }
            )
        if draft_report_data:
            focus_items.append(
                {
                    "id": "draft-report",
                    "label": "周报草稿",
                    "detail": f"「{draft_report_data['period_label']}」可以继续完善",
                    "to": f"/reports/{draft_report_data['id']}",
                    "tone": "warn",
                }
            )
        else:
            focus_items.append(
                {
                    "id": "report-start",
                    "label": "周报尚未启动",
                    "detail": "本周还没有生成汇报草稿",
                    "to": "/reports",
                    "tone": "accent",
                }
            )
        for project in project_alerts[:2]:
            focus_items.append(
                {
                    "id": f"project-{project['id']}",
                    "label": project["name"],
                    "detail": project["next_action"],
                    "to": f"/projects/{project['id']}",
                    "tone": project["tone"],
                }
            )
        if not focus_items:
            focus_items.append(
                {
                    "id": "clear",
                    "label": "系统清爽",
                    "detail": "当前没有紧急动作，可以开始写一笔。",
                    "to": None,
                    "tone": "accent",
                }
            )

        thread_picker_rows = conn.execute(
            """
            SELECT t.id, t.title, t.status, COALESCE(p.name, t.project) AS project
            FROM thread t
            LEFT JOIN project p ON p.id = t.project_id
            WHERE t.workspace_id = ?
            ORDER BY t.pinned DESC, datetime(t.last_active_at) DESC
            LIMIT 100
            """,
            (workspace_id,),
        ).fetchall()

        return {
            "date": target_iso,
            "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
            "week_label": _iso_week_label(target),
            "metrics": [
                {
                    "id": "pending",
                    "label": "待处理",
                    "value": open_todo_count + inbox_count,
                    "detail": f"{open_todo_count} 待办 · {inbox_count} 闪记",
                    "tone": "accent",
                },
                {
                    "id": "active_threads",
                    "label": "进行中",
                    "value": active_thread_count,
                    "detail": f"{thread_count} 条工作线",
                    "tone": "neutral",
                },
                {
                    "id": "projects",
                    "label": "项目",
                    "value": project_count,
                    "detail": f"{len(project_alerts)} 个需要关注",
                    "tone": "iris",
                },
                {
                    "id": "blocked",
                    "label": "阻塞",
                    "value": blocked_thread_count,
                    "detail": "需要解除依赖" if blocked_thread_count > 0 else "当前顺畅",
                    "tone": "stop",
                },
            ],
            "focus_items": focus_items[:4],
            "workline_columns": _workline_columns(conn, workspace_id),
            "summary": [
                {
                    "id": "inputs",
                    "label": "输入",
                    "text": f"{inbox_count} 条闪记、{thread_count} 条工作线、{open_todo_count} 个待办正在等待处理。",
                    "tone": "accent",
                },
                {
                    "id": "risk",
                    "label": "风险",
                    "text": (
                        f"{blocked_thread_count} 条工作线阻塞，建议先拆出下一步。"
                        if blocked_thread_count > 0
                        else "当前没有阻塞工作线，可以直接推进今日任务。"
                    ),
                    "tone": "stop" if blocked_thread_count > 0 else "accent",
                },
                {
                    "id": "report",
                    "label": "汇报",
                    "text": (
                        f"已有「{draft_report_data['period_label']}」草稿，适合收尾整理。"
                        if draft_report_data
                        else "本周尚未生成周报，可先积累今日证据。"
                    ),
                    "tone": "warn" if draft_report_data else "accent",
                },
            ],
            "week_plan": week_plan,
            "threads_for_picker": [row_to_dict(row) for row in thread_picker_rows],
        }
    finally:
        conn.close()
