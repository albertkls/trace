from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import default_data_dir
from .utils import new_id, now_iso
from .workspace import DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME

PACKAGE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = PACKAGE_DIR / "schema.sql"

SEARCH_FTS_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    kind UNINDEXED,
    ref_id UNINDEXED,
    workspace_id UNINDEXED,
    title,
    body,
    tokenize='unicode61'
)
"""

SEARCH_TRIGGER_SQL = """
CREATE TRIGGER IF NOT EXISTS trg_search_project_ai
AFTER INSERT ON project
BEGIN
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('project', NEW.id, NEW.workspace_id, NEW.name, NEW.summary);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_project_au
AFTER UPDATE ON project
BEGIN
    DELETE FROM search_fts WHERE kind = 'project' AND ref_id = OLD.id;
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('project', NEW.id, NEW.workspace_id, NEW.name, NEW.summary);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_project_ad
AFTER DELETE ON project
BEGIN
    DELETE FROM search_fts WHERE kind = 'project' AND ref_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_search_thread_ai
AFTER INSERT ON thread
BEGIN
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES (
        'thread',
        NEW.id,
        NEW.workspace_id,
        NEW.title,
        TRIM(COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.project, ''))
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_search_thread_au
AFTER UPDATE ON thread
BEGIN
    DELETE FROM search_fts WHERE kind = 'thread' AND ref_id = OLD.id;
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES (
        'thread',
        NEW.id,
        NEW.workspace_id,
        NEW.title,
        TRIM(COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.project, ''))
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_search_thread_ad
AFTER DELETE ON thread
BEGIN
    DELETE FROM search_fts WHERE kind = 'thread' AND ref_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_search_evidence_ai
AFTER INSERT ON evidence
BEGIN
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('evidence', NEW.id, NEW.workspace_id, '', NEW.text);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_evidence_au
AFTER UPDATE ON evidence
BEGIN
    DELETE FROM search_fts WHERE kind = 'evidence' AND ref_id = OLD.id;
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('evidence', NEW.id, NEW.workspace_id, '', NEW.text);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_evidence_ad
AFTER DELETE ON evidence
BEGIN
    DELETE FROM search_fts WHERE kind = 'evidence' AND ref_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_search_todo_ai
AFTER INSERT ON todo
BEGIN
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('todo', NEW.id, NEW.workspace_id, '', NEW.text);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_todo_au
AFTER UPDATE ON todo
BEGIN
    DELETE FROM search_fts WHERE kind = 'todo' AND ref_id = OLD.id;
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('todo', NEW.id, NEW.workspace_id, '', NEW.text);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_todo_ad
AFTER DELETE ON todo
BEGIN
    DELETE FROM search_fts WHERE kind = 'todo' AND ref_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_search_note_ai
AFTER INSERT ON note
BEGIN
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('note', NEW.id, NEW.workspace_id, NEW.title, NEW.body_md);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_note_au
AFTER UPDATE ON note
BEGIN
    DELETE FROM search_fts WHERE kind = 'note' AND ref_id = OLD.id;
    INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
    VALUES ('note', NEW.id, NEW.workspace_id, NEW.title, NEW.body_md);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_note_ad
AFTER DELETE ON note
BEGIN
    DELETE FROM search_fts WHERE kind = 'note' AND ref_id = OLD.id;
END;
"""


def default_db_path() -> Path:
    override = os.getenv("TRACE_DB_PATH")
    if override:
        return Path(override).expanduser().resolve()
    return (default_data_dir() / "db.sqlite").resolve()


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or default_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 2000;")
    return conn


MIGRATIONS: list[tuple[str, str]] = [
    # (table, "column TYPE [DEFAULT ...]") — added idempotently after CREATE IF NOT EXISTS.
    ("llm_profile", "provider TEXT NOT NULL DEFAULT 'custom'"),
    ("llm_profile", "protocol TEXT NOT NULL DEFAULT 'openai-compat'"),
    ("thread", "project_id TEXT"),
    ("note", "thread_ids_json TEXT NOT NULL DEFAULT '[]'"),
    ("note", "project_id TEXT"),
    ("report", "thread_ids_json TEXT NOT NULL DEFAULT '[]'"),
    ("report", "project_id TEXT"),
    ("source", f"workspace_id TEXT NOT NULL DEFAULT '{DEFAULT_WORKSPACE_ID}'"),
    ("project", f"workspace_id TEXT NOT NULL DEFAULT '{DEFAULT_WORKSPACE_ID}'"),
    ("thread", f"workspace_id TEXT NOT NULL DEFAULT '{DEFAULT_WORKSPACE_ID}'"),
    ("evidence", f"workspace_id TEXT NOT NULL DEFAULT '{DEFAULT_WORKSPACE_ID}'"),
    ("todo", f"workspace_id TEXT NOT NULL DEFAULT '{DEFAULT_WORKSPACE_ID}'"),
    ("note", f"workspace_id TEXT NOT NULL DEFAULT '{DEFAULT_WORKSPACE_ID}'"),
    ("report", f"workspace_id TEXT NOT NULL DEFAULT '{DEFAULT_WORKSPACE_ID}'"),
]


def _backfill_projects(conn: sqlite3.Connection) -> None:
    existing_tables = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    if "project" not in existing_tables or "thread" not in existing_tables:
        return

    thread_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(thread)").fetchall()
    }
    if "project" not in thread_columns or "project_id" not in thread_columns:
        return

    names = [
        row["project"]
        for row in conn.execute(
            "SELECT DISTINCT project FROM thread WHERE project IS NOT NULL AND TRIM(project) != ''"
        ).fetchall()
    ]
    if not names:
        return

    for raw_name in names:
        name = raw_name.strip()
        existing = conn.execute(
            "SELECT id FROM project WHERE name = ? COLLATE NOCASE LIMIT 1",
            (name,),
        ).fetchone()
        if existing:
            continue
        now = now_iso()
        conn.execute(
            "INSERT INTO project (id,name,status,owner,summary,color,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (new_id("prj"), name, "active", None, "", None, now, now),
        )

    rows = conn.execute(
        "SELECT id, project FROM thread WHERE project_id IS NULL AND project IS NOT NULL AND TRIM(project) != ''"
    ).fetchall()
    for row in rows:
        name = row["project"].strip()
        project = conn.execute(
            "SELECT id FROM project WHERE name = ? COLLATE NOCASE LIMIT 1",
            (name,),
        ).fetchone()
        if project:
            conn.execute(
                "UPDATE thread SET project_id = ? WHERE id = ?",
                (project["id"], row["id"]),
            )


def _apply_schema_statements(conn: sqlite3.Connection) -> list[str]:
    skipped_index_statements: list[str] = []
    statements = [
        statement.strip()
        for statement in SCHEMA_PATH.read_text(encoding="utf-8").split(";")
        if statement.strip()
    ]
    for statement in statements:
        try:
            conn.execute(statement)
        except sqlite3.OperationalError as exc:
            normalized = statement.lstrip().upper()
            if normalized.startswith("CREATE INDEX") and "no such column" in str(exc):
                skipped_index_statements.append(statement)
                continue
            raise
    return skipped_index_statements


def rebuild_search_index(conn: sqlite3.Connection, workspace_id: str | None = None) -> None:
    if workspace_id:
        conn.execute("DELETE FROM search_fts WHERE workspace_id = ?", (workspace_id,))
        scope = "WHERE workspace_id = ?"
        params: tuple[str, ...] = (workspace_id,)
    else:
        conn.execute("DELETE FROM search_fts")
        scope = ""
        params = ()

    conn.execute(
        f"""
        INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
        SELECT 'project', id, workspace_id, name, summary
        FROM project
        {scope}
        """,
        params,
    )
    conn.execute(
        f"""
        INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
        SELECT 'thread', id, workspace_id, title,
               TRIM(COALESCE(summary, '') || ' ' || COALESCE(project, ''))
        FROM thread
        {scope}
        """,
        params,
    )
    conn.execute(
        f"""
        INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
        SELECT 'evidence', id, workspace_id, '', text
        FROM evidence
        {scope}
        """,
        params,
    )
    conn.execute(
        f"""
        INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
        SELECT 'todo', id, workspace_id, '', text
        FROM todo
        {scope}
        """,
        params,
    )
    conn.execute(
        f"""
        INSERT INTO search_fts (kind, ref_id, workspace_id, title, body)
        SELECT 'note', id, workspace_id, title, body_md
        FROM note
        {scope}
        """,
        params,
    )


def ensure_search_index(conn: sqlite3.Connection, *, rebuild: bool = False) -> bool:
    try:
        conn.execute(SEARCH_FTS_SQL)
        conn.executescript(SEARCH_TRIGGER_SQL)
        row = conn.execute("SELECT COUNT(*) AS count FROM search_fts").fetchone()
        if rebuild or not row or row["count"] == 0:
            rebuild_search_index(conn)
        return True
    except sqlite3.OperationalError:
        return False


def _ensure_default_workspace(conn: sqlite3.Connection) -> None:
    tables = {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    if "workspace" not in tables:
        return
    now = now_iso()
    conn.execute(
        """
        INSERT INTO workspace (id,name,theme_color,default_llm_profile_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO NOTHING
        """,
        (DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, "#5ee6c5", None, now, now),
    )


def ensure_schema(db_path: Path | None = None) -> None:
    conn = connect(db_path)
    try:
        skipped_indexes = _apply_schema_statements(conn)
        _ensure_default_workspace(conn)
        for table, column_def in MIGRATIONS:
            column_name = column_def.split()[0]
            existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            if column_name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
        _ensure_default_workspace(conn)
        _backfill_projects(conn)
        for statement in skipped_indexes:
            conn.execute(statement)
        ensure_search_index(conn, rebuild=True)
        conn.commit()
    finally:
        conn.close()


@contextmanager
def cursor(db_path: Path | None = None) -> Iterator[sqlite3.Cursor]:
    conn = connect(db_path)
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict:
    if row is None:
        return {}
    return {key: row[key] for key in row.keys()}
