from __future__ import annotations

import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from .config import default_data_dir

PACKAGE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = PACKAGE_DIR / "schema.sql"
TZ = timezone(timedelta(hours=8))


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
]


def _now_iso() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


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
        now = _now_iso()
        conn.execute(
            "INSERT INTO project (id,name,status,owner,summary,color,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (f"prj_{uuid.uuid4().hex[:12]}", name, "active", None, "", None, now, now),
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


def ensure_schema(db_path: Path | None = None) -> None:
    conn = connect(db_path)
    try:
        skipped_indexes = _apply_schema_statements(conn)
        for table, column_def in MIGRATIONS:
            column_name = column_def.split()[0]
            existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            if column_name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
        _backfill_projects(conn)
        for statement in skipped_indexes:
            conn.execute(statement)
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
