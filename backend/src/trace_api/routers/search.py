from __future__ import annotations

import re
import sqlite3
from collections import defaultdict

from fastapi import APIRouter, Depends

from ..db import connect, ensure_search_index, row_to_dict
from ..workspace import request_workspace_id

router = APIRouter(prefix="/search", tags=["search"])


def _tokenize_query(q: str) -> list[str]:
    return [token for token in re.split(r"\s+", q.strip()) if token]


def _match_query(q: str) -> str:
    tokens = []
    for token in _tokenize_query(q):
        cleaned = re.sub(r'["*()^:]+', " ", token).strip()
        if cleaned:
            tokens.append(f'"{cleaned}"*')
    return " AND ".join(tokens)


def _search_fts(conn: sqlite3.Connection, *, q: str, limit: int, workspace_id: str) -> dict | None:
    if not ensure_search_index(conn):
        return None
    match = _match_query(q)
    if not match:
        return {"projects": [], "threads": [], "evidence": [], "todos": [], "notes": []}
    rows = conn.execute(
        """
        SELECT kind, ref_id
        FROM search_fts
        WHERE workspace_id = ? AND search_fts MATCH ?
        ORDER BY bm25(search_fts)
        LIMIT ?
        """,
        (workspace_id, match, limit * 5),
    ).fetchall()
    ids_by_kind: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        if len(ids_by_kind[row["kind"]]) < limit:
            ids_by_kind[row["kind"]].append(row["ref_id"])

    return {
        "projects": _fetch_projects(conn, ids_by_kind["project"], workspace_id),
        "threads": _fetch_threads(conn, ids_by_kind["thread"], workspace_id),
        "evidence": _fetch_evidence(conn, ids_by_kind["evidence"], workspace_id),
        "todos": _fetch_todos(conn, ids_by_kind["todo"], workspace_id),
        "notes": _fetch_notes(conn, ids_by_kind["note"], workspace_id),
    }


def _ordered(rows: list[sqlite3.Row], ids: list[str]) -> list[dict]:
    by_id = {row["id"]: row_to_dict(row) for row in rows}
    return [by_id[item_id] for item_id in ids if item_id in by_id]


def _placeholders(ids: list[str]) -> str:
    return ",".join("?" for _ in ids)


def _fetch_projects(conn: sqlite3.Connection, ids: list[str], workspace_id: str) -> list[dict]:
    if not ids:
        return []
    rows = conn.execute(
        f"""SELECT id, name, status, summary
            FROM project
            WHERE workspace_id = ? AND id IN ({_placeholders(ids)})""",
        (workspace_id, *ids),
    ).fetchall()
    return _ordered(rows, ids)


def _fetch_threads(conn: sqlite3.Connection, ids: list[str], workspace_id: str) -> list[dict]:
    if not ids:
        return []
    rows = conn.execute(
        f"""SELECT t.id, t.title, COALESCE(p.name, t.project) AS project, t.status, t.summary
            FROM thread t
            LEFT JOIN project p ON p.id = t.project_id
            WHERE t.workspace_id = ? AND t.id IN ({_placeholders(ids)})""",
        (workspace_id, *ids),
    ).fetchall()
    return _ordered(rows, ids)


def _fetch_evidence(conn: sqlite3.Connection, ids: list[str], workspace_id: str) -> list[dict]:
    if not ids:
        return []
    rows = conn.execute(
        f"""SELECT e.id, e.text, e.category, e.event_date,
                   e.thread_id, t.title AS thread_title
            FROM evidence e
            LEFT JOIN thread t ON t.id = e.thread_id
            WHERE e.workspace_id = ? AND e.id IN ({_placeholders(ids)})""",
        (workspace_id, *ids),
    ).fetchall()
    return _ordered(rows, ids)


def _fetch_todos(conn: sqlite3.Connection, ids: list[str], workspace_id: str) -> list[dict]:
    if not ids:
        return []
    rows = conn.execute(
        f"""SELECT id, text, done, due_date, thread_id
            FROM todo
            WHERE workspace_id = ? AND id IN ({_placeholders(ids)})""",
        (workspace_id, *ids),
    ).fetchall()
    return _ordered(rows, ids)


def _fetch_notes(conn: sqlite3.Connection, ids: list[str], workspace_id: str) -> list[dict]:
    if not ids:
        return []
    rows = conn.execute(
        f"""SELECT id, title, day
            FROM note
            WHERE workspace_id = ? AND id IN ({_placeholders(ids)})""",
        (workspace_id, *ids),
    ).fetchall()
    return _ordered(rows, ids)


def _search_like(conn: sqlite3.Connection, *, q: str, limit: int, workspace_id: str) -> dict:
    pattern = f"%{q}%"
    projects = [
        row_to_dict(r)
        for r in conn.execute(
            """SELECT id, name, status, summary
               FROM project
               WHERE workspace_id = ? AND (name LIKE ? OR summary LIKE ?)
               ORDER BY updated_at DESC LIMIT ?""",
            (workspace_id, pattern, pattern, limit),
        ).fetchall()
    ]

    threads = [
        row_to_dict(r)
        for r in conn.execute(
            """SELECT t.id, t.title, COALESCE(p.name, t.project) AS project, t.status, t.summary
               FROM thread t
               LEFT JOIN project p ON p.id = t.project_id
               WHERE t.workspace_id = ? AND (t.title LIKE ? OR t.summary LIKE ? OR COALESCE(p.name, t.project, '') LIKE ?)
               ORDER BY last_active_at DESC LIMIT ?""",
            (workspace_id, pattern, pattern, pattern, limit),
        ).fetchall()
    ]

    evidence = [
        row_to_dict(r)
        for r in conn.execute(
            """SELECT e.id, e.text, e.category, e.event_date,
                      e.thread_id, t.title AS thread_title
               FROM evidence e LEFT JOIN thread t ON t.id = e.thread_id
               WHERE e.workspace_id = ? AND e.text LIKE ?
               ORDER BY e.created_at DESC LIMIT ?""",
            (workspace_id, pattern, limit),
        ).fetchall()
    ]

    todos = [
        row_to_dict(r)
        for r in conn.execute(
            """SELECT id, text, done, due_date, thread_id
               FROM todo WHERE workspace_id = ? AND text LIKE ?
               ORDER BY created_at DESC LIMIT ?""",
            (workspace_id, pattern, limit),
        ).fetchall()
    ]

    notes = [
        row_to_dict(r)
        for r in conn.execute(
            """SELECT id, title, day
               FROM note WHERE workspace_id = ? AND (title LIKE ? OR body_md LIKE ?)
               ORDER BY updated_at DESC LIMIT ?""",
            (workspace_id, pattern, pattern, limit),
        ).fetchall()
    ]

    return {
        "projects": projects,
        "threads": threads,
        "evidence": evidence,
        "todos": todos,
        "notes": notes,
    }


@router.get("")
def search(
    q: str = "",
    limit: int = 10,
    workspace_id: str = Depends(request_workspace_id),
) -> dict:
    q = q.strip()
    if not q:
        return {"projects": [], "threads": [], "evidence": [], "todos": [], "notes": []}

    conn = connect()
    try:
        result = _search_fts(conn, q=q, limit=limit, workspace_id=workspace_id)
        if result is not None:
            return result
        return _search_like(conn, q=q, limit=limit, workspace_id=workspace_id)
    finally:
        conn.close()
