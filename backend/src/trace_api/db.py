from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import default_data_dir

PACKAGE_DIR = Path(__file__).resolve().parent
SCHEMA_PATH = PACKAGE_DIR / "schema.sql"


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
    ("report", "thread_ids_json TEXT NOT NULL DEFAULT '[]'"),
]


def ensure_schema(db_path: Path | None = None) -> None:
    conn = connect(db_path)
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        for table, column_def in MIGRATIONS:
            column_name = column_def.split()[0]
            existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            if column_name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
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
