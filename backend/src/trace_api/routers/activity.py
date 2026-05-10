from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends

import json

from ..db import connect, row_to_dict
from ..utils import TZ
from ..workspace import request_workspace_id

router = APIRouter(prefix="/activity", tags=["activity"])


def _yesterday() -> str:
    from datetime import datetime
    return (datetime.now(TZ).date() - timedelta(days=1)).isoformat()


@router.get("/daily")
def daily_activity(
    date: str | None = None,
    workspace_id: str = Depends(request_workspace_id),
) -> dict:
    """Return activity summary for a given date (defaults to yesterday)."""
    target = date or _yesterday()

    conn = connect()
    try:
        # Evidence created on that date (match by event_date or created_at date)
        evidence_rows = conn.execute(
            """
            SELECT e.id, e.text, e.event_date, e.category, e.status,
                   e.owners_json, e.tags_json, e.thread_id,
                   t.title AS thread_title, COALESCE(p.name, t.project) AS thread_project
            FROM evidence e
            LEFT JOIN thread t ON t.id = e.thread_id
            LEFT JOIN project p ON p.id = t.project_id
            WHERE e.workspace_id = ? AND date(COALESCE(e.event_date, e.created_at)) = ?
            ORDER BY datetime(COALESCE(e.event_date, e.created_at)) DESC
            """,
            (workspace_id, target),
        ).fetchall()

        evidence = []
        for r in evidence_rows:
            d = row_to_dict(r)
            d["owners"] = json.loads(d.pop("owners_json") or "[]")
            d["tags"] = json.loads(d.pop("tags_json") or "[]")
            evidence.append(d)

        # Todos completed on that date
        completed_todos = [
            row_to_dict(r)
            for r in conn.execute(
                """
                SELECT t.id, t.text, t.due_date, t.done_at, t.thread_id,
                       th.title AS thread_title
                FROM todo t
                LEFT JOIN thread th ON th.id = t.thread_id
                WHERE t.workspace_id = ? AND t.done = 1 AND date(t.done_at) = ?
                ORDER BY t.done_at DESC
                """,
                (workspace_id, target),
            ).fetchall()
        ]

        # Threads active on that date (last_active_at falls on that date)
        active_threads = [
            row_to_dict(r)
            for r in conn.execute(
                """
                SELECT t.id, t.title, t.status, t.project_id,
                       COALESCE(p.name, t.project) AS project_name
                FROM thread t
                LEFT JOIN project p ON p.id = t.project_id
                WHERE t.workspace_id = ? AND date(t.last_active_at) = ?
                ORDER BY t.last_active_at DESC
                """,
                (workspace_id, target),
            ).fetchall()
        ]

        return {
            "date": target,
            "evidence": evidence,
            "completed_todos": completed_todos,
            "active_threads": active_threads,
            "capture_count": len(evidence),
            "todo_done_count": len(completed_todos),
        }
    finally:
        conn.close()
