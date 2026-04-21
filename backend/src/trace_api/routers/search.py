from __future__ import annotations

from fastapi import APIRouter

from ..db import connect, row_to_dict

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(q: str = "", limit: int = 10) -> dict:
    q = q.strip()
    if not q:
        return {"projects": [], "threads": [], "evidence": [], "todos": [], "notes": []}

    pattern = f"%{q}%"
    conn = connect()
    try:
        projects = [
            row_to_dict(r)
            for r in conn.execute(
                """SELECT id, name, status, summary
                   FROM project
                   WHERE name LIKE ? OR summary LIKE ?
                   ORDER BY updated_at DESC LIMIT ?""",
                (pattern, pattern, limit),
            ).fetchall()
        ]

        threads = [
            row_to_dict(r)
            for r in conn.execute(
                """SELECT t.id, t.title, COALESCE(p.name, t.project) AS project, t.status, t.summary
                   FROM thread t
                   LEFT JOIN project p ON p.id = t.project_id
                   WHERE t.title LIKE ? OR t.summary LIKE ? OR COALESCE(p.name, t.project, '') LIKE ?
                   ORDER BY last_active_at DESC LIMIT ?""",
                (pattern, pattern, pattern, limit),
            ).fetchall()
        ]

        evidence = [
            row_to_dict(r)
            for r in conn.execute(
                """SELECT e.id, e.text, e.category, e.event_date,
                          e.thread_id, t.title AS thread_title
                   FROM evidence e LEFT JOIN thread t ON t.id = e.thread_id
                   WHERE e.text LIKE ?
                   ORDER BY e.created_at DESC LIMIT ?""",
                (pattern, limit),
            ).fetchall()
        ]

        todos = [
            row_to_dict(r)
            for r in conn.execute(
                """SELECT id, text, done, due_date, thread_id
                   FROM todo WHERE text LIKE ?
                   ORDER BY created_at DESC LIMIT ?""",
                (pattern, limit),
            ).fetchall()
        ]

        notes = [
            row_to_dict(r)
            for r in conn.execute(
                """SELECT id, title, day
                   FROM note WHERE title LIKE ? OR body_md LIKE ?
                   ORDER BY updated_at DESC LIMIT ?""",
                (pattern, pattern, limit),
            ).fetchall()
        ]

        return {
            "projects": projects,
            "threads": threads,
            "evidence": evidence,
            "todos": todos,
            "notes": notes,
        }
    finally:
        conn.close()
